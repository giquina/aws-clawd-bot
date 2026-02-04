/**
 * Voice Handler - Twilio Voice calling support for ClawdBot
 *
 * Enables outbound voice calls with text-to-speech and speech recognition.
 * Integrates with the existing Twilio client used for WhatsApp.
 *
 * Features:
 * - Outbound calls with customizable TTS voices
 * - Speech recognition for user responses
 * - Call status tracking
 * - Integration with AI handler for conversational responses
 *
 * @example
 * const { voiceHandler } = require('./voice-handler');
 * voiceHandler.initialize(twilioClient);
 * await voiceHandler.callUser('Hello, this is ClawdBot!');
 */

const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

// AI handler for processing speech responses
let aiHandler = null;
try {
    aiHandler = require('./ai-handler');
} catch (e) {
    console.log('[Voice] AI handler not available');
}

class VoiceHandler {
    constructor() {
        this.client = null; // Twilio client (shared with WhatsApp)
        this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
        this.recipientNumber = process.env.YOUR_PHONE_NUMBER;
        this.baseUrl = process.env.BASE_URL;
        this.activeCallSid = null;
        this.callContext = new Map(); // Store context per call (CallSid -> context)
        this.callCallbacks = new Map(); // Store callbacks for call completion

        // Available Twilio Polly voices
        this.voices = {
            'amy': { name: 'Polly.Amy', language: 'en-GB', description: 'British female' },
            'brian': { name: 'Polly.Brian', language: 'en-GB', description: 'British male' },
            'emma': { name: 'Polly.Emma', language: 'en-GB', description: 'British female' },
            'joanna': { name: 'Polly.Joanna', language: 'en-US', description: 'American female' },
            'matthew': { name: 'Polly.Matthew', language: 'en-US', description: 'American male' },
            'salli': { name: 'Polly.Salli', language: 'en-US', description: 'American female' },
            'ivy': { name: 'Polly.Ivy', language: 'en-US', description: 'American child female' },
            'kendra': { name: 'Polly.Kendra', language: 'en-US', description: 'American female' },
            'kimberly': { name: 'Polly.Kimberly', language: 'en-US', description: 'American female' },
            'joey': { name: 'Polly.Joey', language: 'en-US', description: 'American male' }
        };

        // Default voice
        this.defaultVoice = 'amy';
    }

    /**
     * Initialize the voice handler with the Twilio client
     * @param {Object} twilioClient - Twilio client instance
     */
    initialize(twilioClient) {
        this.client = twilioClient;

        // Refresh config from environment
        this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
        this.recipientNumber = process.env.YOUR_PHONE_NUMBER;
        this.baseUrl = process.env.BASE_URL;

        console.log('[Voice] Handler initialized');
        if (!this.phoneNumber) {
            console.log('[Voice] Warning: TWILIO_PHONE_NUMBER not set');
        }
        if (!this.baseUrl) {
            console.log('[Voice] Warning: BASE_URL not set - voice callbacks will fail');
        }
    }

    /**
     * Check if voice calling is available
     * @returns {boolean} - True if voice calling is configured
     */
    isAvailable() {
        return !!(this.client && this.phoneNumber && this.baseUrl);
    }

    /**
     * Get configuration status for diagnostics
     * @returns {Object} - Configuration status
     */
    getStatus() {
        return {
            available: this.isAvailable(),
            hasClient: !!this.client,
            hasPhoneNumber: !!this.phoneNumber,
            hasBaseUrl: !!this.baseUrl,
            hasRecipientNumber: !!this.recipientNumber,
            activeCall: this.activeCallSid,
            activeCallsCount: this.callContext.size,
            defaultVoice: this.defaultVoice
        };
    }

    /**
     * Make an outbound call
     * @param {string} message - Message to speak when call is answered
     * @param {Object} options - Call options
     * @param {string} options.toNumber - Phone number to call (defaults to YOUR_PHONE_NUMBER)
     * @param {string} options.voice - Voice to use (defaults to 'amy')
     * @param {boolean} options.urgent - Whether this is an urgent call
     * @param {boolean} options.allowResponse - Whether to gather speech input (default: true)
     * @param {Function} options.callback - Callback function when call completes
     * @returns {Promise<Object>} - Twilio call object
     */
    async callUser(message, options = {}) {
        if (!this.isAvailable()) {
            throw new Error('Voice calling not configured. Set TWILIO_PHONE_NUMBER and BASE_URL.');
        }

        const toNumber = options.toNumber || this.recipientNumber;
        if (!toNumber) {
            throw new Error('No recipient phone number specified. Set YOUR_PHONE_NUMBER or pass toNumber option.');
        }

        const voiceKey = options.voice || this.defaultVoice;
        const allowResponse = options.allowResponse !== false;

        // Build TwiML URL with parameters
        const params = new URLSearchParams({
            message: message,
            voice: voiceKey,
            allowResponse: allowResponse.toString(),
            urgent: (options.urgent || false).toString()
        });

        const twimlUrl = `${this.baseUrl}/voice/outbound?${params.toString()}`;

        try {
            console.log(`[Voice] Initiating call to ${toNumber}`);

            const call = await this.client.calls.create({
                url: twimlUrl,
                to: toNumber,
                from: this.phoneNumber,
                statusCallback: `${this.baseUrl}/voice/status`,
                statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
                statusCallbackMethod: 'POST'
            });

            this.activeCallSid = call.sid;

            // Store call context
            this.callContext.set(call.sid, {
                startTime: new Date(),
                message: message,
                toNumber: toNumber,
                voice: voiceKey,
                urgent: options.urgent || false,
                status: 'initiated'
            });

            // Store callback if provided
            if (options.callback) {
                this.callCallbacks.set(call.sid, options.callback);
            }

            console.log(`[Voice] Call initiated: ${call.sid}`);
            return call;

        } catch (error) {
            console.error('[Voice] Call failed:', error.message);
            throw error;
        }
    }

    /**
     * Generate TwiML for outbound call
     * @param {string} message - Message to speak
     * @param {Object} options - TwiML options
     * @param {string} options.voice - Voice key (defaults to 'amy')
     * @param {boolean} options.allowResponse - Whether to gather speech input
     * @param {boolean} options.urgent - Whether this is an urgent call (affects tone)
     * @returns {string} - TwiML XML string
     */
    generateOutboundTwiML(message, options = {}) {
        const response = new VoiceResponse();

        const voiceKey = options.voice || this.defaultVoice;
        const voiceConfig = this.voices[voiceKey] || this.voices[this.defaultVoice];
        const allowResponse = options.allowResponse !== false;

        // Add urgent prefix if needed
        let spokenMessage = message;
        if (options.urgent) {
            spokenMessage = 'Urgent notification. ' + message;
        }

        // Speak the main message
        response.say({
            voice: voiceConfig.name,
            language: voiceConfig.language
        }, spokenMessage);

        // Gather speech input if enabled
        if (allowResponse) {
            const gather = response.gather({
                input: 'speech',
                timeout: 5,
                speechTimeout: 'auto',
                action: `${this.baseUrl}/voice/response`,
                method: 'POST',
                language: voiceConfig.language
            });

            gather.say({
                voice: voiceConfig.name,
                language: voiceConfig.language
            }, 'You can respond now, or say goodbye to hang up.');

            // If no input after gather, say goodbye
            response.say({
                voice: voiceConfig.name,
                language: voiceConfig.language
            }, 'Thank you. Goodbye!');
            response.hangup();
        } else {
            // No response expected, just end
            response.say({
                voice: voiceConfig.name,
                language: voiceConfig.language
            }, 'Goodbye!');
            response.hangup();
        }

        return response.toString();
    }

    /**
     * Handle speech response from user during call
     * @param {string} speechResult - Transcribed speech from user
     * @param {string} callSid - Call SID
     * @param {Object} context - Additional context
     * @returns {Promise<string>} - TwiML response
     */
    async handleSpeechResponse(speechResult, callSid, context = {}) {
        const response = new VoiceResponse();
        const voiceConfig = this.voices[this.defaultVoice];

        console.log(`[Voice] Speech received on call ${callSid}: "${speechResult}"`);

        // Get call context
        const callCtx = this.callContext.get(callSid) || {};

        // Check for goodbye/end call keywords
        const lowerSpeech = (speechResult || '').toLowerCase();
        if (lowerSpeech.includes('goodbye') || lowerSpeech.includes('bye') ||
            lowerSpeech.includes('hang up') || lowerSpeech.includes('end call')) {
            response.say({
                voice: voiceConfig.name,
                language: voiceConfig.language
            }, 'Goodbye! Have a great day.');
            response.hangup();
            return response.toString();
        }

        // Process through AI handler if available
        let aiResponse = 'I received your message.';
        if (aiHandler) {
            try {
                aiResponse = await aiHandler.processQuery(speechResult);
                // Truncate for voice (max ~30 seconds of speech)
                if (aiResponse.length > 500) {
                    aiResponse = aiResponse.substring(0, 497) + '...';
                }
            } catch (err) {
                console.error('[Voice] AI processing failed:', err.message);
                aiResponse = 'Sorry, I had trouble processing that. Please try again.';
            }
        }

        // Update call context
        if (callCtx) {
            callCtx.lastInteraction = new Date();
            callCtx.exchangeCount = (callCtx.exchangeCount || 0) + 1;
            this.callContext.set(callSid, callCtx);
        }

        // Speak the AI response
        response.say({
            voice: voiceConfig.name,
            language: voiceConfig.language
        }, aiResponse);

        // Allow another response (limit to 5 exchanges to prevent infinite loops)
        if ((callCtx.exchangeCount || 0) < 5) {
            const gather = response.gather({
                input: 'speech',
                timeout: 5,
                speechTimeout: 'auto',
                action: `${this.baseUrl}/voice/response`,
                method: 'POST',
                language: voiceConfig.language
            });

            gather.say({
                voice: voiceConfig.name,
                language: voiceConfig.language
            }, 'Anything else?');
        }

        // After gather timeout, say goodbye
        response.say({
            voice: voiceConfig.name,
            language: voiceConfig.language
        }, 'Goodbye!');
        response.hangup();

        return response.toString();
    }

    /**
     * Handle call status updates
     * @param {Object} statusData - Status callback data from Twilio
     */
    handleCallStatus(statusData) {
        const { CallSid, CallStatus, CallDuration, To, From } = statusData;

        console.log(`[Voice] Call ${CallSid}: ${CallStatus}`);

        // Update call context
        const ctx = this.callContext.get(CallSid);
        if (ctx) {
            ctx.status = CallStatus;
            if (CallDuration) {
                ctx.duration = parseInt(CallDuration);
            }
            this.callContext.set(CallSid, ctx);
        }

        // Handle completion
        if (CallStatus === 'completed' || CallStatus === 'failed' ||
            CallStatus === 'busy' || CallStatus === 'no-answer' || CallStatus === 'canceled') {

            // Execute callback if exists
            const callback = this.callCallbacks.get(CallSid);
            if (callback) {
                try {
                    callback({
                        callSid: CallSid,
                        status: CallStatus,
                        duration: CallDuration ? parseInt(CallDuration) : 0,
                        context: ctx
                    });
                } catch (err) {
                    console.error('[Voice] Callback error:', err.message);
                }
                this.callCallbacks.delete(CallSid);
            }

            // Clean up active call reference
            if (this.activeCallSid === CallSid) {
                this.activeCallSid = null;
            }

            // Keep context for a bit for debugging, then clean up
            setTimeout(() => {
                this.callContext.delete(CallSid);
            }, 60000); // Clean up after 1 minute
        }
    }

    /**
     * End an active call
     * @param {string} callSid - Call SID to end (defaults to active call)
     * @returns {Promise<Object>} - Updated call object
     */
    async endCall(callSid = null) {
        const sid = callSid || this.activeCallSid;
        if (!sid) {
            throw new Error('No active call to end');
        }

        if (!this.client) {
            throw new Error('Twilio client not initialized');
        }

        try {
            const call = await this.client.calls(sid).update({ status: 'completed' });
            console.log(`[Voice] Call ${sid} ended`);
            return call;
        } catch (error) {
            console.error('[Voice] Failed to end call:', error.message);
            throw error;
        }
    }

    /**
     * Get available voices
     * @returns {Object} - Map of voice keys to voice configs
     */
    getVoices() {
        return this.voices;
    }

    /**
     * Set default voice
     * @param {string} voiceKey - Voice key to use as default
     */
    setDefaultVoice(voiceKey) {
        if (this.voices[voiceKey]) {
            this.defaultVoice = voiceKey;
            console.log(`[Voice] Default voice set to: ${voiceKey}`);
        } else {
            throw new Error(`Unknown voice: ${voiceKey}. Available: ${Object.keys(this.voices).join(', ')}`);
        }
    }

    /**
     * Schedule a call for later
     * @param {string} message - Message to speak
     * @param {number} delayMs - Delay in milliseconds
     * @param {Object} options - Call options
     * @returns {Object} - Scheduled call info with cancel function
     */
    scheduleCall(message, delayMs, options = {}) {
        const scheduledId = `scheduled_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const scheduledTime = new Date(Date.now() + delayMs);

        console.log(`[Voice] Scheduling call for ${scheduledTime.toISOString()}`);

        const timeout = setTimeout(async () => {
            try {
                await this.callUser(message, options);
            } catch (err) {
                console.error(`[Voice] Scheduled call failed: ${err.message}`);
            }
        }, delayMs);

        return {
            id: scheduledId,
            scheduledTime: scheduledTime,
            message: message,
            cancel: () => {
                clearTimeout(timeout);
                console.log(`[Voice] Scheduled call ${scheduledId} cancelled`);
                return true;
            }
        };
    }
}

// Singleton instance
const voiceHandler = new VoiceHandler();

module.exports = { VoiceHandler, voiceHandler };
