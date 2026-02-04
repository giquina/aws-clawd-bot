/**
 * Voice Call Skill - Make and manage voice calls via Twilio
 *
 * Enables ClawdBot to make outbound phone calls with text-to-speech
 * and speech recognition. Perfect for urgent notifications or
 * hands-free interaction.
 *
 * Commands:
 *   call me                           - Call immediately with a greeting
 *   call me about <message>           - Call with a specific message
 *   call me at HH:MM                  - Schedule a call for a specific time
 *   call me in X minutes/hours        - Schedule a call with a delay
 *   hang up / end call                - End the active call
 *   voice status                      - Show voice calling status
 *   voice voices                      - List available TTS voices
 *   voice set voice <name>            - Set default voice
 *
 * @example
 * call me                              → Call now with greeting
 * call me about the deployment         → Call with message
 * call me at 14:30                     → Schedule call for 2:30 PM
 * call me in 30 minutes                → Schedule call in 30 min
 * hang up                              → End active call
 */

const BaseSkill = require('../base-skill');
const { voiceHandler } = require('../../voice-handler');

class VoiceCallSkill extends BaseSkill {
    name = 'voice-call';
    description = 'Make and receive voice calls via Twilio';
    priority = 85; // High priority for call commands

    commands = [
        {
            pattern: /^call me$/i,
            description: 'Call you now with a greeting',
            usage: 'call me'
        },
        {
            pattern: /^call me (about|with|regarding|for)\s+(.+)$/i,
            description: 'Call with a specific message',
            usage: 'call me about <message>'
        },
        {
            pattern: /^call me at (\d{1,2})[:\.](\d{2})(\s*[ap]m)?$/i,
            description: 'Schedule a call for a specific time',
            usage: 'call me at HH:MM'
        },
        {
            pattern: /^call me in (\d+)\s*(minutes?|mins?|m|hours?|hrs?|h)$/i,
            description: 'Schedule a call with a delay',
            usage: 'call me in 30 minutes'
        },
        {
            pattern: /^(hang up|end call|stop calling)$/i,
            description: 'End the active call',
            usage: 'hang up'
        },
        {
            pattern: /^voice status$/i,
            description: 'Show voice calling configuration status',
            usage: 'voice status'
        },
        {
            pattern: /^voice voices$/i,
            description: 'List available TTS voices',
            usage: 'voice voices'
        },
        {
            pattern: /^voice set voice (\w+)$/i,
            description: 'Set the default TTS voice',
            usage: 'voice set voice amy'
        },
        {
            pattern: /^urgent call\s+(.+)$/i,
            description: 'Make an urgent call',
            usage: 'urgent call <message>'
        }
    ];

    constructor(context = {}) {
        super(context);
        this.scheduledCalls = new Map(); // Track scheduled calls
    }

    async execute(command, context) {
        const parsed = this.parseCommand(command);
        const lowerCmd = parsed.raw.toLowerCase();

        // Voice status
        if (lowerCmd === 'voice status') {
            return this.handleStatus();
        }

        // List voices
        if (lowerCmd === 'voice voices') {
            return this.handleListVoices();
        }

        // Set voice
        const setVoiceMatch = lowerCmd.match(/^voice set voice (\w+)$/i);
        if (setVoiceMatch) {
            return this.handleSetVoice(setVoiceMatch[1]);
        }

        // End call
        if (/^(hang up|end call|stop calling)$/i.test(lowerCmd)) {
            return this.handleEndCall();
        }

        // Check if voice calling is available for remaining commands
        if (!voiceHandler.isAvailable()) {
            return this.handleNotConfigured();
        }

        // Immediate call with greeting
        if (lowerCmd === 'call me') {
            return this.handleCallNow();
        }

        // Call with message
        const msgMatch = parsed.raw.match(/^call me (about|with|regarding|for)\s+(.+)$/i);
        if (msgMatch) {
            const message = msgMatch[2].trim();
            return this.handleCallWithMessage(message);
        }

        // Urgent call
        const urgentMatch = parsed.raw.match(/^urgent call\s+(.+)$/i);
        if (urgentMatch) {
            const message = urgentMatch[1].trim();
            return this.handleUrgentCall(message);
        }

        // Schedule call at specific time
        const timeMatch = parsed.raw.match(/^call me at (\d{1,2})[:\.](\d{2})(\s*[ap]m)?$/i);
        if (timeMatch) {
            let hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const ampm = (timeMatch[3] || '').toLowerCase().trim();

            // Handle AM/PM
            if (ampm === 'pm' && hours < 12) {
                hours += 12;
            } else if (ampm === 'am' && hours === 12) {
                hours = 0;
            }

            return this.handleScheduleCallAtTime(hours, minutes);
        }

        // Schedule call with delay
        const delayMatch = parsed.raw.match(/^call me in (\d+)\s*(minutes?|mins?|m|hours?|hrs?|h)$/i);
        if (delayMatch) {
            const amount = parseInt(delayMatch[1]);
            const unit = delayMatch[2].toLowerCase();
            return this.handleScheduleCallWithDelay(amount, unit);
        }

        return this.error('Unknown call command. Try "call me" or "voice status".');
    }

    /**
     * Handle immediate call
     */
    async handleCallNow() {
        try {
            const greeting = this.getGreeting();
            const call = await voiceHandler.callUser(greeting);

            return this.success(
                `*Calling you now...*\n\n` +
                `I'll say: "${greeting}"\n\n` +
                `Call ID: ${call.sid}\n` +
                `_Say "hang up" to end the call_`
            );
        } catch (err) {
            this.log('error', 'Call failed', err);
            return this.error(`Failed to initiate call: ${err.message}`);
        }
    }

    /**
     * Handle call with specific message
     */
    async handleCallWithMessage(message) {
        try {
            const fullMessage = `Hello! ClawdBot here. ${message}`;
            const call = await voiceHandler.callUser(fullMessage);

            return this.success(
                `*Calling you now...*\n\n` +
                `Message: "${message}"\n\n` +
                `Call ID: ${call.sid}\n` +
                `_You can respond during the call_`
            );
        } catch (err) {
            this.log('error', 'Call failed', err);
            return this.error(`Failed to initiate call: ${err.message}`);
        }
    }

    /**
     * Handle urgent call
     */
    async handleUrgentCall(message) {
        try {
            const call = await voiceHandler.callUser(message, { urgent: true });

            return this.success(
                `*URGENT call initiated*\n\n` +
                `Message: "${message}"\n\n` +
                `Call ID: ${call.sid}`
            );
        } catch (err) {
            this.log('error', 'Urgent call failed', err);
            return this.error(`Failed to initiate urgent call: ${err.message}`);
        }
    }

    /**
     * Handle scheduling call at specific time
     */
    async handleScheduleCallAtTime(hours, minutes) {
        // Validate time
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return this.error(
                'Invalid time format.\n\n' +
                'Use 24-hour format (HH:MM) or 12-hour with am/pm\n' +
                'Examples: 14:30, 9:00am, 2:30pm'
            );
        }

        // Calculate delay
        const now = new Date();
        const targetTime = new Date();
        targetTime.setHours(hours, minutes, 0, 0);

        // If time has passed today, schedule for tomorrow
        if (targetTime <= now) {
            targetTime.setDate(targetTime.getDate() + 1);
        }

        const delayMs = targetTime.getTime() - now.getTime();

        // Max 24 hours
        if (delayMs > 24 * 60 * 60 * 1000) {
            return this.error('Calls can only be scheduled up to 24 hours in advance.');
        }

        try {
            const greeting = `Hello! This is your scheduled call from ClawdBot. It's now ${this.formatTime(targetTime)}.`;
            const scheduled = voiceHandler.scheduleCall(greeting, delayMs);

            // Store for cancellation
            this.scheduledCalls.set(scheduled.id, scheduled);

            const isToday = targetTime.getDate() === now.getDate();
            const dayStr = isToday ? 'today' : 'tomorrow';
            const timeStr = this.formatTime(targetTime);

            return this.success(
                `*Call scheduled!*\n\n` +
                `I'll call you at ${timeStr} ${dayStr}\n\n` +
                `Schedule ID: ${scheduled.id.split('_')[1]}\n` +
                `_Reply "cancel call" to cancel_`
            );
        } catch (err) {
            this.log('error', 'Schedule call failed', err);
            return this.error(`Failed to schedule call: ${err.message}`);
        }
    }

    /**
     * Handle scheduling call with delay
     */
    async handleScheduleCallWithDelay(amount, unit) {
        // Validate
        if (amount <= 0) {
            return this.error('Please specify a positive number.');
        }

        // Calculate delay in ms
        let delayMs;
        const unitLower = unit.toLowerCase();

        if (unitLower.startsWith('h')) {
            if (amount > 24) {
                return this.error('Maximum delay is 24 hours.');
            }
            delayMs = amount * 60 * 60 * 1000;
        } else {
            if (amount > 1440) {
                return this.error('Maximum delay is 1440 minutes (24 hours).');
            }
            delayMs = amount * 60 * 1000;
        }

        try {
            const targetTime = new Date(Date.now() + delayMs);
            const greeting = `Hello! This is your scheduled call from ClawdBot. It's now ${this.formatTime(targetTime)}.`;
            const scheduled = voiceHandler.scheduleCall(greeting, delayMs);

            // Store for cancellation
            this.scheduledCalls.set(scheduled.id, scheduled);

            const unitDisplay = unitLower.startsWith('h') ?
                (amount === 1 ? 'hour' : 'hours') :
                (amount === 1 ? 'minute' : 'minutes');

            return this.success(
                `*Call scheduled!*\n\n` +
                `I'll call you in ${amount} ${unitDisplay}\n` +
                `(at ${this.formatTime(targetTime)})\n\n` +
                `Schedule ID: ${scheduled.id.split('_')[1]}\n` +
                `_Reply "cancel call" to cancel_`
            );
        } catch (err) {
            this.log('error', 'Schedule call failed', err);
            return this.error(`Failed to schedule call: ${err.message}`);
        }
    }

    /**
     * Handle ending the active call
     */
    async handleEndCall() {
        try {
            await voiceHandler.endCall();
            return this.success('Call ended.');
        } catch (err) {
            if (err.message.includes('No active call')) {
                return this.error('No active call to end.');
            }
            this.log('error', 'End call failed', err);
            return this.error(`Failed to end call: ${err.message}`);
        }
    }

    /**
     * Handle voice status command
     */
    handleStatus() {
        const status = voiceHandler.getStatus();

        let response = '*Voice Calling Status*\n\n';

        if (status.available) {
            response += '*Status:* Online\n';
            response += `*Phone Number:* ${process.env.TWILIO_PHONE_NUMBER || 'Set'}\n`;
            response += `*Default Voice:* ${status.defaultVoice}\n`;
            response += `*Active Calls:* ${status.activeCallsCount}\n`;

            if (status.activeCall) {
                response += `*Current Call:* ${status.activeCall}\n`;
            }

            const scheduledCount = this.scheduledCalls.size;
            if (scheduledCount > 0) {
                response += `*Scheduled Calls:* ${scheduledCount}\n`;
            }

            response += '\n_Try "call me" or "call me about X"_';
        } else {
            response += '*Status:* Not Configured\n\n';
            response += 'Missing configuration:\n';

            if (!status.hasClient) {
                response += '  - Twilio client not initialized\n';
            }
            if (!status.hasPhoneNumber) {
                response += '  - TWILIO_PHONE_NUMBER not set\n';
            }
            if (!status.hasBaseUrl) {
                response += '  - BASE_URL not set\n';
            }
            if (!status.hasRecipientNumber) {
                response += '  - YOUR_PHONE_NUMBER not set\n';
            }

            response += '\nAdd these to your .env.local file.';
        }

        return this.success(response);
    }

    /**
     * Handle listing available voices
     */
    handleListVoices() {
        const voices = voiceHandler.getVoices();
        const defaultVoice = voiceHandler.defaultVoice;

        let response = '*Available Voices*\n\n';

        for (const [key, config] of Object.entries(voices)) {
            const isDefault = key === defaultVoice ? ' (default)' : '';
            response += `*${key}*${isDefault}\n`;
            response += `  ${config.description} (${config.language})\n`;
        }

        response += '\nSet default: voice set voice <name>';

        return this.success(response);
    }

    /**
     * Handle setting default voice
     */
    handleSetVoice(voiceName) {
        const voiceKey = voiceName.toLowerCase();

        try {
            voiceHandler.setDefaultVoice(voiceKey);
            const voices = voiceHandler.getVoices();
            const config = voices[voiceKey];

            return this.success(
                `*Voice updated*\n\n` +
                `Default voice set to: ${voiceKey}\n` +
                `${config.description} (${config.language})`
            );
        } catch (err) {
            const voices = voiceHandler.getVoices();
            return this.error(
                `Unknown voice: ${voiceName}\n\n` +
                `Available voices:\n${Object.keys(voices).join(', ')}`
            );
        }
    }

    /**
     * Handle not configured error
     */
    handleNotConfigured() {
        return this.error(
            '*Voice calling not configured*\n\n' +
            'Required environment variables:\n' +
            '- TWILIO_PHONE_NUMBER (voice-enabled number)\n' +
            '- YOUR_PHONE_NUMBER (recipient)\n' +
            '- BASE_URL (for webhooks)\n\n' +
            'Run "voice status" for details.'
        );
    }

    /**
     * Get a greeting message
     */
    getGreeting() {
        const hour = new Date().getHours();
        let timeOfDay = 'Hello';

        if (hour < 12) {
            timeOfDay = 'Good morning';
        } else if (hour < 18) {
            timeOfDay = 'Good afternoon';
        } else {
            timeOfDay = 'Good evening';
        }

        return `${timeOfDay}! This is ClawdBot. I'm checking in to see if you need anything.`;
    }

    /**
     * Format time as HH:MM
     */
    formatTime(date) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    async initialize() {
        await super.initialize();
        this.log('info', 'Voice Call skill initialized');

        // Log configuration status
        const status = voiceHandler.getStatus();
        if (status.available) {
            this.log('info', 'Voice calling is available');
        } else {
            this.log('warn', 'Voice calling not fully configured - some env vars missing');
        }
    }

    async shutdown() {
        // Cancel all scheduled calls
        for (const [id, scheduled] of this.scheduledCalls) {
            try {
                scheduled.cancel();
            } catch (e) {
                // Ignore
            }
        }
        this.scheduledCalls.clear();

        await super.shutdown();
    }
}

module.exports = VoiceCallSkill;
