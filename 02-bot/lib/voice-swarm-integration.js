/**
 * Voice-Swarm Integration
 *
 * Automatically detects when voice commands should trigger
 * parallel agent orchestration and enhances the prompt.
 */

const { swarmDetector } = require('./swarm-detector');

class VoiceSwarmIntegration {
    constructor() {
        this.enabled = true;
        this.minConfidence = 0.6; // Threshold for auto-swarm activation
    }

    /**
     * Process a voice transcript and determine if swarm mode should be used
     * @param {string} transcript - Transcribed voice command
     * @param {Object} context - Context (project, user, etc.)
     * @returns {Object} { useSwarm: boolean, enhancedPrompt: string, detection: Object }
     */
    async processVoiceCommand(transcript, context = {}) {
        if (!this.enabled) {
            return {
                useSwarm: false,
                enhancedPrompt: transcript,
                detection: null
            };
        }

        // Detect if this should use swarm
        const detection = swarmDetector.detectSwarmWorthiness(transcript, context);

        // Log detection for debugging
        console.log('[Voice-Swarm] Detection result:', {
            transcript: transcript.substring(0, 100),
            shouldSwarm: detection.shouldSwarm,
            confidence: detection.confidence,
            reason: detection.reason
        });

        if (detection.shouldSwarm && detection.confidence >= this.minConfidence) {
            // Generate enhanced prompt with swarm instructions
            const enhancedPrompt = swarmDetector.generateSwarmPrompt(transcript, detection);

            return {
                useSwarm: true,
                enhancedPrompt,
                detection,
                originalTranscript: transcript
            };
        }

        // Not swarm-worthy, return original
        return {
            useSwarm: false,
            enhancedPrompt: transcript,
            detection
        };
    }

    /**
     * Enable or disable voice-swarm integration
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        console.log(`[Voice-Swarm] ${enabled ? 'Enabled' : 'Disabled'}`);
    }

    /**
     * Adjust confidence threshold
     */
    setMinConfidence(threshold) {
        this.minConfidence = Math.max(0, Math.min(1, threshold));
        console.log(`[Voice-Swarm] Confidence threshold set to ${this.minConfidence}`);
    }
}

// Singleton export
const voiceSwarmIntegration = new VoiceSwarmIntegration();

module.exports = {
    voiceSwarmIntegration,
    VoiceSwarmIntegration
};
