const BaseSkill = require('../base-skill');
const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const http = require('http');

class VoiceSkill extends BaseSkill {
  name = 'voice';
  description = 'Process voice messages and transcribe to commands';
  priority = 99; // Very high - intercept voice before other skills

  commands = [
    { pattern: /^__voice__$/i, description: 'Internal voice handler', usage: 'Send voice message' }
  ];

  constructor(context = {}) {
    super(context);
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  // Override canHandle to check for audio
  canHandle(command, context = {}) {
    // Check if this is an audio message
    if (context.mediaContentType && context.mediaContentType.startsWith('audio/')) {
      return true;
    }
    return super.canHandle(command, context);
  }

  async execute(command, context) {
    // Check for audio
    if (!context.mediaUrl || !context.mediaContentType?.startsWith('audio/')) {
      return this.error('No audio message detected');
    }

    try {
      // Download audio
      const audioBuffer = await this.downloadAudio(context.mediaUrl);

      // Transcribe using Claude (via description of audio intent)
      // Note: Claude doesn't directly transcribe audio, so we'd need Whisper API
      // For now, we'll use a workaround or external service

      const transcription = await this.transcribeAudio(audioBuffer, context.mediaContentType);

      if (!transcription) {
        return this.error('Could not transcribe voice message. Please try again or type your command.');
      }

      return this.success(
        `*Voice Message Received*\n\n` +
        `Transcription:\n"${transcription}"\n\n` +
        `Processing as command...`,
        { transcription, executeAsCommand: true }
      );
    } catch (err) {
      this.log('error', 'Voice processing error', err);
      return this.error(`Voice error: ${err.message}`);
    }
  }

  async downloadAudio(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      // Add Twilio auth if needed
      const authUrl = new URL(url);
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        authUrl.username = process.env.TWILIO_ACCOUNT_SID;
        authUrl.password = process.env.TWILIO_AUTH_TOKEN;
      }

      protocol.get(authUrl.toString(), (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  async transcribeAudio(audioBuffer, contentType) {
    // Option 1: Use OpenAI Whisper API (if available)
    // Option 2: Use AssemblyAI
    // Option 3: Use Google Speech-to-Text
    // Option 4: Use Claude to interpret audio context

    // For now, we'll attempt using Claude's understanding
    // In production, you'd want to use a proper STT service

    try {
      // If we had Whisper, we'd do:
      // const transcription = await openai.audio.transcriptions.create({
      //   file: audioBuffer,
      //   model: 'whisper-1'
      // });

      // Placeholder - in real implementation, integrate Whisper API
      console.log('[Voice] Audio received, size:', audioBuffer.length, 'bytes');
      console.log('[Voice] Content-Type:', contentType);

      // Return null to indicate transcription not available
      // User should set up Whisper API for full functionality
      return null;
    } catch (e) {
      console.error('[Voice] Transcription failed:', e.message);
      return null;
    }
  }
}

module.exports = VoiceSkill;
