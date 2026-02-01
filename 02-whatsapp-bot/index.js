// WhatsApp Bot - Main Entry Point
// Receives messages from Twilio, processes with AI/Skills, sends back responses
// Now with persistent memory, skills framework, and scheduler

const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const path = require('path');
require('dotenv').config();

// Initialize hooks system early (includes error alerter and smart router)
const hooks = require('./hooks');
hooks.initializeHooks();

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

// Import core modules
const aiHandler = require('./ai-handler');
const githubWebhook = require('./github-webhook');

// Import new systems (with graceful fallback if not installed)
let memory = null;
let skillRegistry = null;
let scheduler = null;
let projectIntelligence = null;

// Try to load Project Intelligence (the brain)
try {
    projectIntelligence = require('./lib/project-intelligence');
    projectIntelligence.initialize();
    console.log('✅ Project Intelligence loaded');
} catch (err) {
    console.log('⚠️  Project Intelligence not available:', err.message);
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
        config: {}
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

// Send message function (used by scheduler for proactive messages)
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
        console.log(`[${new Date().toISOString()}] Proactive message sent`);
    } catch (error) {
        console.error('Error sending proactive message:', error.message);
    }
}

// Initialize scheduler with message sender
try {
    const { getScheduler } = require('./scheduler');
    scheduler = getScheduler(memory, sendWhatsAppMessage);
    scheduler.start().then(() => {
        console.log('✅ Scheduler started');
    }).catch(err => {
        console.log('⚠️  Scheduler start error:', err.message);
    });
} catch (err) {
    // Already logged above
}

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
            smartRouter: !!hooks.smartRouter
        },
        stats: stats
    });
});

// GitHub webhook endpoint - receives events and forwards to WhatsApp
app.post('/github-webhook', async (req, res) => {
    try {
        const eventType = req.headers['x-github-event'];
        const signature = req.headers['x-hub-signature-256'];
        const deliveryId = req.headers['x-github-delivery'];

        console.log(`[${new Date().toISOString()}] GitHub webhook: ${eventType} (${deliveryId})`);

        // Verify signature if secret is configured
        if (!githubWebhook.verifySignature(req.rawBody || JSON.stringify(req.body), signature)) {
            console.log('[GitHub Webhook] Signature verification failed');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Format the event into a message
        const message = githubWebhook.formatEvent(eventType, req.body);

        if (message) {
            // Send to WhatsApp
            await sendWhatsAppMessage(message);
            console.log(`[GitHub Webhook] Sent: "${message.substring(0, 60)}..."`);
        } else {
            console.log(`[GitHub Webhook] Event ignored: ${eventType}/${req.body.action || 'no-action'}`);
        }

        // Always respond 200 to GitHub
        res.status(200).json({
            received: true,
            event: eventType,
            notified: !!message
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

// Async message processor - runs after webhook responds
async function processMessageAsync(incomingMsg, fromNumber, userId, mediaContext) {
    try {
        // Save incoming message to memory
        if (memory) {
            memory.saveMessage(userId, 'user', incomingMsg);
        }

        // Check for new conversation (send greeting)
        if (aiHandler.isNewConversation() && incomingMsg.toLowerCase() === 'hi') {
            const greeting = aiHandler.getGreeting();

            // Save and send greeting
            if (memory) {
                memory.saveMessage(userId, 'assistant', greeting);
            }

            await twilioClient.messages.create({
                body: greeting,
                from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
                to: fromNumber
            });

            console.log(`[${new Date().toISOString()}] Sent greeting`);
            return;
        }

        // Process the message
        let responseText = '';
        let handled = false;

        const { numMedia, mediaUrl, mediaContentType } = mediaContext;

        // Preprocess message through hooks (natural language -> command)
        // Pass media context so hooks can skip routing for voice/media messages
        const processedMsg = await hooks.preprocess(incomingMsg, {
            userId,
            fromNumber,
            numMedia,
            mediaUrl,
            mediaContentType
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
                    mediaContentType: mediaContentType
                });

                if (result && result.handled) {
                    responseText = result.message;
                    handled = true;
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

        // Final fallback to AI (use original message for natural conversation)
        if (!handled) {
            // Include user facts in context if available
            if (memory) {
                const facts = memory.getFacts(userId);
                if (facts && facts.length > 0) {
                    const context = facts.map(f => `- ${f.fact}`).join('\n');
                    // Could inject into system prompt here
                }
            }

            responseText = await aiHandler.processQuery(incomingMsg);
        }

        // Save response to memory
        if (memory) {
            memory.saveMessage(userId, 'assistant', responseText);

            // Try to extract facts from the conversation
            extractAndSaveFacts(userId, incomingMsg);
        }

        // Truncate response if too long for WhatsApp (max 1600 chars)
        if (responseText.length > 1550) {
            responseText = responseText.substring(0, 1500) + '\n\n_[Message truncated - type a more specific command]_';
        }

        // Send response via Twilio (async - not in webhook response)
        await twilioClient.messages.create({
            body: responseText,
            from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
            to: fromNumber
        });

        console.log(`[${new Date().toISOString()}] Sent: "${responseText.substring(0, 50)}..."`);

    } catch (error) {
        console.error('Error processing message async:', error);
        // Try to send error message to user
        try {
            await twilioClient.messages.create({
                body: `Sorry, I had trouble processing that. Try again or type "help". Error: ${error.message}`,
                from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
                to: fromNumber
            });
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

// Start server
app.listen(port, '0.0.0.0', () => {
    console.log('');
    console.log('ClawdBot WhatsApp Server v2.1');
    console.log('=====================================');
    console.log(`   Port: ${port}`);
    console.log(`   User: ${process.env.YOUR_WHATSAPP}`);
    console.log(`   Repos: ${process.env.REPOS_TO_MONITOR}`);
    console.log('');
    console.log('   Endpoints:');
    console.log(`   • POST /webhook        - Twilio WhatsApp`);
    console.log(`   • POST /github-webhook - GitHub events`);
    console.log(`   • GET  /health         - Health check`);
    console.log('');
    console.log('   Features:');
    console.log(`   • Memory: ${memory ? 'Persistent' : 'In-memory only'}`);
    console.log(`   • Skills: ${skillRegistry ? 'Loaded' : 'Not available'}`);
    console.log(`   • Scheduler: ${scheduler ? 'Active' : 'Not available'}`);
    console.log(`   • SmartRouter: Active (NL -> commands)`);
    console.log(`   • GitHub Webhook: ${process.env.GITHUB_WEBHOOK_SECRET ? 'Secured' : 'Open (no secret)'}`);
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
