/**
 * Voice Flow Processor
 * Handles: Voice Note -> Transcription -> Intent -> Review -> Execute -> Report
 * All without leaving Telegram/WhatsApp
 *
 * Integrates with:
 * - Groq Whisper (FREE transcription)
 * - Intent Classifier (understanding)
 * - Action Controller (execution pipeline)
 * - Voice Pipeline (existing processing)
 */

const https = require('https');
const http = require('http');

class VoiceFlow {
    constructor() {
        // Lazy-loaded dependencies (avoid circular requires)
        this._intentClassifier = null;
        this._actionController = null;
        this._voicePipeline = null;

        // Simple logging (fallback if audit logger not available)
        this.logs = [];
        this.maxLogs = 100;
    }

    /**
     * Get intent classifier (lazy load)
     */
    get intentClassifier() {
        if (!this._intentClassifier) {
            try {
                this._intentClassifier = require('./intent-classifier');
                if (this._intentClassifier && typeof this._intentClassifier.initialize === 'function') {
                    this._intentClassifier.initialize();
                }
            } catch (e) {
                console.log('[VoiceFlow] Intent classifier not available:', e.message);
            }
        }
        return this._intentClassifier;
    }

    /**
     * Get action controller (lazy load)
     */
    get actionController() {
        if (!this._actionController) {
            try {
                const { actionController } = require('./action-controller');
                this._actionController = actionController;
            } catch (e) {
                console.log('[VoiceFlow] Action controller not available:', e.message);
            }
        }
        return this._actionController;
    }

    /**
     * Get voice pipeline (lazy load)
     */
    get voicePipeline() {
        if (!this._voicePipeline) {
            try {
                this._voicePipeline = require('./voice-pipeline');
                if (this._voicePipeline && typeof this._voicePipeline.initialize === 'function') {
                    this._voicePipeline.initialize();
                }
            } catch (e) {
                console.log('[VoiceFlow] Voice pipeline not available:', e.message);
            }
        }
        return this._voicePipeline;
    }

    /**
     * Simple audit logger
     */
    log(entry) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            ...entry
        };
        this.logs.push(logEntry);

        // Trim logs if too many
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        // Console output for debugging
        console.log(`[VoiceFlow] ${entry.type}: ${entry.userId || 'system'} - ${JSON.stringify(entry)}`);
    }

    /**
     * Log an error
     */
    logError(error, context = {}) {
        this.log({
            type: 'error',
            error: error.message,
            stack: error.stack?.split('\n').slice(0, 3).join('\n'),
            ...context
        });
    }

    /**
     * Process a voice note end-to-end
     * @param {string} audioUrl - URL to the audio file (Twilio/Telegram)
     * @param {string} userId - User identifier
     * @param {Object} context - Additional context (platform, activeProject, etc.)
     * @returns {Promise<Object>} Processing result with stage and message
     */
    async processVoiceNote(audioUrl, userId, context = {}) {
        const startTime = Date.now();

        try {
            // Step 1: Transcribe
            const transcription = await this.transcribe(audioUrl);

            this.log({
                type: 'voice_transcription',
                userId,
                duration: Date.now() - startTime,
                textLength: transcription.length,
                preview: transcription.substring(0, 50)
            });

            // Empty transcription check
            if (!transcription || transcription.trim().length === 0) {
                return {
                    stage: 'error',
                    message: 'Could not transcribe the voice message. Please try again or speak more clearly.'
                };
            }

            // Step 2: Show transcription to user (for verification)
            const transcriptMessage = `I heard: "${transcription}"\n\nProcessing...`;

            // Step 3: Classify intent
            let intent = null;
            if (this.intentClassifier) {
                intent = await this.intentClassifier.classify(transcription, {
                    ...context,
                    source: 'voice',
                    hasMedia: false // Audio already processed
                });

                this.log({
                    type: 'intent_classified',
                    userId,
                    intent: intent.intent,
                    project: intent.project,
                    confidence: intent.confidence
                });
            }

            // If no intent classifier, use basic classification
            if (!intent) {
                intent = this.basicClassify(transcription);
            }

            // Step 4: Handle based on confidence and ambiguity
            if (intent.confidence < 0.3 || this.isAmbiguous(transcription, intent)) {
                const clarifyQuestion = this.generateClarifyingQuestion(transcription, intent);
                return {
                    stage: 'clarify',
                    transcription,
                    message: `"${this.truncate(transcription, 100)}"\n\n${clarifyQuestion}`,
                    intent
                };
            }

            // Step 5: Propose action through action controller
            if (this.actionController && intent.action) {
                const proposal = await this.actionController.proposeAction(intent, {
                    ...context,
                    userId,
                    source: 'voice'
                });

                this.log({
                    type: 'action_proposed',
                    userId,
                    flow: proposal.flow,
                    actionId: proposal.action?.id
                });

                // Step 6: Return appropriate response based on flow
                return this.buildResponse(proposal, transcription, intent);
            }

            // No action needed - just return the transcription with context
            return this.buildSimpleResponse(transcription, intent);

        } catch (error) {
            this.logError(error, { userId, stage: 'voice_flow' });
            return {
                stage: 'error',
                message: `Sorry, I couldn't process that voice note. Error: ${error.message}`
            };
        }
    }

    /**
     * Build response based on action controller proposal
     */
    buildResponse(proposal, transcription, intent) {
        const truncatedTranscript = this.truncate(transcription, 100);

        switch (proposal.flow) {
            case 'auto_execute':
                // High confidence, low risk - will execute immediately
                return {
                    stage: 'auto_execute',
                    transcription,
                    message: `"${truncatedTranscript}"\n\n${proposal.message}`,
                    actionId: proposal.action.id,
                    intent,
                    proposal
                };

            case 'confirm':
                // Needs confirmation
                return {
                    stage: 'confirm',
                    transcription,
                    message: `"${truncatedTranscript}"\n\n${proposal.message}`,
                    actionId: proposal.action.id,
                    intent
                };

            case 'clarify':
                return {
                    stage: 'clarify',
                    transcription,
                    message: `"${truncatedTranscript}"\n\n${proposal.message}`,
                    intent
                };

            case 'reject':
                return {
                    stage: 'reject',
                    transcription,
                    message: `"${truncatedTranscript}"\n\nI couldn't understand that clearly. Could you rephrase or type the command?`,
                    intent
                };

            default:
                return this.buildSimpleResponse(transcription, intent);
        }
    }

    /**
     * Build a simple response when no action is needed
     */
    buildSimpleResponse(transcription, intent) {
        const truncatedTranscript = this.truncate(transcription, 200);
        let message = `"${truncatedTranscript}"`;

        // Add context if we detected something
        if (intent && intent.confidence > 0.5) {
            if (intent.project) {
                message += `\n\n*Project:* ${intent.project}`;
            }
            if (intent.intent && intent.intent !== 'unknown') {
                message += `\n*Intent:* ${intent.intent}`;
            }
            if (intent.company) {
                message += `\n*Company:* ${intent.company}`;
            }
        }

        return {
            stage: 'transcribed',
            transcription,
            message,
            intent
        };
    }

    /**
     * Transcribe audio using Groq Whisper (FREE)
     * @param {string} audioUrl - URL to download audio from
     * @returns {Promise<string>} Transcribed text
     */
    async transcribe(audioUrl) {
        // Check for Groq API key
        if (!process.env.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY not configured. Get one FREE at console.groq.com');
        }

        // Download audio file
        const audioBuffer = await this.downloadAudio(audioUrl);

        if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('Failed to download audio file');
        }

        console.log(`[VoiceFlow] Downloaded audio: ${audioBuffer.length} bytes`);

        // Transcribe with Groq Whisper
        return await this.transcribeWithGroq(audioBuffer);
    }

    /**
     * Download audio from URL (handles Twilio and Telegram)
     */
    async downloadAudio(url) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;

            // Build URL with auth for Twilio
            let requestUrl = url;
            const authHeader = {};

            if (url.includes('twilio.com') || url.includes('api.twilio.com')) {
                // Twilio requires Basic auth
                if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
                    authHeader['Authorization'] = 'Basic ' + Buffer.from(
                        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
                    ).toString('base64');
                }
            }

            const options = {
                headers: authHeader
            };

            // Parse URL for https.get
            const urlObj = new URL(requestUrl);
            const getOptions = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                headers: authHeader
            };

            protocol.get(getOptions, (res) => {
                // Handle redirects
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
                    this.downloadAudio(res.headers.location).then(resolve).catch(reject);
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`Failed to download audio: HTTP ${res.statusCode}`));
                    return;
                }

                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
            }).on('error', reject);
        });
    }

    /**
     * Transcribe audio buffer using Groq Whisper API
     */
    async transcribeWithGroq(audioBuffer) {
        return new Promise((resolve, reject) => {
            // Build multipart form data
            const boundary = '----VoiceFlowBoundary' + Math.random().toString(36).substring(2);

            // File part
            const filePart = `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="file"; filename="audio.ogg"\r\n` +
                `Content-Type: audio/ogg\r\n\r\n`;

            // Model part
            const modelPart = `\r\n--${boundary}\r\n` +
                `Content-Disposition: form-data; name="model"\r\n\r\n` +
                `whisper-large-v3`;

            // Response format part
            const formatPart = `\r\n--${boundary}\r\n` +
                `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
                `text`;

            // Language hint (optional but helps accuracy)
            const langPart = `\r\n--${boundary}\r\n` +
                `Content-Disposition: form-data; name="language"\r\n\r\n` +
                `en`;

            const endBoundary = `\r\n--${boundary}--\r\n`;

            // Combine all parts
            const preFile = Buffer.from(filePart, 'utf8');
            const postFile = Buffer.from(modelPart + formatPart + langPart + endBoundary, 'utf8');
            const fullBody = Buffer.concat([preFile, audioBuffer, postFile]);

            const options = {
                hostname: 'api.groq.com',
                path: '/openai/v1/audio/transcriptions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': fullBody.length
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(data.trim());
                    } else {
                        console.error('[VoiceFlow] Groq API error:', res.statusCode, data);
                        reject(new Error(`Groq transcription failed: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(fullBody);
            req.end();
        });
    }

    /**
     * Basic intent classification when classifier not available
     */
    basicClassify(transcription) {
        const text = transcription.toLowerCase();
        const result = {
            intent: 'unknown',
            project: null,
            company: null,
            confidence: 0.3,
            action: null
        };

        // Deploy patterns
        if (text.match(/\b(deploy|push|ship|release)\b/)) {
            result.intent = 'deploy';
            result.action = 'deploy';
            result.confidence = 0.7;
        }
        // Status patterns
        else if (text.match(/\b(status|what's left|tasks|todo|progress)\b/)) {
            result.intent = 'check-status';
            result.action = 'check-status';
            result.confidence = 0.7;
        }
        // Create patterns
        else if (text.match(/\b(create|add|make|build)\b.*(page|feature|component|function)/)) {
            result.intent = 'create-feature';
            result.action = 'create-feature';
            result.confidence = 0.6;
        }
        // Fix/bug patterns
        else if (text.match(/\b(fix|bug|error|issue|problem)\b/)) {
            result.intent = 'code-task';
            result.action = 'code-task';
            result.confidence = 0.6;
        }

        // Try to detect project names (common ones)
        const projectPatterns = [
            { pattern: /\b(clawd|clawdbot|bot)\b/i, project: 'aws-clawd-bot' },
            { pattern: /\bjudo\b/i, project: 'judo-website' },
            { pattern: /\bluso\b/i, project: 'lusotown' },
            { pattern: /\bgiquina\b/i, project: 'giquina-accountancy' },
            { pattern: /\bdashboard\b/i, project: 'dashboard' }
        ];

        for (const { pattern, project } of projectPatterns) {
            if (text.match(pattern)) {
                result.project = project;
                result.confidence = Math.min(result.confidence + 0.1, 0.9);
                break;
            }
        }

        // Company detection
        const companyPatterns = [
            { pattern: /\bgqcars\b/i, company: 'GQCARS' },
            { pattern: /\bgmh\b/i, company: 'GMH' },
            { pattern: /\bgacc\b/i, company: 'GACC' },
            { pattern: /\bgcap\b/i, company: 'GCAP' },
            { pattern: /\bgspv\b/i, company: 'GSPV' }
        ];

        for (const { pattern, company } of companyPatterns) {
            if (text.match(pattern)) {
                result.company = company;
                break;
            }
        }

        return result;
    }

    /**
     * Check if the transcription is ambiguous
     */
    isAmbiguous(transcription, intent) {
        const text = transcription.toLowerCase();

        // Very short messages are often ambiguous
        if (text.split(/\s+/).length < 3) {
            return true;
        }

        // Questions without clear target
        if (text.match(/^(what|which|where|how|can|should)\b/) && !intent.project) {
            return true;
        }

        // Low confidence with action
        if (intent.action && intent.confidence < 0.5) {
            return true;
        }

        return false;
    }

    /**
     * Generate a clarifying question based on what we detected
     */
    generateClarifyingQuestion(transcription, intent) {
        const questions = [];

        if (intent.action && !intent.project) {
            questions.push('Which project should I use?');
        }

        if (!intent.action && intent.project) {
            questions.push('What would you like me to do?');
        }

        if (!intent.action && !intent.project) {
            questions.push('I\'m not sure what you need. Could you clarify?');
        }

        // Add examples based on detected intent
        if (intent.intent === 'deploy') {
            questions.push('Try: "deploy aws-clawd-bot"');
        } else if (intent.intent === 'check-status') {
            questions.push('Try: "status of judo-website"');
        }

        return questions.join('\n');
    }

    /**
     * Execute a confirmed action
     * @param {string} actionId - The action ID to execute
     * @returns {Promise<Object>} Execution result
     */
    async executeAction(actionId) {
        if (!this.actionController) {
            return {
                success: false,
                message: 'Action controller not available'
            };
        }

        try {
            const result = await this.actionController.executeAction(actionId);

            this.log({
                type: 'action_executed',
                actionId,
                status: result.status,
                success: result.status === 'completed'
            });

            return {
                success: result.status === 'completed',
                message: result.message,
                undoAvailable: result.undoAvailable,
                results: result.results
            };
        } catch (error) {
            this.logError(error, { actionId, stage: 'execute' });
            return {
                success: false,
                message: `Execution failed: ${error.message}`
            };
        }
    }

    /**
     * Handle user confirmation response
     * @param {string} response - User's response (yes/no/etc)
     * @param {string} actionId - Pending action ID
     * @param {string} userId - User identifier
     * @returns {Promise<Object>} Result of confirmation handling
     */
    async handleConfirmation(response, actionId, userId) {
        const normalized = response.toLowerCase().trim();

        // Positive responses
        if (['yes', 'y', 'ok', 'go', 'do it', 'proceed', 'confirm', 'yep', 'yeah', 'sure'].includes(normalized)) {
            return await this.executeAction(actionId);
        }

        // Negative responses
        if (['no', 'n', 'cancel', 'stop', 'abort', 'nope', 'nah', 'nevermind'].includes(normalized)) {
            if (this.actionController) {
                this.actionController.cancel(actionId);
            }
            return {
                success: true,
                cancelled: true,
                message: 'Cancelled. Let me know if you need anything else.'
            };
        }

        // Explain request
        if (['explain', 'what', 'why', 'details', 'more'].includes(normalized)) {
            if (this.actionController) {
                const explanation = this.actionController.explain(actionId);
                return {
                    success: true,
                    needsConfirmation: true,
                    message: explanation.message
                };
            }
        }

        // Unknown response
        return {
            success: false,
            needsConfirmation: true,
            message: 'Reply *yes* to proceed, *no* to cancel, or *explain* for details.'
        };
    }

    /**
     * Generate voice-friendly response
     * (For when we call back or use TTS)
     * @param {string} response - Original response text
     * @returns {string} Clean text suitable for speech
     */
    formatForVoice(response) {
        return response
            // Remove markdown formatting
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/_/g, '')
            .replace(/`/g, '')
            // Remove emojis
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
            // Remove button/link syntax
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/\[([^\]]+)\]/g, '$1')
            // Clean up whitespace
            .replace(/\n+/g, '. ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Truncate text with ellipsis
     */
    truncate(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    /**
     * Get recent logs for debugging
     */
    getRecentLogs(count = 10) {
        return this.logs.slice(-count);
    }

    /**
     * Clear logs
     */
    clearLogs() {
        this.logs = [];
    }
}

// Singleton instance
const voiceFlow = new VoiceFlow();

module.exports = { VoiceFlow, voiceFlow };
