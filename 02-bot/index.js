// WhatsApp Bot - Main Entry Point
// Receives messages from Twilio, processes with AI/Skills, sends back responses
// Now with persistent memory, skills framework, and scheduler

const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'config', '.env.local') });

// Initialize hooks system early (includes error alerter and smart router)
const hooks = require('./hooks');
hooks.initializeHooks();

// Initialize context dedup — patches contextEngine.build() so ALL callers
// automatically get per-request caching. Reduces 9 redundant context builds
// per message to 1 actual build + 8 cache hits.
try {
    const contextDedup = require('./lib/context-dedup');
    contextDedup.patchContextEngine();
    console.log('✅ Context dedup patched');
} catch (err) {
    console.log('⚠️  Context dedup not available:', err.message);
}

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));

// GitHub webhook needs raw body for signature verification
app.use('/github-webhook', bodyParser.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
    }
}));

// Default JSON parser for other routes
app.use(bodyParser.json());

// CORS - allow dashboard and other clients to call the API
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Import core modules
const aiHandler = require('./ai-handler');
const githubWebhook = require('./github-webhook');
const { getTelegramHandler, TelegramHandler } = require('./telegram-handler');
const MessagingPlatform = require('./lib/messaging-platform');
const chatRegistry = require('./lib/chat-registry');
const activeProject = require('./lib/active-project');
const ActionButtons = require('./lib/action-buttons');
const statusMessenger = require('./lib/status-messenger');

// Get Telegram handler singleton
const telegramHandler = getTelegramHandler();

// Import new systems (with graceful fallback if not installed)
let memory = null;
let skillRegistry = null;
let scheduler = null;
let projectIntelligence = null;
let actionExecutor = null;
let confirmationManager = null;

// Try to load Project Intelligence (the brain)
try {
    projectIntelligence = require('./lib/project-intelligence');
    projectIntelligence.initialize();
    console.log('✅ Project Intelligence loaded');
} catch (err) {
    console.log('⚠️  Project Intelligence not available:', err.message);
}

// Try to load Action Executor (auto-execution layer)
try {
    actionExecutor = require('./lib/action-executor');
    console.log('✅ Action Executor loaded');
} catch (err) {
    console.log('⚠️  Action Executor not available:', err.message);
}

// Try to load Confirmation Manager
try {
    confirmationManager = require('./lib/confirmation-manager');
    console.log('✅ Confirmation Manager loaded');
} catch (err) {
    console.log('⚠️  Confirmation Manager not available:', err.message);
}

// Try to load memory system
try {
    memory = require('./memory/memory-manager');
    console.log('✅ Memory system loaded');
} catch (err) {
    console.log('⚠️  Memory system not available:', err.message);
}

// Try to load skills framework
try {
    const { registry, loadSkills } = require('./skills');
    skillRegistry = registry;

    // Load all skills
    loadSkills(path.join(__dirname, 'skills'), {
        memory: memory,
        ai: aiHandler,
        config: {
            telegramHandler: telegramHandler
        }
    }).then(() => {
        console.log('✅ Skills framework loaded');
        console.log(`   Registered skills: ${skillRegistry.listSkills().map(s => s.name).join(', ')}`);
    }).catch(err => {
        console.log('⚠️  Skills loading error:', err.message);
    });
} catch (err) {
    console.log('⚠️  Skills framework not available:', err.message);
}

// Try to load scheduler
try {
    const { getScheduler } = require('./scheduler');
    // We'll initialize scheduler after Twilio client is ready
    console.log('✅ Scheduler module loaded');
} catch (err) {
    console.log('⚠️  Scheduler not available:', err.message);
}

// Twilio client (graceful if not configured)
let twilioClient = null;
try {
    if (process.env.TWILIO_ACCOUNT_SID?.startsWith('AC')) {
        twilioClient = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );
        console.log('✅ Twilio client initialized');
    } else {
        console.log('⚠️  Twilio not configured (add TWILIO_ACCOUNT_SID to .env)');
    }
} catch (err) {
    console.log('⚠️  Twilio initialization failed:', err.message);
}

// Initialize MessagingPlatform with Twilio client
if (twilioClient) {
    MessagingPlatform.setTwilioClient(twilioClient);
}

// Initialize Voice Handler for Twilio Voice calling
let voiceHandler = null;
try {
    const { voiceHandler: vh } = require('./voice-handler');
    voiceHandler = vh;
    if (twilioClient) {
        voiceHandler.initialize(twilioClient);
        console.log('✅ Voice Handler initialized');
    } else {
        console.log('⚠️  Voice Handler loaded but Twilio client not available');
    }
} catch (err) {
    console.log('⚠️  Voice Handler not available:', err.message);
}

// Initialize Alert Escalation system
let alertEscalation = null;
try {
    const { alertEscalation: ae } = require('./lib/alert-escalation');
    alertEscalation = ae;
    console.log('✅ Alert Escalation loaded');
} catch (err) {
    console.log('⚠️  Alert Escalation not available:', err.message);
}

// Send message function (used by scheduler for proactive messages)
// WhatsApp-only function for backward compatibility
async function sendWhatsAppMessage(message, toNumber = null) {
    if (!twilioClient) {
        console.log('[Mock] Would send WhatsApp:', message.substring(0, 50) + '...');
        return;
    }
    const recipient = toNumber || `whatsapp:${process.env.YOUR_WHATSAPP}`;
    try {
        await twilioClient.messages.create({
            body: message,
            from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
            to: recipient
        });
        console.log(`[${new Date().toISOString()}] WhatsApp message sent`);
    } catch (error) {
        console.error('Error sending WhatsApp message:', error.message);
    }
}

// Send Telegram message function
async function sendTelegramMessage(message, chatId = null) {
    const targetChatId = chatId || process.env.TELEGRAM_HQ_CHAT_ID;
    if (!telegramHandler || !targetChatId) {
        console.log('[Mock] Would send Telegram:', message.substring(0, 50) + '...');
        return false;
    }
    try {
        await telegramHandler.sendMessage(targetChatId, message);
        console.log(`[${new Date().toISOString()}] Telegram message sent`);
        return true;
    } catch (error) {
        console.error('Error sending Telegram message:', error.message);
        return false;
    }
}

// Initialize Alert Escalation with message senders
if (alertEscalation) {
    alertEscalation.initialize({
        telegram: sendTelegramMessage,
        whatsapp: sendWhatsAppMessage
    });
    console.log('✅ Alert Escalation senders configured');
}

/**
 * Send proactive message using default platform (Telegram first, WhatsApp backup)
 * @param {string} message - Message to send
 * @param {string} alertLevel - 'critical', 'important', or 'info' (default: 'info')
 * @returns {Promise<void>}
 */
async function sendProactiveMessage(message, alertLevel = 'info') {
    const chatRegistry = require('./lib/chat-registry');
    const { MessagingPlatform, ALERT_LEVELS } = require('./lib/messaging-platform');

    // Get default chat (prefers Telegram HQ)
    const defaultChat = chatRegistry.getDefaultChat();
    const defaultPlatform = MessagingPlatform.getDefaultPlatform();

    // Send to primary platform (Telegram by default)
    if (defaultPlatform === 'telegram' && process.env.TELEGRAM_HQ_CHAT_ID) {
        await sendTelegramMessage(message, defaultChat?.chatId || process.env.TELEGRAM_HQ_CHAT_ID);
    } else if (defaultChat) {
        if (defaultChat.platform === 'telegram') {
            await sendTelegramMessage(message, defaultChat.chatId);
        } else {
            await sendWhatsAppMessage(message, defaultChat.chatId || process.env.YOUR_WHATSAPP);
        }
    } else {
        // Fallback to WhatsApp if nothing else configured
        await sendWhatsAppMessage(message);
    }

    // For critical alerts, also send to WhatsApp as backup
    if (MessagingPlatform.shouldUseWhatsAppBackup(alertLevel)) {
        const whatsappNumber = process.env.YOUR_WHATSAPP;
        if (whatsappNumber && twilioClient) {
            console.log('[Scheduler] Sending critical alert to WhatsApp backup');
            await sendWhatsAppMessage(message);
        }
    }
}

// Initialize scheduler with proactive message sender (uses Telegram by default)
try {
    const { getScheduler } = require('./scheduler');
    scheduler = getScheduler(memory, sendProactiveMessage);
    scheduler.start().then(() => {
        console.log('✅ Scheduler started (Telegram primary, WhatsApp backup)');
    }).catch(err => {
        console.log('⚠️  Scheduler start error:', err.message);
    });
} catch (err) {
    // Already logged above
}

// ================================================
// API ENDPOINTS (for MCP Server & Claude Code App)
// ================================================

// API Authentication middleware
const apiAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    const validKey = process.env.CLAWDBOT_API_KEY || 'dev-key-change-me';

    if (apiKey !== validKey) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    next();
};

// GET /api/status - Get ClawdBot status
app.get('/api/status', apiAuth, (req, res) => {
    const stats = memory ? memory.getStats(process.env.YOUR_WHATSAPP) : null;
    const skills = skillRegistry ? skillRegistry.listSkills() : [];

    res.json({
        success: true,
        status: 'online',
        uptime: process.uptime(),
        version: '2.3',
        features: {
            memory: !!memory,
            skills: !!skillRegistry,
            scheduler: !!scheduler,
            projectIntelligence: !!projectIntelligence,
            actionExecutor: !!actionExecutor
        },
        skillCount: skills.length,
        stats
    });
});

// POST /api/message - Send a message (full conversational pipeline, same as Telegram)
app.post('/api/message', apiAuth, async (req, res) => {
    try {
        const { message, userId, chatId } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const effectiveUserId = userId || chatId || 'dashboard-coworker';
        const platform = 'dashboard';

        // Detect Coworker Mode — skip skills, go straight to conversational AI
        const isCoworkerMode = message.startsWith('[Dashboard Coworker Mode]');
        const cleanMessage = isCoworkerMode
            ? message.replace('[Dashboard Coworker Mode] ', '').trim()
            : message;

        // Get auto-context from chat registry (use HQ context for dashboard)
        let autoRepo = null;
        let autoCompany = null;
        try {
            const chatRegistry = require('./lib/chat-registry');
            const ctx = chatRegistry.getContext(effectiveUserId);
            if (ctx) {
                autoRepo = ctx.type === 'repo' ? ctx.value : null;
                autoCompany = ctx.type === 'company' ? ctx.value : null;
            }
        } catch (e) { /* chat registry optional */ }

        // Save to memory
        if (memory) {
            memory.saveMessage(effectiveUserId, 'user', cleanMessage);
        }

        let response = null;
        let handled = false;

        // Coworker Mode: skip skills entirely, go direct to AI with full context
        // Regular API messages: try skills first, then AI fallback
        if (!isCoworkerMode) {
            // Preprocess with smart router (with auto-context)
            const processedMsg = await hooks.preprocess(cleanMessage, {
                userId: effectiveUserId,
                autoRepo,
                autoCompany,
            });

            // Try skills first (with full context)
            if (skillRegistry) {
                const result = await skillRegistry.route(processedMsg, {
                    userId: effectiveUserId,
                    memory: memory,
                    autoRepo,
                    autoCompany,
                    platform,
                });

                if (result && result.handled) {
                    response = result.message;
                    handled = true;
                }
            }
        }

        // AI handler with full context engine (same as Telegram pipeline)
        if (!handled) {
            let richContext = null;
            try {
                const contextEngine = require('./lib/context-engine');
                richContext = await contextEngine.build({
                    chatId: effectiveUserId,
                    userId: effectiveUserId,
                    platform,
                    message: cleanMessage,
                    autoRepo,
                    autoCompany,
                });
            } catch (ctxErr) {
                console.error('[API/message] Context engine build failed:', ctxErr.message);
            }

            response = await aiHandler.processQuery(cleanMessage, {
                userId: effectiveUserId,
                platform,
                autoRepo,
                autoCompany,
                richContext,
            });
        }

        // Save response and extract facts
        if (memory) {
            memory.saveMessage(effectiveUserId, 'assistant', response);
            extractAndSaveFacts(effectiveUserId, cleanMessage);
        }

        res.json({
            success: true,
            message: response,
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/projects - List all projects
app.get('/api/projects', apiAuth, async (req, res) => {
    try {
        const projectManager = require('./lib/project-manager');
        const repos = await projectManager.listRepos();

        res.json({
            success: true,
            count: repos.length,
            projects: repos
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/project/:repo/status - Get project status (TODO.md)
app.get('/api/project/:repo/status', apiAuth, async (req, res) => {
    try {
        const projectManager = require('./lib/project-manager');
        const todoParser = require('./lib/todo-parser');

        const repo = req.params.repo;
        const todoContent = await projectManager.fetchFile(repo, 'TODO.md');

        if (!todoContent) {
            return res.json({
                success: true,
                repo,
                hasTodo: false,
                message: 'No TODO.md found'
            });
        }

        const parsed = todoParser.parse(todoContent);

        res.json({
            success: true,
            repo,
            hasTodo: true,
            tasks: parsed
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/project/:repo/deploy - Trigger deployment
app.post('/api/project/:repo/deploy', apiAuth, async (req, res) => {
    try {
        const commandWhitelist = require('./lib/command-whitelist');
        const repo = req.params.repo;

        // Verify deployment is allowed
        const deployCmd = commandWhitelist.getCommand('deploy', repo);
        if (!deployCmd) {
            return res.status(400).json({ error: `Deployment not configured for ${repo}` });
        }

        // Execute deployment
        const { exec } = require('child_process');
        const result = await new Promise((resolve, reject) => {
            exec(deployCmd.command, { timeout: 120000 }, (error, stdout, stderr) => {
                if (error) reject(error);
                else resolve({ stdout, stderr });
            });
        });

        res.json({
            success: true,
            repo,
            output: result.stdout,
            errors: result.stderr
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/project/:repo/command - Run whitelisted command
app.post('/api/project/:repo/command', apiAuth, async (req, res) => {
    try {
        const commandWhitelist = require('./lib/command-whitelist');
        const repo = req.params.repo;
        const { command } = req.body;

        if (!command) {
            return res.status(400).json({ error: 'Command is required' });
        }

        // Verify command is whitelisted
        const allowedCmd = commandWhitelist.getCommand(command, repo);
        if (!allowedCmd) {
            return res.status(403).json({
                error: `Command '${command}' not allowed for ${repo}`,
                allowed: commandWhitelist.listCommands(repo)
            });
        }

        // Execute command
        const { exec } = require('child_process');
        const result = await new Promise((resolve, reject) => {
            exec(allowedCmd.command, { timeout: 60000 }, (error, stdout, stderr) => {
                if (error) reject(error);
                else resolve({ stdout, stderr });
            });
        });

        res.json({
            success: true,
            repo,
            command,
            output: result.stdout,
            errors: result.stderr
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/memory - Get conversation memory
app.get('/api/memory', apiAuth, (req, res) => {
    try {
        const userId = req.query.userId || process.env.YOUR_WHATSAPP;
        const limit = parseInt(req.query.limit) || 20;

        if (!memory) {
            return res.json({ success: true, messages: [], facts: [] });
        }

        const messages = memory.getConversation(userId, limit);
        const facts = memory.getFacts(userId);
        const stats = memory.getStats(userId);

        res.json({
            success: true,
            userId,
            messages,
            facts,
            stats
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/whatsapp/send - Send WhatsApp message directly
app.post('/api/whatsapp/send', apiAuth, async (req, res) => {
    try {
        const { message, to } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        await sendWhatsAppMessage(message, to ? `whatsapp:${to}` : null);

        res.json({
            success: true,
            sent: true,
            to: to || process.env.YOUR_WHATSAPP
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/skills - List all available skills
app.get('/api/skills', apiAuth, (req, res) => {
    try {
        const skills = skillRegistry ? skillRegistry.listSkills() : [];

        res.json({
            success: true,
            count: skills.length,
            skills: skills.map(s => ({
                name: s.name,
                description: s.description,
                priority: s.priority,
                commands: s.commands?.map(c => c.usage || c.pattern?.toString())
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/logs - Get recent activity logs
app.get('/api/logs', apiAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const level = req.query.level || null;
    const source = req.query.source || null;
    
    const activityLog = require('./lib/activity-log');
    let logs = activityLog.getRecent(limit);
    
    if (level) {
        logs = logs.filter(l => l.level === level);
    }
    if (source) {
        logs = logs.filter(l => l.source === source);
    }
    
    res.json({
        success: true,
        count: logs.length,
        logs
    });
});

// GET /api/activity - Get live activity feed (activity level only)
app.get('/api/activity', apiAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const activityLog = require('./lib/activity-log');
    const logs = activityLog.getRecent(limit).filter(l => l.level === 'activity');
    
    res.json({
        success: true,
        count: logs.length,
        activities: logs
    });
});

// ================================================
// LIVE AGENT VISIBILITY ENDPOINTS
// ================================================

// GET /api/live/state - Unified live state for dashboard
app.get('/api/live/state', apiAuth, (req, res) => {
    const activityLog = require('./lib/activity-log');
    const taskQueue = require('./lib/task-queue');
    const confirmationManager = require('./lib/confirmation-manager');
    const database = require('./lib/database');

    // Current task — most recent activity
    const recentActivity = activityLog.getRecent(1);

    // Agents — main bot always present, plus any running Claude Code sessions
    const agents = [{
        id: 'main',
        name: 'ClawdBot',
        type: 'main',
        status: 'active',
        uptime: process.uptime()
    }];

    for (const [taskId, running] of taskQueue.running) {
        agents.push({
            id: taskId,
            name: 'Claude Code Session',
            type: 'claude-code',
            status: 'running',
            startedAt: running.startTime,
            pid: running.pid || null,
            task: running.task?.params?.task || 'Unknown task'
        });
    }

    // Task queue status
    const queueStatus = taskQueue.getStatus();

    // Pending confirmations
    const pendingConfirmations = confirmationManager.getAllPending();

    // Recent outcomes from SQLite
    let recentOutcomes = [];
    const db = database.getDb ? database.getDb() : null;
    if (db) {
        try {
            recentOutcomes = db.prepare(
                'SELECT * FROM outcomes ORDER BY created_at DESC LIMIT 10'
            ).all();
        } catch (e) { /* table may not exist yet */ }
    }

    // Recent deployments from SQLite
    let recentDeployments = [];
    if (db) {
        try {
            recentDeployments = db.prepare(
                'SELECT * FROM deployments ORDER BY created_at DESC LIMIT 5'
            ).all();
        } catch (e) { /* table may not exist yet */ }
    }

    // Active conversation sessions
    let activeSessions = [];
    try {
        const conversationSession = require('./lib/conversation-session');
        if (conversationSession.getAllSessions) {
            activeSessions = conversationSession.getAllSessions();
        }
    } catch (e) { /* module may not be loaded */ }

    // Activity timeline (last 50)
    const timeline = activityLog.getRecent(50);

    res.json({
        success: true,
        timestamp: new Date().toISOString(),
        currentTask: recentActivity[0] || null,
        agents,
        taskQueue: queueStatus,
        pendingConfirmations,
        recentOutcomes,
        recentDeployments,
        activeSessions,
        timeline,
        uptime: process.uptime(),
        memoryUsage: {
            heapMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)
        }
    });
});

// GET /api/live/outcomes - Filterable outcome history
app.get('/api/live/outcomes', apiAuth, (req, res) => {
    const database = require('./lib/database');
    const db = database.getDb ? database.getDb() : null;
    if (!db) return res.json({ success: true, count: 0, outcomes: [] });

    const limit = parseInt(req.query.limit) || 20;
    const type = req.query.type || null;

    let outcomes = [];
    try {
        if (type) {
            outcomes = db.prepare(
                'SELECT * FROM outcomes WHERE action_type = ? ORDER BY created_at DESC LIMIT ?'
            ).all(type, limit);
        } else {
            outcomes = db.prepare(
                'SELECT * FROM outcomes ORDER BY created_at DESC LIMIT ?'
            ).all(limit);
        }
    } catch (e) { /* table may not exist yet */ }

    res.json({ success: true, count: outcomes.length, outcomes });
});

// GET /api/live/sessions - Claude Code session history
app.get('/api/live/sessions', apiAuth, (req, res) => {
    const database = require('./lib/database');
    const db = database.getDb ? database.getDb() : null;
    if (!db) return res.json({ success: true, count: 0, sessions: [] });

    const limit = parseInt(req.query.limit) || 10;

    let sessions = [];
    try {
        sessions = db.prepare(
            'SELECT * FROM claude_code_sessions ORDER BY created_at DESC LIMIT ?'
        ).all(limit);
    } catch (e) { /* table may not exist yet */ }

    res.json({ success: true, count: sessions.length, sessions });
});

// GET /api/live/deployments - Deployment history
app.get('/api/live/deployments', apiAuth, (req, res) => {
    const database = require('./lib/database');
    const db = database.getDb ? database.getDb() : null;
    if (!db) return res.json({ success: true, count: 0, deployments: [] });

    const limit = parseInt(req.query.limit) || 10;
    const repo = req.query.repo || null;

    let deployments = [];
    try {
        if (repo) {
            deployments = db.prepare(
                'SELECT * FROM deployments WHERE repo = ? ORDER BY created_at DESC LIMIT ?'
            ).all(repo, limit);
        } else {
            deployments = db.prepare(
                'SELECT * FROM deployments ORDER BY created_at DESC LIMIT ?'
            ).all(limit);
        }
    } catch (e) { /* table may not exist yet */ }

    res.json({ success: true, count: deployments.length, deployments });
});

// ================================================
// END API ENDPOINTS
// ================================================

// Health check endpoint
app.get('/health', (req, res) => {
    const stats = memory ? memory.getStats(process.env.YOUR_WHATSAPP) : null;

    res.json({
        status: 'online',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: {
            heapUsed: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB'
        },
        features: {
            persistentMemory: !!memory,
            skillsFramework: !!skillRegistry,
            scheduler: !!scheduler,
            smartRouter: !!hooks.smartRouter,
            voiceCalling: voiceHandler ? voiceHandler.isAvailable() : false
        },
        stats: stats
    });
});

// ================================================
// VOICE CALLING ENDPOINTS (Twilio Voice)
// ================================================

// Voice outbound TwiML - generates speech for outbound calls
app.post('/voice/outbound', (req, res) => {
    if (!voiceHandler) {
        res.type('text/xml').send('<Response><Say>Voice handler not available.</Say><Hangup/></Response>');
        return;
    }

    const message = req.query.message || 'Hello from ClawdBot';
    const voice = req.query.voice || 'amy';
    const allowResponse = req.query.allowResponse !== 'false';
    const urgent = req.query.urgent === 'true';

    console.log(`[Voice] Outbound TwiML request: message="${message.substring(0, 50)}...", voice=${voice}`);

    const twiml = voiceHandler.generateOutboundTwiML(message, {
        voice,
        allowResponse,
        urgent
    });

    res.type('text/xml').send(twiml);
});

// Voice response handler - processes speech input during calls
app.post('/voice/response', async (req, res) => {
    if (!voiceHandler) {
        res.type('text/xml').send('<Response><Say>Voice handler not available.</Say><Hangup/></Response>');
        return;
    }

    const speechResult = req.body.SpeechResult || '';
    const callSid = req.body.CallSid;

    console.log(`[Voice] Speech response on call ${callSid}: "${speechResult}"`);

    try {
        const twiml = await voiceHandler.handleSpeechResponse(speechResult, callSid, {
            confidence: req.body.Confidence,
            from: req.body.From,
            to: req.body.To
        });

        res.type('text/xml').send(twiml);
    } catch (err) {
        console.error('[Voice] Response handler error:', err.message);
        res.type('text/xml').send(`<Response><Say>Sorry, I had trouble processing that.</Say><Hangup/></Response>`);
    }
});

// Voice status callback - receives call status updates
app.post('/voice/status', (req, res) => {
    if (voiceHandler) {
        voiceHandler.handleCallStatus(req.body);
    }

    console.log(`[Voice] Call status: ${req.body.CallSid} - ${req.body.CallStatus}`);
    res.sendStatus(200);
});

// ================================================
// END VOICE CALLING ENDPOINTS
// ================================================

// GitHub webhook endpoint - receives events and forwards to appropriate chats
// Dedup cache for GitHub webhook delivery IDs (prevents duplicate notifications)
const recentDeliveryIds = new Map();
function isDeduplicateWebhook(deliveryId) {
    if (!deliveryId) return false;
    if (recentDeliveryIds.has(deliveryId)) return true;
    recentDeliveryIds.set(deliveryId, Date.now());
    // Clean old entries (keep last 5 minutes)
    if (recentDeliveryIds.size > 200) {
        const cutoff = Date.now() - 5 * 60 * 1000;
        for (const [id, time] of recentDeliveryIds) {
            if (time < cutoff) recentDeliveryIds.delete(id);
        }
    }
    return false;
}

app.post('/github-webhook', async (req, res) => {
    try {
        const eventType = req.headers['x-github-event'];
        const signature = req.headers['x-hub-signature-256'];
        const deliveryId = req.headers['x-github-delivery'];
        const repoName = req.body.repository?.name || 'unknown';

        console.log(`[${new Date().toISOString()}] GitHub webhook: ${eventType} from ${repoName} (${deliveryId})`);

        // Deduplicate: skip if we already processed this delivery
        if (isDeduplicateWebhook(deliveryId)) {
            console.log(`[GitHub Webhook] Duplicate delivery ${deliveryId}, skipping`);
            return res.json({ status: 'duplicate', deliveryId });
        }

        // Verify signature if secret is configured
        if (!githubWebhook.verifySignature(req.rawBody || JSON.stringify(req.body), signature)) {
            console.log('[GitHub Webhook] Signature verification failed');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Format the event into a message
        const message = githubWebhook.formatEvent(eventType, req.body);

        // Trigger alert escalation for critical events (CI failures, security alerts)
        // This enables automatic Telegram -> WhatsApp -> Voice Call escalation
        try {
            const alertId = await githubWebhook.escalateIfCritical(eventType, req.body);
            if (alertId) {
                console.log(`[GitHub Webhook] Alert escalation triggered: ${alertId}`);
            }
        } catch (escalationErr) {
            console.error('[GitHub Webhook] Alert escalation error:', escalationErr.message);
        }

        let notifiedCount = 0;

        if (message) {
            // Get notification targets based on repo and event criticality
            const { targets, isCritical, repo } = githubWebhook.getNotificationTargets(eventType, req.body);

            if (targets.length > 0) {
                // Send to all targeted chats that should receive this notification
                for (const chat of targets) {
                    // Double-check notification level filter
                    if (githubWebhook.shouldNotifyChat(chat, eventType, req.body)) {
                        try {
                            // Determine platform and send
                            const platform = chat.platform || 'whatsapp';
                            await MessagingPlatform.sendToRecipient(message, platform, chat.chatId);
                            notifiedCount++;
                            console.log(`[GitHub Webhook] Sent to ${chat.chatId} (${platform}): "${message.substring(0, 40)}..."`);
                        } catch (sendError) {
                            console.error(`[GitHub Webhook] Failed to send to ${chat.chatId}:`, sendError.message);
                        }
                    }
                }
            }

            // Fallback to HQ/default chat if no specific targets were notified
            // Uses Telegram as primary, WhatsApp as backup
            if (notifiedCount === 0) {
                const defaultChat = githubWebhook.getDefaultHQChat();
                if (defaultChat) {
                    try {
                        await MessagingPlatform.sendToRecipient(message, defaultChat.platform, defaultChat.chatId);
                        notifiedCount = 1;
                        console.log(`[GitHub Webhook] Sent to HQ (${defaultChat.platform} fallback): "${message.substring(0, 40)}..."`);

                        // For critical events, also send to WhatsApp as backup
                        if (isCritical && defaultChat.platform === 'telegram') {
                            const whatsappNumber = process.env.YOUR_WHATSAPP;
                            if (whatsappNumber) {
                                await sendWhatsAppMessage(message);
                                console.log(`[GitHub Webhook] Critical alert also sent to WhatsApp backup`);
                            }
                        }
                    } catch (sendErr) {
                        console.error(`[GitHub Webhook] Failed to send to default HQ:`, sendErr.message);
                    }
                }
            }

            console.log(`[GitHub Webhook] Notified ${notifiedCount} chat(s) for ${repo}`);
        } else {
            console.log(`[GitHub Webhook] Event ignored: ${eventType}/${req.body.action || 'no-action'}`);
        }

        // Auto-deploy to Vercel on push to default branch (main/master)
        if (eventType === 'push') {
            const pushRef = req.body.ref || '';
            const pushRepo = req.body.repository?.name;
            const defaultBranch = req.body.repository?.default_branch || 'main';
            const isDefaultBranch = pushRef === `refs/heads/${defaultBranch}`;

            if (isDefaultBranch && pushRepo && process.env.VERCEL_TOKEN) {
                const targetChat = chatRegistry.getChatForRepo(pushRepo);
                const telegram = getTelegramHandler();
                const pusher = req.body.pusher?.name || 'unknown';
                const commitMsg = req.body.head_commit?.message?.split('\n')[0] || 'no message';

                console.log(`[AutoDeploy] Push to ${pushRepo}/${defaultBranch} by ${pusher} — triggering Vercel deploy`);

                // Send "deploying..." message
                if (targetChat && telegram?.isAvailable()) {
                    try {
                        await telegram.sendMessage(targetChat,
                            `🚀 *Auto-deploying ${pushRepo}*\n\nPush to \`${defaultBranch}\` by ${pusher}:\n_"${commitMsg}"_\n\nDeploying to Vercel production...`
                        );
                    } catch (e) { /* ignore send error */ }
                }

                // Run deploy in background (don't block webhook response)
                setImmediate(async () => {
                    try {
                        const { getProjectPath, sanitizeArgument } = require('./lib/command-whitelist');
                        const { exec } = require('child_process');
                        const { promisify } = require('util');
                        const execAsync = promisify(exec);

                        const projectPath = getProjectPath(sanitizeArgument(pushRepo));
                        if (!projectPath.valid) {
                            console.log(`[AutoDeploy] Unknown project path for ${pushRepo}, skipping`);
                            return;
                        }

                        // Git pull first to get latest code
                        console.log(`[AutoDeploy] Pulling latest code for ${pushRepo}...`);
                        try {
                            await execAsync('git pull origin ' + defaultBranch, {
                                cwd: projectPath.path,
                                timeout: 30000
                            });
                        } catch (pullErr) {
                            console.log(`[AutoDeploy] Git pull failed (may not be a git repo): ${pullErr.message}`);
                        }

                        // Deploy to Vercel
                        console.log(`[AutoDeploy] Running vercel --prod for ${pushRepo}...`);
                        const startTime = Date.now();
                        const result = await execAsync(
                            `vercel --prod --token ${process.env.VERCEL_TOKEN} --yes`,
                            { cwd: projectPath.path, timeout: 180000 }
                        );

                        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                        const output = (result.stdout || '') + (result.stderr || '');
                        const urlMatch = output.match(/(https:\/\/[^\s]+\.vercel\.app)/);
                        const deployUrl = urlMatch ? urlMatch[1] : null;

                        console.log(`[AutoDeploy] ${pushRepo} deployed in ${duration}s${deployUrl ? ` → ${deployUrl}` : ''}`);

                        // Save to database
                        try {
                            const db = require('./lib/database');
                            db.saveDeployment(pushRepo, {
                                platform: 'vercel-prod',
                                url: deployUrl,
                                status: 'completed',
                                triggeredBy: 'auto-deploy',
                                chatId: targetChat
                            });
                        } catch (e) { /* ignore */ }

                        // Track outcome
                        try {
                            const outcomeTracker = require('./lib/outcome-tracker');
                            const oid = outcomeTracker.startAction({
                                chatId: targetChat || pushRepo,
                                userId: 'auto-deploy',
                                actionType: 'deploy',
                                actionDetail: `Auto-deploy ${pushRepo} on push to ${defaultBranch}`,
                                repo: pushRepo,
                            });
                            outcomeTracker.completeAction(oid, {
                                result: 'success',
                                resultDetail: `Deployed in ${duration}s`,
                                deployUrl,
                                durationMs: Date.now() - startTime,
                            });
                        } catch (e) { /* ignore */ }

                        // Send success message
                        if (targetChat && telegram?.isAvailable()) {
                            let msg = `✅ *${pushRepo} deployed to Vercel!*\n\n`;
                            if (deployUrl) msg += `🔗 ${deployUrl}\n`;
                            msg += `⏱️ ${duration}s`;
                            await telegram.sendMessage(targetChat, msg);
                        }
                    } catch (deployErr) {
                        console.error(`[AutoDeploy] Failed for ${pushRepo}:`, deployErr.message);

                        // Track failure
                        try {
                            const outcomeTracker = require('./lib/outcome-tracker');
                            const oid = outcomeTracker.startAction({
                                chatId: targetChat || pushRepo,
                                userId: 'auto-deploy',
                                actionType: 'deploy',
                                actionDetail: `Auto-deploy ${pushRepo} failed`,
                                repo: pushRepo,
                            });
                            outcomeTracker.completeAction(oid, {
                                result: 'failed',
                                resultDetail: deployErr.message,
                            });
                        } catch (e) { /* ignore */ }

                        // Send human-friendly failure message
                        if (targetChat && telegram?.isAvailable()) {
                            try {
                                const { formatDeployError } = require('./lib/telegram-sanitizer');
                                await telegram.sendMessage(targetChat, formatDeployError(pushRepo, deployErr));
                            } catch (e) { /* ignore */ }
                        }
                    }
                });
            }
        }

        // Auto-deploy suggestion on PR merge (for repos without Vercel token)
        if (eventType === 'pull_request' && req.body.action === 'closed' && req.body.pull_request?.merged && !process.env.VERCEL_TOKEN) {
            const mergedRepo = req.body.repository?.name;
            const targetChat = chatRegistry.getChatForRepo(mergedRepo);

            if (targetChat && mergedRepo) {
                const prTitle = req.body.pull_request.title;
                try {
                    const telegram = getTelegramHandler();
                    if (telegram?.isAvailable()) {
                        await telegram.sendMessage(targetChat,
                            `✅ PR merged: *${prTitle}*\n\nWould you like me to deploy *${mergedRepo}*? Reply "deploy to vercel" to deploy.`
                        );
                    }
                } catch (autoDeployErr) {
                    console.error('[GitHub Webhook] Auto-deploy suggestion error:', autoDeployErr.message);
                }
            }
        }

        // Always respond 200 to GitHub
        res.status(200).json({
            received: true,
            event: eventType,
            repo: repoName,
            notified: notifiedCount
        });
    } catch (error) {
        console.error('[GitHub Webhook] Error:', error.message);
        // Still respond 200 to prevent GitHub from retrying
        res.status(200).json({
            received: true,
            error: error.message
        });
    }
});

// Main webhook endpoint for incoming WhatsApp messages
// Uses async processing to avoid Twilio's 15-second timeout
app.post('/webhook', async (req, res) => {
    try {
        const incomingMsg = req.body.Body?.trim() || '';
        const fromNumber = req.body.From;
        const userId = fromNumber.replace('whatsapp:', '');

        console.log(`[${new Date().toISOString()}] Received: "${incomingMsg}" from ${fromNumber}`);

        // Only respond to authorized number
        const authorizedNumber = process.env.YOUR_WHATSAPP;
        if (fromNumber !== `whatsapp:${authorizedNumber}`) {
            console.log(`Unauthorized number: ${fromNumber}`);
            return res.status(403).send('Unauthorized');
        }

        // IMPORTANT: Respond to Twilio immediately to avoid timeout
        // Then process message asynchronously
        res.status(200).send('OK');

        // Extract media info from Twilio request (for receipt/image handling)
        const numMedia = parseInt(req.body.NumMedia || '0', 10);
        const mediaUrl = numMedia > 0 ? req.body.MediaUrl0 : null;
        const mediaContentType = numMedia > 0 ? req.body.MediaContentType0 : null;

        // Process message in background (non-blocking)
        processMessageAsync(incomingMsg, fromNumber, userId, { numMedia, mediaUrl, mediaContentType })
            .catch(err => console.error('[Async] Error processing message:', err.message));

        return; // Already responded
    } catch (error) {
        console.error('Error in webhook:', error);
        if (!res.headersSent) {
            res.status(500).send('Internal Server Error');
        }
    }
});

// Telegram webhook endpoint
app.post('/telegram', async (req, res) => {
    try {
        const update = req.body;

        // Handle callback queries (inline keyboard button presses)
        if (update.callback_query) {
            const callbackQuery = update.callback_query;
            const chatId = callbackQuery.message?.chat?.id;
            const callbackData = callbackQuery.data;

            console.log(`[${new Date().toISOString()}] Telegram callback: "${callbackData}" from ${chatId}`);

            // Check authorization
            if (!telegramHandler.isAuthorized(chatId)) {
                console.log(`[Telegram] Unauthorized callback: ${chatId}`);
                return res.status(200).json({ ok: true });
            }

            // Respond to Telegram immediately
            res.status(200).json({ ok: true });

            // Acknowledge the callback query to remove loading state
            try {
                await telegramHandler.answerCallback(callbackQuery.id);
            } catch (e) {
                // Callback may have already been answered
            }

            // Send typing indicator
            await telegramHandler.sendTypingIndicator(chatId).catch(() => {});

            // Create a minimal context object for the callback handler
            const ctx = {
                callbackQuery,
                answerCbQuery: async (text, showAlert) => {
                    await telegramHandler.answerCallback(callbackQuery.id, text, showAlert);
                },
                editMessageText: async (text, options = {}) => {
                    const messageId = callbackQuery.message?.message_id;
                    if (messageId) {
                        await telegramHandler.editMessage(chatId, messageId, text, options.reply_markup?.inline_keyboard);
                    }
                }
            };

            // Process callback in background
            handleTelegramCallback(callbackData, chatId, ctx)
                .catch(err => console.error('[Telegram Callback Async] Error:', err.message));

            return;
        }

        // Handle message updates
        const message = update.message || update.edited_message;
        if (!message) {
            return res.status(200).json({ ok: true });
        }

        const chatId = message.chat?.id?.toString();
        const text = (message.text || message.caption || '').trim();

        console.log(`[${new Date().toISOString()}] Telegram: "${text}" from ${chatId}`);

        // Check authorization
        if (!telegramHandler.isAuthorized(chatId)) {
            console.log(`[Telegram] Unauthorized chat: ${chatId}`);
            return res.status(200).json({ ok: true }); // Always 200 for Telegram
        }

        // Respond to Telegram immediately
        res.status(200).json({ ok: true });

        // Send typing indicator
        await telegramHandler.sendTypingIndicator(chatId).catch(() => {});

        // Extract media info (async - need to fetch file URLs from Telegram)
        const mediaInfo = await telegramHandler.extractMediaInfo(message).catch(() => ({
            numMedia: 0,
            mediaUrl: null,
            mediaContentType: null
        }));

        // Process message in background using shared pipeline
        processMessageAsync(text, chatId, chatId, {
            numMedia: mediaInfo.numMedia,
            mediaUrl: mediaInfo.mediaUrl,
            mediaContentType: mediaInfo.mediaContentType
        }, 'telegram')
            .catch(err => console.error('[Telegram Async] Error:', err.message));

        return;
    } catch (error) {
        console.error('Error in Telegram webhook:', error);
        if (!res.headersSent) {
            res.status(200).json({ ok: true, error: error.message });
        }
    }
});

/**
 * Detect if a text message is a substantial coding instruction that should trigger the plan flow.
 * Same logic as voice detection (codingKeywords + codingContext) but for text.
 * Returns true if the message should create a plan, false otherwise.
 */
function detectTextPlanCandidate(message) {
    if (!message || typeof message !== 'string') return false;

    const msg = message.trim();
    const wordCount = msg.split(/\s+/).length;

    // Don't trigger for very short messages
    if (wordCount < 5) return false;

    // Don't trigger for questions
    if (/\?\s*$/.test(msg)) return false;

    // Don't trigger for greetings/acknowledgments
    if (/^(hey|hi|hello|yo|thanks|ok|sure|yes|no|yeah|nah)\s*[!.]*$/i.test(msg)) return false;

    const codingKeywords = ['add', 'create', 'build', 'implement', 'make', 'change', 'update', 'modify',
        'fix', 'remove', 'delete', 'move', 'replace', 'redesign', 'refactor', 'style', 'integrate',
        'connect', 'optimize', 'improve', 'scaffold', 'set up', 'setup'];
    const codingContextWords = ['page', 'component', 'feature', 'button', 'nav', 'navigation', 'sidebar',
        'header', 'footer', 'form', 'modal', 'layout', 'design', 'app', 'site', 'api', 'endpoint',
        'function', 'database', 'table', 'screen', 'view', 'section', 'bar', 'menu', 'route',
        'middleware', 'auth', 'login', 'dashboard', 'project', 'tool', 'service'];

    const msgLower = msg.toLowerCase();
    const hasCodingKeyword = codingKeywords.some(kw => msgLower.includes(kw));
    const hasCodingContext = codingContextWords.some(kw => msgLower.includes(kw));

    // Project creation intent: "build/create/make an app/tool/project"
    const hasProjectIntent = /\b(build|create|make|start|scaffold)\b.*\b(app|project|tool|website|service|bot|dashboard|prototype)\b/i.test(msg);

    // Trigger plan flow for:
    // 1. Coding keyword + coding context word (like "add a login page")
    // 2. Project creation intent with substantial length ("build me a task tracker app with...")
    // 3. Long message with coding keyword (>20 words with implementation details)
    return (hasCodingKeyword && hasCodingContext) ||
           (hasProjectIntent && wordCount > 8) ||
           (wordCount > 20 && hasCodingKeyword);
}

// Classify user response naturally - understands "yep", "sure", "go ahead", voice notes, etc.
async function classifyUserResponse(message, pendingAction) {
    const msg = (message || '').toLowerCase().trim();

    // Clear confirmations
    const confirmPatterns = [
        'yes', 'yep', 'yeah', 'yea', 'ya', 'ye',
        'sure', 'ok', 'okay', 'k',
        'go ahead', 'go for it', 'do it', 'proceed', 'confirm',
        'sounds good', 'looks good', 'perfect', 'great',
        'let\'s go', 'lets go', 'ship it', 'send it',
        'approved', 'approve', 'agreed', 'correct',
        'absolutely', 'definitely', 'for sure',
        'that\'s right', 'thats right', 'right',
        'make it happen', 'execute', 'run it',
        'please', 'please do', 'yes please',
        'go on', 'continue', 'carry on',
        'good', 'fine', 'alright', 'all good',
        'yup', 'uh huh', 'mhm', 'aye'
    ];

    // Clear rejections
    const rejectPatterns = [
        'no', 'nah', 'nope', 'cancel', 'stop',
        'don\'t', 'dont', 'never mind', 'nevermind',
        'forget it', 'scratch that', 'abort',
        'not now', 'not yet', 'hold on', 'wait',
        'wrong', 'incorrect', 'that\'s wrong'
    ];

    // Check for exact or starts-with match
    for (const pattern of confirmPatterns) {
        if (msg === pattern || msg.startsWith(pattern + ' ') || msg.startsWith(pattern + ',') || msg.startsWith(pattern + '.')) {
            return 'confirm';
        }
    }

    for (const pattern of rejectPatterns) {
        if (msg === pattern || msg.startsWith(pattern + ' ') || msg.startsWith(pattern + ',') || msg.startsWith(pattern + '.')) {
            return 'reject';
        }
    }

    // If the message is short and affirmative-sounding, it's probably a confirm
    if (msg.length < 20 && /^(👍|✅|🙌|💪|🤝|👌|✔️|🫡)/.test(msg)) {
        return 'confirm';
    }

    // Otherwise it's a clarification/modification
    return 'clarify';
}

// Telegram message processor - returns response text instead of sending
// Used by the Telegram long-polling handler which sends replies automatically
async function processMessageForTelegram(incomingMsg, context) {
    const { userId, chatId, platform, numMedia, mediaUrl, mediaContentType } = context;
    const activityLog = require('./lib/activity-log');

    try {
        // Log incoming message
        const isVoice = mediaContentType && mediaContentType.startsWith('audio/');
        activityLog.log('activity', 'telegram',
            isVoice ? `Voice message received from ${userId}` : `Message received: "${(incomingMsg || '').substring(0, 60)}..."`,
            { userId, platform, hasMedia: !!mediaUrl }
        );

        // Save incoming message to memory (skip empty messages like voice before transcription)
        if (memory && incomingMsg && incomingMsg.trim()) {
            try {
                memory.saveMessage(chatId || userId, 'user', incomingMsg);
            } catch (e) {
                console.error('[Memory] Save error:', e.message);
            }
        }

        // AUTO-CONTEXT: Check if this chat has a registered context
        let autoRepo = null;
        let autoCompany = null;
        const chatContext = chatRegistry.getContext(chatId || userId);

        if (chatContext && chatContext.type === 'repo' && chatContext.value) {
            autoRepo = chatContext.value;
            activeProject.setPermanentProject(userId, autoRepo);
            console.log(`[AutoContext] Telegram chat ${chatId} -> repo: ${autoRepo}`);
        } else if (chatContext && chatContext.type === 'company' && chatContext.value) {
            autoCompany = chatContext.value;
            console.log(`[AutoContext] Telegram chat ${chatId} -> company: ${autoCompany}`);
        }

        // SESSION RESUME — check if user is returning after inactivity
        try {
            const conversationSession = require('./lib/conversation-session');
            const resumeMsg = conversationSession.checkResume(chatId || userId);
            if (resumeMsg) {
                console.log(`[SessionResume] Resuming session for ${chatId || userId}`);
                const { getTelegramHandler } = require('./telegram-handler');
                const tg = getTelegramHandler();
                if (tg.isAvailable() && chatId) {
                    await tg.sendMessage(chatId, resumeMsg);
                }
            }
            // Touch session on any activity
            if (conversationSession.isActive(chatId || userId)) {
                conversationSession.touchSession(chatId || userId);
            }
        } catch (e) { /* conversation-session may not be loaded yet */ }

        // ITERATIVE FEEDBACK — if session is in 'iterating' mode, detect amendment requests
        if (incomingMsg && !mediaContentType?.startsWith('audio/')) {
            try {
                const conversationSession = require('./lib/conversation-session');
                const sessionMode = conversationSession.getMode(chatId || userId);
                if (sessionMode === 'iterating') {
                    const session = conversationSession.getSession(chatId || userId);
                    const isAmendment = /\b(change|update|modify|fix|adjust|tweak|also add|but make|instead|move|rename|swap|remove|delete)\b/i.test(incomingMsg);

                    if (isAmendment && session?.lastPrUrl && session?.lastBranch) {
                        console.log(`[Iterate] Amendment detected for PR: ${session.lastPrUrl}`);
                        activityLog.log('activity', 'iterate', `Amending PR: ${incomingMsg.substring(0, 60)}`, { userId });

                        try {
                            const planExecutor = require('./lib/plan-executor');
                            const { getTelegramHandler } = require('./telegram-handler');
                            const tg = getTelegramHandler();

                            const result = await planExecutor.amend({
                                prUrl: session.lastPrUrl,
                                feedback: incomingMsg,
                                branch: session.lastBranch,
                                repo: session.repo || autoRepo,
                                sendProgress: async (msg) => {
                                    if (tg.isAvailable() && chatId) {
                                        await tg.sendMessage(chatId, `⏳ ${msg}`);
                                    }
                                }
                            });

                            const responseText = result.success ? result.message : `Could not amend: ${result.message}`;
                            if (memory) memory.saveMessage(chatId || userId, 'assistant', responseText);
                            return responseText;
                        } catch (err) {
                            console.error('[Iterate] Amend error:', err.message);
                            // Fall through to normal processing
                        }
                    }
                }
            } catch (e) { /* ignore */ }
        }

        // CHECK FOR ACTIVE CONVERSATION CONTEXT (plans, confirmations)
        if (confirmationManager && confirmationManager.hasPending(userId)) {
            const pending = confirmationManager.getPending(userId);

            if (pending && (pending.action === 'voice_plan' || pending.action === 'text_plan')) {
                // If this is a voice note, transcribe it FIRST before processing
                let userMessage = incomingMsg;
                const isVoiceFollowUp = mediaContentType && mediaContentType.startsWith('audio/');

                if (isVoiceFollowUp && mediaUrl) {
                    console.log('[VoicePlan] Voice follow-up detected, transcribing first...');
                    activityLog.log('activity', 'voice', 'Transcribing voice follow-up...', { userId });

                    try {
                        // Use the voice skill to transcribe
                        const voiceSkillContext = { userId, chatId, platform: 'telegram', mediaUrl, mediaContentType, numMedia: 1 };
                        const voiceResult = await skillRegistry.route('__voice__', voiceSkillContext);
                        if (voiceResult.handled && voiceResult.data?.transcription) {
                            userMessage = voiceResult.data.transcription;
                            console.log(`[VoicePlan] Voice transcribed: "${userMessage.substring(0, 60)}"`);
                            activityLog.log('activity', 'voice', `Transcribed: "${userMessage.substring(0, 60)}"`, { userId });
                        }
                    } catch (err) {
                        console.error('[VoicePlan] Voice transcription failed:', err.message);
                    }
                }

                // If still empty after transcription attempt, skip plan handling
                if (!userMessage || !userMessage.trim()) {
                    console.log('[VoicePlan] Empty message, skipping plan handler');
                    // Fall through to normal processing
                } else {
                    // Use AI to understand the user's intent naturally
                    // No rigid "yes"/"no" - understand human language
                    const userIntent = await classifyUserResponse(userMessage, pending);

                    if (userIntent === 'confirm') {
                        confirmationManager.confirm(userId);
                        console.log('[VoicePlan] User confirmed plan naturally');
                        activityLog.log('activity', 'telegram', `User confirmed plan. Executing...`, { userId });

                        // Use PlanExecutor to actually create branches, code, and PRs
                        let execResponse;
                        try {
                            const planExecutor = require('./lib/plan-executor');
                            const { getTelegramHandler } = require('./telegram-handler');
                            const telegram = getTelegramHandler();

                            const result = await planExecutor.execute({
                                transcript: pending.params.transcript,
                                plan: pending.params.plan,
                                userId,
                                sendProgress: async (msg) => {
                                    // Send progress updates to Telegram
                                    activityLog.log('activity', 'executor', msg, { userId });
                                    if (telegram.isAvailable() && chatId) {
                                        await telegram.sendMessage(chatId, `⏳ ${msg}`);
                                    }
                                }
                            });

                            execResponse = result.message;

                            // Smart follow-up: transition session to iterating mode
                            if (result?.prUrl) {
                                // Transition session to iterating mode for feedback loop
                                try {
                                    const conversationSession = require('./lib/conversation-session');
                                    const branchMatch = result.message?.match(/Branch:\s*`([^`]+)`/);
                                    conversationSession.startSession(chatId || userId, 'iterating', {
                                        lastPrUrl: result.prUrl,
                                        lastBranch: branchMatch?.[1] || null,
                                        lastAction: 'Created PR',
                                        repo: autoRepo,
                                    });
                                } catch (e) { /* ignore */ }

                                setTimeout(async () => {
                                    try {
                                        const followUpTelegram = getTelegramHandler();
                                        if (followUpTelegram?.isAvailable() && chatId) {
                                            await followUpTelegram.sendMessage(chatId,
                                                `💡 You can now say "change X" to tweak the PR, or "deploy to vercel" to see it live.`
                                            );
                                        }
                                    } catch (e) {
                                        // Ignore follow-up errors
                                    }
                                }, 3000);
                            }
                        } catch (execError) {
                            console.error('[VoicePlan] Plan execution error:', execError);
                            execResponse = `Plan execution failed: ${execError.message}\n\nThe plan was confirmed but could not be executed automatically. You can try the individual commands manually.`;
                        }

                        if (memory) memory.saveMessage(chatId || userId, 'assistant', execResponse);
                        return execResponse;

                    } else if (userIntent === 'reject') {
                        confirmationManager.cancel(userId);
                        return "No worries, plan cancelled. What would you like to do instead?";

                    } else {
                        // User is clarifying, modifying, or asking questions
                        console.log(`[VoicePlan] User follow-up: ${userMessage}`);

                        // Build rich context for project awareness
                        let clarifyRichCtx = null;
                        try {
                            const ctxEngine = require('./lib/context-engine');
                            clarifyRichCtx = await ctxEngine.build({
                                chatId: chatId || userId, userId, platform: 'telegram',
                                message: userMessage, autoRepo, autoCompany,
                            });
                        } catch (e) { /* ignore */ }

                        const clarifyProjectHint = autoRepo ? `\nPROJECT: This chat is for "${autoRepo}". All work targets this project.\n` : '';

                        const response = await aiHandler.processQuery(
                            `CONTEXT: You're helping the user with a plan.${clarifyProjectHint}\n\n` +
                            `ORIGINAL VOICE INSTRUCTION: "${pending.params.transcript}"\n\n` +
                            `CURRENT PLAN:\n${pending.params.plan}\n\n` +
                            `USER SAYS: "${userMessage}"\n\n` +
                            `Respond naturally. If they're modifying the plan, show the updated plan. ` +
                            `If they're asking a question, answer it. If they seem ready, ask if they want to proceed. ` +
                            `Be conversational - suggest things, ask clarifying questions if needed. ` +
                            `Don't say "reply yes or no" - just have a natural conversation.`,
                            { userId, taskType: 'planning', platform: 'telegram', richContext: clarifyRichCtx }
                        );

                        // Update plan context with the conversation
                        confirmationManager.setPending(userId, 'voice_plan', {
                            transcript: pending.params.transcript,
                            plan: response,
                            history: (pending.params.history || '') + `\nUser: ${userMessage}\nBot: ${response}`
                        });

                        if (memory) memory.saveMessage(chatId || userId, 'assistant', response);
                        return response;
                    }
                }
            }

            // Handle regular action confirmations (deploy, etc.)
            const userIntent = await classifyUserResponse(incomingMsg, pending);

            if (userIntent === 'confirm') {
                const confirmed = confirmationManager.confirm(userId);
                if (confirmed && actionExecutor) {
                    const execResult = await actionExecutor.execute(confirmed.action, confirmed.params, confirmed.context);
                    return execResult.success
                        ? `Done! ${execResult.message}`
                        : `That didn't work: ${execResult.error || execResult.message}`;
                }
            } else if (userIntent === 'reject') {
                confirmationManager.cancel(userId);
                return "Cancelled. What would you like to do instead?";
            }
            // If neither confirm nor reject, fall through to normal processing
        }

        // For voice messages, use __voice__ trigger so voice skill handles it
        const isVoiceMessage = mediaContentType && mediaContentType.startsWith('audio/');
        let processedMsg = isVoiceMessage ? '__voice__' : incomingMsg;

        if (isVoiceMessage) {
            activityLog.log('activity', 'voice', 'Transcribing voice message with Groq Whisper...', { userId });
        }

        // RUN HOOKS (smart router converts natural language to commands)
        // Skip hooks for voice - the voice skill handles transcription
        if (hooks && !isVoiceMessage) {
            const hookContext = {
                userId,
                chatId,
                platform: 'telegram',
                mediaUrl,
                mediaContentType,
                numMedia: numMedia || 0,
                autoRepo,
                autoCompany
            };
            processedMsg = await hooks.preprocess(incomingMsg, hookContext);
        }

        // TEXT PLAN DETECTION — give text same treatment as voice for substantial coding instructions
        if (!isVoiceMessage && processedMsg && processedMsg === incomingMsg && confirmationManager && !confirmationManager.hasPending(userId)) {
            const textPlanResult = detectTextPlanCandidate(processedMsg);
            if (textPlanResult) {
                console.log(`[TextPlan] Coding instruction detected (${processedMsg.split(/\s+/).length} words), creating plan...`);
                activityLog.log('activity', 'text-plan', `Text plan detected: "${processedMsg.substring(0, 60)}"`, { userId });

                try {
                    // Start a designing session
                    try {
                        const conversationSession = require('./lib/conversation-session');
                        conversationSession.startSession(chatId || userId, 'designing', {
                            originalInstruction: processedMsg,
                            description: processedMsg,
                        });
                    } catch (e) { /* conversation-session may not be loaded yet */ }

                    // Build rich context so Claude knows which project this chat is for
                    let textPlanRichCtx = null;
                    try {
                        const ctxEngine = require('./lib/context-engine');
                        textPlanRichCtx = await ctxEngine.build({
                            chatId: chatId || userId, userId, platform: 'telegram',
                            message: processedMsg, autoRepo, autoCompany,
                        });
                    } catch (e) { /* ignore */ }

                    const projectHint = autoRepo
                        ? `\n\nPROJECT CONTEXT: This chat is dedicated to the "${autoRepo}" project. The user is talking about THIS project. Use "${autoRepo}" as the target repo for all operations.\n`
                        : '';

                    const planPrompt = `You're a helpful pair-programming partner. The user typed a coding instruction.${projectHint}\n\n` +
                        `USER INSTRUCTION: "${processedMsg}"\n\n` +
                        `Respond naturally:\n` +
                        `1. Briefly confirm what you understood\n` +
                        `2. List the specific tasks you'll do (mention the project name: ${autoRepo || 'unknown'})\n` +
                        `3. If anything is unclear, ask ONE clarifying question\n` +
                        `4. If everything is clear, ask if they'd like you to proceed\n\n` +
                        `Be conversational and friendly. Talk like a helpful colleague.`;

                    const planResponse = await aiHandler.processQuery(
                        planPrompt,
                        { userId, taskType: 'planning', richContext: textPlanRichCtx }
                    );

                    if (confirmationManager) {
                        confirmationManager.setPending(userId, 'text_plan', {
                            transcript: processedMsg,
                            plan: planResponse,
                        });
                        console.log('[TextPlan] Plan stored for conversation');
                        activityLog.log('activity', 'ai', 'Text plan created. Waiting for user confirmation...', { userId });
                    }

                    if (memory) memory.saveMessage(chatId || userId, 'assistant', planResponse);
                    return planResponse;
                } catch (err) {
                    console.error('[TextPlan] Error creating plan:', err.message);
                    // Fall through to normal processing
                }
            }
        }

        // TRY SKILL ROUTING FIRST
        activityLog.log('activity', 'skill', `Routing command: "${(processedMsg || '').substring(0, 50)}"`, { userId });
        if (skillRegistry) {
            const skillContext = {
                userId,
                chatId,
                platform: 'telegram',
                mediaUrl,
                mediaContentType,
                numMedia: numMedia || 0,
                autoRepo,
                autoCompany,
                activeProject: activeProject?.getActiveProject(userId)
            };

            const skillResult = await skillRegistry.route(processedMsg, skillContext);

            if (skillResult.handled) {
                let responseText = skillResult.success ? skillResult.message : `❌ ${skillResult.message}`;

                // If this was a voice transcription, process it intelligently
                if (mediaContentType?.startsWith('audio/') && skillResult.success && skillResult.data?.transcription) {
                    const transcript = skillResult.data.transcription;
                    const wordCount = transcript.split(/\s+/).length;

                    // Check if there's an existing plan being modified via voice
                    if (confirmationManager && confirmationManager.hasPending(userId)) {
                        const pending = confirmationManager.getPending(userId);
                        if (pending && pending.action === 'voice_plan') {
                            console.log(`[VoicePlan] Voice follow-up to existing plan: ${transcript.substring(0, 50)}...`);

                            // Use AI to handle the voice modification naturally
                            const userIntent = await classifyUserResponse(transcript, pending);

                            // Build rich context for project awareness
                            let voiceFollowRichCtx = null;
                            try {
                                const ctxEngine = require('./lib/context-engine');
                                voiceFollowRichCtx = await ctxEngine.build({
                                    chatId: chatId || userId, userId, platform: 'telegram',
                                    message: transcript, autoRepo, autoCompany,
                                });
                            } catch (e) { /* ignore */ }

                            const voiceProjectHint = autoRepo ? `\nPROJECT: "${autoRepo}"\n` : '';

                            if (userIntent === 'confirm') {
                                confirmationManager.confirm(userId);
                                const execResponse = await aiHandler.processQuery(
                                    `CONTEXT: The user gave voice instructions about project ${autoRepo || 'unknown'}:\n"${pending.params.transcript}"\n\nPLAN:\n${pending.params.plan}\n\n` +
                                    `The user just confirmed via voice: "${transcript}"\n\nExecute the plan. Be conversational.`,
                                    { userId, taskType: 'coding', platform: 'telegram', richContext: voiceFollowRichCtx }
                                );
                                responseText = execResponse;
                            } else {
                                const response = await aiHandler.processQuery(
                                    `CONTEXT: You're helping the user with a plan.${voiceProjectHint}\n\nORIGINAL: "${pending.params.transcript}"\n\nCURRENT PLAN:\n${pending.params.plan}\n\n` +
                                    `USER VOICE UPDATE: "${transcript}"\n\nUpdate the plan based on what they said. Be conversational.`,
                                    { userId, taskType: 'planning', platform: 'telegram', richContext: voiceFollowRichCtx }
                                );
                                confirmationManager.setPending(userId, 'voice_plan', {
                                    transcript: pending.params.transcript + ' ' + transcript,
                                    plan: response
                                });
                                responseText = response;
                            }

                            if (memory) memory.saveMessage(chatId || userId, 'assistant', responseText);
                            return responseText;
                        }
                    }

                    // Detect questions and simple requests — these should NOT trigger the plan system
                    const questionPatterns = [
                        /^(where|what|when|who|how|why|which|can you|could you|do you|is there|are there|does|did|will|would|should|have you)/i,
                        /\b(send me|show me|give me|tell me|find me|get me)\b.*\b(link|url|address|site|website|page|location)\b/i,
                        /\b(where is|what is|what's)\b.*\b(url|link|site|app|website|deployed|hosted|live|running)\b/i,
                        /\?(\.|\s)*$/,  // ends with question mark
                        /^(hey|hi|hello|yo|sup|thanks|thank you|ok|okay|got it|sure|cool|nice|great)\b/i,  // greetings/acknowledgments
                        /\b(how long|how much|how many|what time|when will|when does|when is|how do i|how can i)\b/i,
                        /\b(status|progress|update)\b.*\?/i,  // "what's the status?" type questions
                    ];

                    const isQuestion = questionPatterns.some(p => p.test(transcript.trim()));

                    if (isQuestion) {
                        console.log(`[Voice] Question/simple request detected, skipping plan system: "${transcript.substring(0, 60)}"`);
                    }

                    // New voice instruction - detect if it's a development/coding instruction
                    const codingKeywords = ['add', 'create', 'build', 'implement', 'make', 'change', 'update', 'modify', 'fix', 'remove', 'delete', 'move', 'replace', 'redesign', 'refactor', 'style', 'integrate', 'connect', 'optimize', 'improve'];
                    const codingContextWords = ['page', 'component', 'feature', 'button', 'nav', 'navigation', 'sidebar', 'header', 'footer', 'form', 'modal', 'layout', 'design', 'app', 'site', 'api', 'endpoint', 'function', 'database', 'table', 'screen', 'view', 'section', 'bar', 'menu'];
                    const hasCodingKeyword = codingKeywords.some(kw => transcript.toLowerCase().includes(kw));
                    const hasCodingContext = codingContextWords.some(kw => transcript.toLowerCase().includes(kw));
                    const isCodingInstruction = !isQuestion && hasCodingKeyword && hasCodingContext;

                    const planningKeywords = ['first', 'then', 'after that', 'next', 'finally', 'also', 'and then', 'step'];
                    const hasKeywords = planningKeywords.some(kw => transcript.toLowerCase().includes(kw));

                    if (!isQuestion && (isCodingInstruction || wordCount > 25 || (wordCount > 15 && hasKeywords))) {
                        console.log(`[VoicePlan] Complex instruction detected (${wordCount} words), creating plan...`);
                        activityLog.log('activity', 'voice', `Voice transcribed (${wordCount} words). Creating plan with AI...`, { userId, wordCount });

                        try {
                            // Build rich context so Claude knows which project this chat is for
                            let voicePlanRichCtx = null;
                            try {
                                const ctxEngine = require('./lib/context-engine');
                                voicePlanRichCtx = await ctxEngine.build({
                                    chatId: chatId || userId,
                                    userId,
                                    platform: 'telegram',
                                    message: transcript,
                                    autoRepo,
                                    autoCompany,
                                });
                            } catch (e) { /* ignore */ }

                            // Build project-aware prompt
                            const projectHint = autoRepo
                                ? `\n\nPROJECT CONTEXT: This chat is dedicated to the "${autoRepo}" project. The user is talking about THIS project. Use "${autoRepo}" as the target repo for all operations.\n`
                                : '';

                            // SWARM INTELLIGENCE: Auto-detect if task should use parallel agents
                            let voicePrompt = `You're a helpful assistant. The user sent a voice note with instructions.${projectHint}\n\n` +
                                `VOICE INSTRUCTION: "${transcript}"\n\n` +
                                `Respond naturally:\n` +
                                `1. Briefly confirm what you understood\n` +
                                `2. List the specific tasks you'll do (mention the project name: ${autoRepo || 'unknown'})\n` +
                                `3. If anything is unclear, ask a question\n` +
                                `4. If everything is clear, ask if they'd like you to proceed\n\n` +
                                `Be conversational and friendly. Don't use rigid formatting. Talk like a helpful colleague.`;

                            try {
                                const { voiceSwarmIntegration } = require('./lib/voice-swarm-integration');
                                const swarmResult = await voiceSwarmIntegration.processVoiceCommand(transcript, { autoRepo });

                                if (swarmResult.useSwarm) {
                                    console.log(`[VoiceSwarm] 🔀 Parallel agent mode activated! Confidence: ${(swarmResult.detection.confidence * 100).toFixed(0)}%`);
                                    voicePrompt = swarmResult.enhancedPrompt + projectHint;
                                }
                            } catch (e) {
                                console.log('[VoiceSwarm] Integration not available, using standard prompt:', e.message);
                            }

                            const planResponse = await aiHandler.processQuery(
                                voicePrompt,
                                { userId, taskType: 'planning', richContext: voicePlanRichCtx }
                            );

                            if (confirmationManager) {
                                confirmationManager.setPending(userId, 'voice_plan', {
                                    transcript: transcript,
                                    plan: planResponse
                                });
                                console.log('[VoicePlan] Plan stored for conversation');
                                activityLog.log('activity', 'ai', 'Plan created. Waiting for user confirmation...', { userId });
                            }

                            responseText = planResponse;
                            if (memory) memory.saveMessage(chatId || userId, 'assistant', responseText);
                            return responseText;
                        } catch (err) {
                            console.error('[VoicePlan] Error creating plan:', err.message);
                        }
                    } else {
                        // SHORT VOICE COMMAND: Re-route transcribed text through skills & AI
                        // e.g. "list my repos", "status", "deploy clawd-bot"
                        console.log(`[Voice] Short command (${wordCount} words), executing: "${transcript.substring(0, 60)}"`);
                        activityLog.log('activity', 'voice', `Voice transcribed: "${transcript.substring(0, 60)}". Executing as command...`, { userId, wordCount });

                        // Run through smart router (hooks) to convert natural language to commands
                        let routedCommand = transcript;
                        if (hooks) {
                            const hookContext = {
                                userId,
                                chatId,
                                platform: 'telegram',
                                autoRepo,
                                autoCompany
                            };
                            routedCommand = await hooks.preprocess(transcript, hookContext);
                            if (routedCommand !== transcript) {
                                console.log(`[Voice] Smart router: "${transcript}" → "${routedCommand}"`);
                            }
                        }

                        // Try skill routing with the routed command
                        const voiceSkillContext = {
                            userId,
                            chatId,
                            platform: 'telegram',
                            autoRepo,
                            autoCompany,
                            activeProject: activeProject?.getActiveProject(userId)
                        };

                        const voiceSkillResult = await skillRegistry.route(routedCommand, voiceSkillContext);

                        if (voiceSkillResult.handled) {
                            responseText = voiceSkillResult.success ? voiceSkillResult.message : `❌ ${voiceSkillResult.message}`;
                            if (memory) memory.saveMessage(chatId || userId, 'assistant', responseText);
                            return responseText;
                        }

                        // No skill matched - fall back to AI handler with context awareness
                        if (aiHandler) {
                            let voiceRichCtx = null;
                            try {
                                const ctxEngine = require('./lib/context-engine');
                                voiceRichCtx = await ctxEngine.build({
                                    chatId: chatId || userId,
                                    userId,
                                    platform: 'telegram',
                                    message: transcript,
                                    autoRepo,
                                    autoCompany,
                                });
                            } catch (e) { /* ignore */ }

                            const aiResponse = await aiHandler.processQuery(transcript, {
                                userId,
                                platform: 'telegram',
                                projectContext: activeProject?.getActiveProject(userId),
                                autoRepo,
                                autoCompany,
                                richContext: voiceRichCtx,
                            });
                            if (memory) memory.saveMessage(chatId || userId, 'assistant', aiResponse);
                            return aiResponse;
                        }
                    }
                }

                if (memory) {
                    memory.saveMessage(chatId || userId, 'assistant', responseText);
                }
                return responseText;
            }
        }

        // FALLBACK TO AI — with full context awareness
        if (aiHandler) {
            // Build rich context via Context Engine (the intelligence layer)
            let richContext = null;
            try {
                const contextEngine = require('./lib/context-engine');
                richContext = await contextEngine.build({
                    chatId: chatId || userId,
                    userId,
                    platform: 'telegram',
                    message: processedMsg,
                    autoRepo,
                    autoCompany,
                });
                if (richContext) {
                    console.log(`[ContextEngine] Built in ${richContext.buildTimeMs}ms (history: ${richContext.conversationHistory.length}, repo: ${richContext.activeRepo || 'none'})`);
                }
            } catch (ctxErr) {
                console.error('[ContextEngine] Build failed, continuing without:', ctxErr.message);
            }

            // Fallback conversation history if context engine didn't provide it
            const fallbackHistory = (!richContext || richContext.conversationHistory.length === 0)
                ? (memory ? memory.getConversationForClaude(chatId || userId, 8) : [])
                : [];

            const response = await aiHandler.processQuery(processedMsg, {
                userId,
                platform: 'telegram',
                mediaUrl,
                mediaContentType,
                projectContext: activeProject?.getActiveProject(userId),
                autoRepo,
                autoCompany,
                conversationHistory: fallbackHistory,
                richContext,
            });

            if (memory) {
                memory.saveMessage(chatId || userId, 'assistant', response);
            }

            // Decision extraction — auto-track choices during active sessions
            try {
                const conversationSession = require('./lib/conversation-session');
                if (conversationSession.isActive(chatId || userId)) {
                    conversationSession.extractAndSaveDecisions(chatId || userId, processedMsg, response);
                }
            } catch (e) { /* ignore */ }

            return response;
        }

        return "I couldn't process that. Try 'help' to see available commands.";

    } catch (error) {
        console.error('[Telegram] Error processing message:', error);
        return `Sorry, an error occurred: ${error.message}`;
    }
}

// Async message processor - runs after webhook responds
// Supports both WhatsApp (default) and Telegram platforms
async function processMessageAsync(incomingMsg, fromNumber, userId, mediaContext, platform = 'whatsapp') {
    try {
        // Save incoming message to memory (skip empty messages)
        if (memory && incomingMsg && incomingMsg.trim()) {
            try {
                memory.saveMessage(userId, 'user', incomingMsg);
            } catch (e) {
                console.error('[Memory] Save error:', e.message);
            }
        }

        // AUTO-CONTEXT: Check if this chat has a registered context
        // This enables commands like "deploy" to auto-complete to "deploy aws-clawd-bot"
        let autoRepo = null;
        let autoCompany = null;
        const chatContext = chatRegistry.getContext(userId);

        if (chatContext && chatContext.type === 'repo' && chatContext.value) {
            // Auto-set active project without user having to "switch to"
            autoRepo = chatContext.value;
            activeProject.setPermanentProject(userId, autoRepo);
            console.log(`[AutoContext] Chat ${userId} -> repo: ${autoRepo}`);
        } else if (chatContext && chatContext.type === 'company' && chatContext.value) {
            // Set company context for accountancy skills
            autoCompany = chatContext.value;
            console.log(`[AutoContext] Chat ${userId} -> company: ${autoCompany}`);
        }
        // HQ chats have no auto-context - must specify or use active project

        // CHECK FOR PENDING CONFIRMATIONS FIRST
        if (confirmationManager && confirmationManager.hasPending(userId)) {
            const confirmResult = confirmationManager.isConfirmation(incomingMsg);

            if (confirmResult === 'yes') {
                // User confirmed - execute the pending action
                const pending = confirmationManager.confirm(userId);

                // Send WORKING status message before execution
                const actionDescription = pending?.action || 'task';
                const workingMessage = statusMessenger.formatStatusMessage('WORKING', `Starting: ${actionDescription}`);
                await MessagingPlatform.sendToRecipient(workingMessage, platform, fromNumber);

                // Handle voice_action confirmations through VoiceFlow
                if (pending && pending.action === 'voice_action' && pending.params?.actionId) {
                    try {
                        const { voiceFlow } = require('./lib/voice-flow');
                        const execResult = await voiceFlow.executeAction(pending.params.actionId);

                        const responseText = execResult.success
                            ? statusMessenger.complete(execResult.message, {
                                nextSteps: execResult.undoAvailable ? 'Say "undo" to reverse.' : undefined
                            })
                            : statusMessenger.failed(execResult.message);

                        await MessagingPlatform.sendToRecipient(responseText, platform, fromNumber);
                        return;
                    } catch (err) {
                        console.error('[VoiceFlow] Confirmation execution failed:', err.message);
                        const errorMessage = statusMessenger.failed(err.message, 'Try again or contact support if this persists');
                        await MessagingPlatform.sendToRecipient(errorMessage, platform, fromNumber);
                        return;
                    }
                }

                // Handle image generation confirmations
                if (pending && pending.action === 'generate-image' && registry) {
                    console.log('[ImageGen] Executing confirmed image generation');
                    const imageGenSkill = registry.getSkill('image-gen');

                    if (imageGenSkill && imageGenSkill.executeConfirmed) {
                        try {
                            const genResult = await imageGenSkill.executeConfirmed(pending.params, {
                                userId,
                                chatId,
                                fromNumber,
                                platform,
                                messageId,
                                timestamp: new Date()
                            });

                            const responseText = genResult.success
                                ? statusMessenger.complete(genResult.message)
                                : statusMessenger.failed(genResult.message);

                            await MessagingPlatform.sendToRecipient(responseText, platform, fromNumber);
                            return;
                        } catch (err) {
                            console.error('[ImageGen] Confirmation execution failed:', err.message);
                            const errorMessage = statusMessenger.failed(err.message, 'Try again or contact support if this persists');
                            await MessagingPlatform.sendToRecipient(errorMessage, platform, fromNumber);
                            return;
                        }
                    }
                }

                // Handle regular action executor confirmations
                if (pending && actionExecutor) {
                    console.log(`[AutoExec] Executing confirmed action: ${pending.action}`);
                    const execResult = await actionExecutor.execute(pending.action, pending.params, pending.context);

                    const responseText = execResult.success
                        ? statusMessenger.complete(execResult.message)
                        : statusMessenger.failed(execResult.error || execResult.message);

                    await MessagingPlatform.sendToRecipient(responseText, platform, fromNumber);
                    return;
                }
            } else if (confirmResult === 'no') {
                // User cancelled - also cancel in action controller if voice action
                const pending = confirmationManager.getPending(userId);
                if (pending && pending.action === 'voice_action' && pending.params?.actionId) {
                    try {
                        const { voiceFlow } = require('./lib/voice-flow');
                        if (voiceFlow.actionController) {
                            voiceFlow.actionController.cancel(pending.params.actionId);
                        }
                    } catch (e) { /* ignore */ }
                }
                confirmationManager.cancel(userId);
                await MessagingPlatform.sendToRecipient('*Cancelled.* Let me know if you need anything else.', platform, fromNumber);
                return;
            } else {
                // User sent a message but didn't say yes/no - send reminder
                const pending = confirmationManager.getPending(userId);
                if (pending) {
                    const reminderMessage = statusMessenger.formatStatusMessage(
                        'APPROVAL_NEEDED',
                        `You have a pending action: **${pending.action}**`,
                        {
                            footer: 'Reply with "yes" to proceed or "no" to cancel.'
                        }
                    );
                    await MessagingPlatform.sendToRecipient(reminderMessage, platform, fromNumber);
                    return;
                }
            }
            // If not a clear yes/no, continue processing normally (no pending action found)
        }

        // Check for new conversation (send greeting)
        if (aiHandler.isNewConversation() && incomingMsg.toLowerCase() === 'hi') {
            const greeting = aiHandler.getGreeting();

            // Save and send greeting
            if (memory) {
                memory.saveMessage(userId, 'assistant', greeting);
            }

            await MessagingPlatform.sendToRecipient(greeting, platform, fromNumber);

            console.log(`[${new Date().toISOString()}] Sent greeting`);
            return;
        }

        // Process the message
        let responseText = '';
        let handled = false;

        const { numMedia, mediaUrl, mediaContentType } = mediaContext;

        // VOICE FLOW: Process voice notes through the full pipeline
        // Voice notes get: Transcription -> Intent -> Action proposal -> Execute/Confirm
        if (numMedia > 0 && mediaContentType && (
            mediaContentType.includes('audio') ||
            mediaContentType.includes('ogg') ||
            mediaContentType.includes('voice')
        )) {
            try {
                const { voiceFlow } = require('./lib/voice-flow');
                console.log(`[VoiceFlow] Processing voice note from ${userId}`);

                const result = await voiceFlow.processVoiceNote(mediaUrl, userId, {
                    platform,
                    activeProject: autoRepo,
                    autoCompany,
                    fromNumber
                });

                // Send status messages if available
                if (result.statusMessage) {
                    // Send transcription status
                    if (result.statusMessage.message) {
                        await telegramHandler.sendMessage(chatId, result.statusMessage.message).catch(() => {});
                    }
                    // Send intent classification status
                    if (result.statusMessage.intentMessage) {
                        await telegramHandler.sendMessage(chatId, result.statusMessage.intentMessage).catch(() => {});
                    }
                }

                // Handle different stages
                switch (result.stage) {
                    case 'auto_execute':
                        // High confidence - execute and report
                        if (result.actionId && voiceFlow.actionController) {
                            const execResult = await voiceFlow.executeAction(result.actionId);
                            responseText = result.message + '\n\n' + (execResult.undoAvailable
                                ? 'Done! Say "undo" to reverse.'
                                : 'Done!');
                        } else {
                            responseText = result.message;
                        }
                        handled = true;
                        break;

                    case 'confirm':
                        // Needs confirmation - store pending action
                        if (confirmationManager && result.actionId) {
                            // Send approval request status
                            await telegramHandler.sendMessage(chatId, statusMessenger.formatStatusMessage(
                                'APPROVAL_NEEDED',
                                'Requesting approval...'
                            )).catch(() => {});

                            confirmationManager.setPending(userId, 'voice_action', {
                                actionId: result.actionId,
                                transcription: result.transcription,
                                intent: result.intent
                            }, { userId, fromNumber, source: 'voice' });
                        }
                        responseText = result.message;
                        handled = true;
                        break;

                    case 'clarify':
                    case 'reject':
                    case 'transcribed':
                        // Show result and let user clarify or continue
                        responseText = result.message;
                        handled = true;
                        break;

                    case 'error':
                        // Error occurred, fall through to skill registry
                        console.error('[VoiceFlow] Error:', result.message);
                        // Don't mark as handled - let voice skill try
                        break;
                }
            } catch (err) {
                console.error('[VoiceFlow] Processing failed:', err.message);
                // Fall through to skill registry voice handling
            }
        }

        // AUTO-PROCESS RECEIPTS: If image attached and looks like receipt
        if (numMedia > 0 && mediaContentType?.startsWith('image/') && actionExecutor) {
            const msgLower = (incomingMsg || '').toLowerCase();
            const isReceiptLikely = !incomingMsg || msgLower.includes('receipt') || msgLower.includes('expense') ||
                                    msgLower.includes('paid') || msgLower.includes('bought') || msgLower.includes('fuel');

            if (isReceiptLikely) {
                try {
                    console.log('[AutoExec] Auto-processing receipt image');
                    const receiptProcessor = require('./lib/actions/receipt-processor');

                    // Detect company from message, fallback to auto-context
                    let company = autoCompany; // Use auto-context as default
                    if (msgLower.includes('gqcars') || msgLower.includes('gq cars') || msgLower.includes('car')) company = 'GQCARS';
                    else if (msgLower.includes('gmh') || msgLower.includes('holding')) company = 'GMH';
                    else if (msgLower.includes('gacc') || msgLower.includes('accountan')) company = 'GACC';
                    else if (msgLower.includes('gcap') || msgLower.includes('capital')) company = 'GCAP';
                    else if (msgLower.includes('gspv') || msgLower.includes('spv')) company = 'GSPV';

                    const result = await receiptProcessor.processReceipt(mediaUrl, {
                        userId,
                        company,
                        description: incomingMsg
                    });

                    if (result.success) {
                        responseText = result.summary;
                        handled = true;
                    }
                } catch (err) {
                    console.error('[AutoExec] Receipt processing failed:', err.message);
                    // Fall through to normal processing
                }
            }
        }

        // Preprocess message through hooks (natural language -> command)
        // Pass media context and auto-context so hooks can apply them
        const processedMsg = await hooks.preprocess(incomingMsg, {
            userId,
            fromNumber,
            numMedia,
            mediaUrl,
            mediaContentType,
            // Auto-context from chat-registry
            autoRepo,
            autoCompany
        });

        // Try skill registry first
        if (skillRegistry) {
            try {
                const result = await skillRegistry.route(processedMsg, {
                    userId: userId,
                    fromNumber: fromNumber,
                    memory: memory,
                    // Media context for receipt/image skills
                    numMedia: numMedia,
                    mediaUrl: mediaUrl,
                    mediaContentType: mediaContentType,
                    // Auto-context from chat-registry (for skills that need it)
                    autoRepo: autoRepo,
                    autoCompany: autoCompany,
                    company: autoCompany // Alias for accountancy skills
                });

                if (result && result.handled) {
                    responseText = result.message;
                    handled = true;

                    // APPROVAL FLOW: Check if skill needs approval
                    if (result.needsApproval && result.approvalData && confirmationManager) {
                        const { action, ...params } = result.approvalData;
                        const actionType = action || 'generate-image'; // Default action type

                        confirmationManager.setPending(userId, actionType, params, {
                            userId,
                            chatId,
                            fromNumber,
                            platform,
                            messageId,
                            timestamp: new Date()
                        });

                        console.log(`[Approval] Pending confirmation set for ${userId}: ${actionType}`);
                    }

                    // AUTO-EXECUTION: Check if skill returned an action to execute
                    if (result.data?.intelligence && actionExecutor) {
                        const intel = result.data.intelligence;

                        if (intel.action && intel.confidence > 0.6) {
                            // Check if this action needs confirmation
                            if (confirmationManager && confirmationManager.requiresConfirmation(intel.action)) {
                                // Store pending and ask for confirmation
                                confirmationManager.setPending(userId, intel.action, {
                                    project: intel.project,
                                    projectDetails: intel.projectDetails,
                                    description: result.data?.transcription || incomingMsg,
                                    company: intel.company
                                }, { userId, fromNumber, mediaUrl });

                                const confirmMsg = confirmationManager.formatConfirmationRequest(intel.action, {
                                    project: intel.project,
                                    description: result.data?.transcription || incomingMsg
                                });

                                responseText += '\n\n' + confirmMsg;
                            } else {
                                // Execute immediately (low-risk action)
                                console.log(`[AutoExec] Auto-executing: ${intel.action}`);
                                const execResult = await actionExecutor.execute(intel.action, {
                                    project: intel.project,
                                    projectDetails: intel.projectDetails,
                                    description: result.data?.transcription || incomingMsg,
                                    company: intel.company,
                                    mediaUrl: mediaUrl
                                }, { userId, fromNumber });

                                if (execResult.success) {
                                    responseText += '\n\n✅ ' + execResult.message;
                                }
                            }
                        }
                    }
                }
            } catch (skillError) {
                console.error('Skill error:', skillError.message);
            }
        }

        // Fallback to built-in commands if skills didn't handle it
        if (!handled) {
            const cmd = processedMsg.toLowerCase();

            if (cmd === 'status') {
                responseText = await handleStatusCommand();
                handled = true;
            }
        }

        // Final fallback to AI — with full context awareness
        if (!handled) {
            // Build rich context via Context Engine
            let richContext = null;
            try {
                const contextEngine = require('./lib/context-engine');
                richContext = await contextEngine.build({
                    chatId: userId,
                    userId,
                    platform,
                    message: incomingMsg,
                    autoRepo,
                    autoCompany,
                });
            } catch (ctxErr) {
                console.error('[ContextEngine] Build failed:', ctxErr.message);
            }

            responseText = await aiHandler.processQuery(incomingMsg, {
                userId,
                platform,
                autoRepo,
                autoCompany,
                richContext,
            });
        }

        // Save response to memory
        if (memory) {
            memory.saveMessage(userId, 'assistant', responseText);

            // Try to extract facts from the conversation
            extractAndSaveFacts(userId, incomingMsg);
        }

        // Sanitize response — strip XML tags, agent internals, technical noise
        const { sanitizeResponse } = require('./lib/telegram-sanitizer');
        responseText = sanitizeResponse(responseText);

        // Send response via appropriate platform
        await MessagingPlatform.sendToRecipient(responseText, platform, fromNumber);

        console.log(`[${new Date().toISOString()}] [${platform}] Sent: "${responseText.substring(0, 50)}..."`);

    } catch (error) {
        console.error('Error processing message async:', error);
        // Send human-friendly error message to user
        try {
            const { sanitizeError } = require('./lib/telegram-sanitizer');
            await MessagingPlatform.sendToRecipient(
                `Sorry, I had trouble with that. ${sanitizeError(error)}`,
                platform,
                fromNumber
            );
        } catch (sendError) {
            console.error('Failed to send error message:', sendError.message);
        }
    }
}

// Extract facts from user messages (simple pattern matching)
function extractAndSaveFacts(userId, message) {
    if (!memory) return;

    const patterns = [
        { regex: /my name is (\w+)/i, category: 'personal', template: 'User\'s name is $1' },
        { regex: /i prefer (\w+)/i, category: 'preference', template: 'Prefers $1' },
        { regex: /i use (\w+)/i, category: 'tools', template: 'Uses $1' },
        { regex: /i work (?:at|for) (.+)/i, category: 'work', template: 'Works at $1' },
        { regex: /i(?:'m| am) a (\w+)/i, category: 'personal', template: 'Is a $1' },
        { regex: /i live in (.+)/i, category: 'personal', template: 'Lives in $1' },
        { regex: /my timezone is (.+)/i, category: 'preference', template: 'Timezone: $1' },
        { regex: /remember that (.+)/i, category: 'general', template: '$1' },
    ];

    for (const pattern of patterns) {
        const match = message.match(pattern.regex);
        if (match) {
            const fact = pattern.template.replace('$1', match[1]);
            memory.saveFact(userId, fact, pattern.category, 'auto_extracted');
            console.log(`[Memory] Extracted fact: "${fact}"`);
        }
    }
}

// Status command handler
async function handleStatusCommand() {
    const uptime = Math.floor(process.uptime());
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    const repos = (process.env.REPOS_TO_MONITOR || '').split(',').filter(Boolean);
    const userId = process.env.YOUR_WHATSAPP;

    let statsLine = '';
    if (memory) {
        const stats = memory.getStats(userId);
        statsLine = `\n📊 Messages: ${stats.messageCount} | Facts: ${stats.factCount}`;
    }

    const features = [];
    if (memory) features.push('Memory');
    if (skillRegistry) features.push('Skills');
    if (scheduler) features.push('Scheduler');

    return `✅ ClawdBot is online!

⏱️ Uptime: ${hours}h ${minutes}m
💾 RAM: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB
📁 Repos: ${repos.length}
🔧 Features: ${features.join(', ') || 'Basic'}${statsLine}

Type "help" for commands! 🤖`;
}

// ================================================
// TELEGRAM CALLBACK HANDLER (Inline Keyboard Buttons)
// ================================================

/**
 * Handle Telegram inline keyboard button callbacks
 * Routes callback_data to appropriate skill/command execution
 *
 * @param {string} callbackData - The callback_data from the pressed button (e.g., "deploy:my-repo")
 * @param {string|number} chatId - The chat ID where the button was pressed
 * @param {Object} ctx - Telegraf context for advanced operations
 */
async function handleTelegramCallback(callbackData, chatId, ctx) {
    const userId = chatId.toString();
    const { action, params } = ActionButtons.parseCallback(callbackData);

    console.log(`[Telegram Callback] Action: ${action}, Params: ${params}`);

    try {
        let responseText = '';
        let handled = false;

        switch (action) {
            // ====== Project Actions ======
            case 'deploy': {
                // Trigger deployment for the repo
                if (confirmationManager) {
                    confirmationManager.setPending(userId, 'deploy', {
                        project: params,
                        description: `Deploy ${params}`
                    }, { userId, chatId });

                    responseText = `Deploy *${params}*?\n\nReply *yes* to confirm or *no* to cancel.`;
                    await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                    handled = true;
                }
                break;
            }

            case 'deploy_confirm': {
                // Execute deployment immediately
                const commandWhitelist = require('./lib/command-whitelist');
                const deployCmd = commandWhitelist.getCommand('deploy', params);

                if (!deployCmd) {
                    responseText = `Deployment not configured for *${params}*`;
                } else {
                    responseText = `Deploying *${params}*...`;
                    await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });

                    const { exec } = require('child_process');
                    try {
                        await new Promise((resolve, reject) => {
                            exec(deployCmd.command, { timeout: 120000 }, (error, stdout, stderr) => {
                                if (error) reject(error);
                                else resolve({ stdout, stderr });
                            });
                        });
                        responseText = `Deployed *${params}* successfully!`;
                    } catch (err) {
                        responseText = `Deploy failed: ${err.message}`;
                    }
                }
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            case 'deploy_cancel': {
                responseText = `Deployment of *${params}* cancelled.`;
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            case 'tests': {
                // Run tests for the repo
                const commandWhitelist = require('./lib/command-whitelist');
                const testCmd = commandWhitelist.getCommand('test', params) ||
                                commandWhitelist.getCommand('tests', params);

                if (!testCmd) {
                    responseText = `Tests not configured for *${params}*`;
                } else {
                    responseText = `Running tests for *${params}*...`;
                    await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });

                    const { exec } = require('child_process');
                    try {
                        const result = await new Promise((resolve, reject) => {
                            exec(testCmd.command, { timeout: 120000 }, (error, stdout, stderr) => {
                                if (error) reject(error);
                                else resolve({ stdout, stderr });
                            });
                        });
                        const output = (result.stdout || result.stderr || 'No output').substring(0, 500);
                        responseText = `Tests for *${params}*:\n\`\`\`\n${output}\n\`\`\``;
                    } catch (err) {
                        responseText = `Tests failed: ${err.message}`;
                    }
                }
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            case 'logs': {
                // View logs for the repo
                const commandWhitelist = require('./lib/command-whitelist');
                const logsCmd = commandWhitelist.getCommand('logs', params);

                if (!logsCmd) {
                    responseText = `Logs not configured for *${params}*`;
                } else {
                    responseText = `Fetching logs for *${params}*...`;
                    await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });

                    const { exec } = require('child_process');
                    try {
                        const result = await new Promise((resolve, reject) => {
                            exec(logsCmd.command, { timeout: 30000 }, (error, stdout, stderr) => {
                                if (error) reject(error);
                                else resolve({ stdout, stderr });
                            });
                        });
                        const output = (result.stdout || result.stderr || 'No logs').substring(0, 800);
                        responseText = `Logs for *${params}*:\n\`\`\`\n${output}\n\`\`\``;
                    } catch (err) {
                        responseText = `Failed to get logs: ${err.message}`;
                    }
                }
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            case 'restart': {
                // Restart the service
                const commandWhitelist = require('./lib/command-whitelist');
                const restartCmd = commandWhitelist.getCommand('restart', params);

                if (!restartCmd) {
                    responseText = `Restart not configured for *${params}*`;
                } else {
                    responseText = `Restarting *${params}*...`;
                    await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });

                    const { exec } = require('child_process');
                    try {
                        await new Promise((resolve, reject) => {
                            exec(restartCmd.command, { timeout: 30000 }, (error, stdout, stderr) => {
                                if (error) reject(error);
                                else resolve({ stdout, stderr });
                            });
                        });
                        responseText = `Restarted *${params}* successfully!`;
                    } catch (err) {
                        responseText = `Restart failed: ${err.message}`;
                    }
                }
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            case 'ignore': {
                // Acknowledge and dismiss the alert
                responseText = `Alert for *${params}* acknowledged.`;
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            // ====== Task Actions ======
            case 'task_done': {
                responseText = `Task marked as done. (Task ID: ${params})\n\n_Note: TODO.md update requires GitHub integration._`;
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            case 'task_details': {
                responseText = `Task details requested for: ${params}\n\n_Use "project status" command for full details._`;
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            // ====== Morning Brief Actions ======
            case 'brief': {
                if (params === 'full') {
                    responseText = 'Generating full report...';
                    await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                    // Route to morning brief skill
                    if (skillRegistry) {
                        const result = await skillRegistry.route('morning brief full', {
                            userId,
                            memory
                        });
                        if (result?.handled) {
                            responseText = result.message;
                        }
                    }
                } else if (params === 'refresh') {
                    responseText = 'Refreshing brief...';
                    // Re-run morning brief
                } else if (params === 'snooze') {
                    responseText = 'Brief snoozed for 1 hour.';
                }
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            // ====== Confirmation Actions ======
            case 'confirm_yes': {
                if (confirmationManager && confirmationManager.hasPending(userId)) {
                    const pending = confirmationManager.confirm(userId);
                    if (pending && actionExecutor) {
                        const execResult = await actionExecutor.execute(pending.action, pending.params, pending.context);
                        responseText = execResult.success
                            ? `Done! ${execResult.message}`
                            : `Failed: ${execResult.error || execResult.message}`;
                    }
                } else {
                    responseText = 'No pending action to confirm.';
                }
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            case 'confirm_no': {
                if (confirmationManager) {
                    confirmationManager.cancel(userId);
                }
                responseText = 'Action cancelled.';
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            // ====== Help Menu Actions ======
            case 'help': {
                const helpTopics = {
                    projects: '*Project Commands:*\n• `my repos` - List all repos\n• `project status [repo]` - Show TODO tasks\n• `switch to [repo]` - Set active project',
                    ai: '*AI Commands:*\n• `ai mode economy` - Use FREE Groq\n• `ai mode quality` - Use Claude\n• `ai stats` - View usage',
                    reminders: '*Reminder Commands:*\n• `remind me [text] in [time]`\n• `show reminders`\n• `clear reminders`',
                    stats: '*Stats Commands:*\n• `status` - Bot status\n• `memory stats` - Memory usage\n• `github stats` - Repo stats'
                };
                responseText = helpTopics[params] || 'Unknown help topic';
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            // ====== Project Selection Actions ======
            case 'select_project': {
                // Set active project
                try {
                    const activeProject = require('./lib/active-project');
                    activeProject.setActiveProject(userId, { repo: params, owner: 'giquina', fullName: `giquina/${params}` });
                    responseText = `Active project set to *${params}*`;
                } catch (err) {
                    responseText = `Selected: *${params}*\n\n_Use project commands to interact._`;
                }
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            case 'projects_page': {
                // Navigate project pages - would need to regenerate project list
                responseText = `Page ${parseInt(params) + 1} requested. Use "my repos" to see full list.`;
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            // ====== Receipt Actions ======
            case 'receipt_save': {
                responseText = `Receipt ${params} saved.`;
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            case 'receipt_edit': {
                responseText = `Send corrections for receipt ${params}.`;
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            case 'receipt_discard': {
                responseText = `Receipt ${params} discarded.`;
                await ctx.editMessageText(responseText, { parse_mode: 'Markdown' });
                handled = true;
                break;
            }

            default: {
                responseText = `Unknown action: ${action}`;
                await telegramHandler.sendMessage(chatId, responseText);
                handled = true;
            }
        }

        // Save to memory if available
        if (memory && handled) {
            memory.saveMessage(userId, 'user', `[Button: ${action}:${params}]`);
            memory.saveMessage(userId, 'assistant', responseText);
        }

    } catch (error) {
        console.error('[Telegram Callback] Error:', error.message);
        try {
            await telegramHandler.sendMessage(chatId, `Error: ${error.message}`);
        } catch (e) {
            console.error('[Telegram Callback] Failed to send error message:', e.message);
        }
    }
}

// Start server
app.listen(port, '0.0.0.0', async () => {
    console.log('');
    console.log('ClawdBot WhatsApp Server v2.3');
    console.log('=====================================');
    console.log(`   Port: ${port}`);
    console.log(`   User: ${process.env.YOUR_WHATSAPP}`);
    console.log(`   Repos: ${process.env.REPOS_TO_MONITOR}`);
    console.log('');

    // Initialize Telegram if configured
    let telegramInitialized = false;
    if (process.env.TELEGRAM_BOT_TOKEN) {
        try {
            // Message handler for Telegram - routes through same pipeline as WhatsApp
            const telegramMessageHandler = async (messageData) => {
                const { text, userId, chatId, numMedia, mediaUrl, mediaContentType, platform } = messageData;

                console.log(`[Telegram] Message from ${userId}: ${text?.substring(0, 50) || '[media]'}`);

                // Authorization is already checked in telegram-handler.js (isAuthorized)
                // which covers: individual users, HQ chat, and registered group chats
                // No duplicate check needed here

                // Build context similar to WhatsApp
                const context = {
                    userId: String(userId),
                    chatId: String(chatId),
                    platform: 'telegram',
                    numMedia: numMedia || 0,
                    mediaUrl: mediaUrl,
                    mediaContentType: mediaContentType
                };

                try {
                    // Process through the same pipeline as WhatsApp
                    const response = await processMessageForTelegram(text || '', context);
                    return response;
                } catch (error) {
                    console.error('[Telegram] Error processing message:', error);
                    return 'Sorry, I encountered an error processing your message.';
                }
            };

            telegramInitialized = await telegramHandler.initialize({
                messageHandler: telegramMessageHandler
            });

            if (telegramInitialized) {
                MessagingPlatform.setTelegramHandler(telegramHandler);

                // Set up callback handler for inline keyboard buttons
                telegramHandler.setupCallbackHandler(handleTelegramCallback);
                console.log('   [Telegram] Inline button callbacks enabled');
            }
        } catch (err) {
            console.log('   [Telegram] Initialization failed:', err.message);
        }
    }

    console.log('   Webhook Endpoints:');
    console.log(`   • POST /webhook        - Twilio WhatsApp`);
    console.log(`   • POST /telegram       - Telegram Bot API`);
    console.log(`   • POST /github-webhook - GitHub events`);
    console.log(`   • GET  /health         - Health check`);
    console.log('');
    console.log('   Voice Endpoints (Twilio Voice):');
    console.log(`   • POST /voice/outbound - TwiML for outbound calls`);
    console.log(`   • POST /voice/response - Speech recognition handler`);
    console.log(`   • POST /voice/status   - Call status callbacks`);
    console.log('');
    console.log('   API Endpoints (for MCP/Claude Code App):');
    console.log(`   • GET  /api/status           - Bot status`);
    console.log(`   • POST /api/message          - Send message`);
    console.log(`   • GET  /api/projects         - List repos`);
    console.log(`   • GET  /api/project/:r/status - TODO.md`);
    console.log(`   • POST /api/project/:r/deploy - Deploy`);
    console.log(`   • POST /api/project/:r/command - Run cmd`);
    console.log(`   • GET  /api/memory           - History`);
    console.log(`   • POST /api/whatsapp/send    - Send WA`);
    console.log(`   • GET  /api/skills           - List skills`);
    console.log('');
    console.log('   Features:');
    console.log(`   • Memory: ${memory ? 'Persistent' : 'In-memory only'}`);
    console.log(`   • Skills: ${skillRegistry ? 'Loaded' : 'Not available'}`);
    console.log(`   • Scheduler: ${scheduler ? 'Active' : 'Not available'}`);
    console.log(`   • SmartRouter: Active (NL -> commands)`);
    console.log(`   • ProjectIntel: ${projectIntelligence ? 'Active' : 'Not available'}`);
    console.log(`   • ActionExecutor: ${actionExecutor ? 'Active' : 'Not available'}`);
    console.log(`   • Telegram: ${telegramInitialized ? 'Active' : 'Not configured'}`);
    console.log(`   • VoiceCalls: ${voiceHandler && voiceHandler.isAvailable() ? 'Active' : 'Not configured'}`);
    console.log(`   • API Auth: ${process.env.CLAWDBOT_API_KEY ? 'Configured' : 'Default key (change!)'}`);
    console.log('');
    console.log('   MCP Server: node mcp-server/index.js');
    console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');

    if (scheduler) {
        scheduler.stop();
    }

    if (memory) {
        memory.close();
    }

    process.exit(0);
});

// Export for testing
module.exports = { app, sendWhatsAppMessage };
