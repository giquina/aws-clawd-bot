/**
 * Voice Skill - Transcribe voice messages using Groq Whisper (FREE)
 *
 * Now with Project Intelligence integration:
 * - Short messages: Transcribe → Classify intent → Route to project
 * - Long messages: Transcribe → Extract tasks → Route to multiple projects
 *
 * Commands:
 *   [voice message]     - Transcribe and intelligently process
 *   meeting mode        - Force meeting analysis on next voice note
 *   voice help          - Show voice capabilities
 */
const BaseSkill = require('../base-skill');
const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const http = require('http');

// Project Intelligence integration
let projectIntelligence = null;
try {
  projectIntelligence = require('../../lib/project-intelligence');
} catch (e) {
  console.log('[Voice] Project Intelligence not available');
}

class VoiceSkill extends BaseSkill {
  name = 'voice';
  description = 'Transcribe voice messages and analyze meetings';
  priority = 99; // Very high - intercept voice before other skills

  commands = [
    { pattern: /^voice help$/i, description: 'Show voice capabilities', usage: 'voice help' },
    { pattern: /^meeting mode$/i, description: 'Enable meeting analysis for next voice note', usage: 'meeting mode' },
    { pattern: /^__voice__$/i, description: 'Internal voice handler', usage: 'Send voice message' }
  ];

  constructor(context = {}) {
    super(context);
    this.claude = null;
    this.meetingModeUsers = new Set(); // Users who requested meeting mode
  }

  // Override canHandle to check for audio
  canHandle(command, context = {}) {
    if (context.mediaContentType && context.mediaContentType.startsWith('audio/')) {
      return true;
    }
    return super.canHandle(command, context);
  }

  async execute(command, context) {
    const lowerCmd = (command || '').toLowerCase().trim();

    // Handle text commands
    if (lowerCmd === 'voice help') {
      return this.showHelp();
    }

    if (lowerCmd === 'meeting mode') {
      this.meetingModeUsers.add(context.userId);
      return this.success(
        '*Meeting Mode Enabled* 🎙️\n\n' +
        'Send your voice note and I\'ll provide:\n' +
        '• Full transcription\n' +
        '• Executive summary\n' +
        '• Action items\n' +
        '• Key decisions\n' +
        '• Follow-ups needed\n\n' +
        '_Recording up to 1 hour supported_'
      );
    }

    // Handle audio message
    if (!context.mediaUrl || !context.mediaContentType?.startsWith('audio/')) {
      return this.error('No voice message detected. Send a voice note to transcribe.');
    }

    return await this.handleVoiceMessage(context);
  }

  async handleVoiceMessage(context) {
    const { userId, mediaUrl, mediaContentType } = context;
    const isMeetingMode = this.meetingModeUsers.has(userId);

    // Clear meeting mode after use
    this.meetingModeUsers.delete(userId);

    try {
      this.log('info', `Processing voice message for ${userId}, meeting mode: ${isMeetingMode}`);

      // Check if Groq API key is configured
      if (!process.env.GROQ_API_KEY) {
        return this.error(
          'Voice transcription not configured.\n\n' +
          'Add GROQ_API_KEY to enable (it\'s FREE!):\n' +
          'https://console.groq.com/keys'
        );
      }

      // Download audio file
      const audioBuffer = await this.downloadAudio(mediaUrl);
      const audioSizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);
      this.log('info', `Audio downloaded: ${audioSizeMB}MB, ${audioBuffer.length} bytes`);

      // Determine if this is a very long recording (likely a meeting)
      // Only treat as meeting if explicitly requested OR very large (>5MB ≈ 10+ minutes)
      const isLongRecording = audioBuffer.length > 5000000; // > 5MB ≈ > 10 minutes

      // Transcribe with Groq Whisper
      const transcript = await this.transcribeWithGroq(audioBuffer, mediaContentType);

      if (!transcript || transcript.trim().length === 0) {
        return this.error('Could not transcribe the voice message. Please try again.');
      }

      // Decide processing mode
      // Meeting mode only for explicit request or very long recordings
      if (isMeetingMode || isLongRecording) {
        return await this.processMeetingTranscript(transcript, audioSizeMB, userId);
      } else {
        // Normal voice note - return transcription for planning/execution
        return await this.processShortVoice(transcript, context);
      }

    } catch (err) {
      this.log('error', 'Voice processing error', err);
      return this.error(`Voice error: ${err.message}`);
    }
  }

  /**
   * Transcribe audio using Groq's FREE Whisper API
   */
  async transcribeWithGroq(audioBuffer, contentType) {
    return new Promise((resolve, reject) => {
      // Determine file extension from content type
      const ext = contentType.includes('ogg') ? 'ogg' :
                  contentType.includes('mp4') ? 'm4a' :
                  contentType.includes('mpeg') ? 'mp3' :
                  contentType.includes('wav') ? 'wav' : 'ogg';

      // Build multipart form data manually
      const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

      const formParts = [];

      // File part
      formParts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="audio.${ext}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`
      );

      // Model part
      const modelPart =
        `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="model"\r\n\r\n` +
        `whisper-large-v3`;

      // Response format part
      const formatPart =
        `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
        `text`;

      // Language part - force English to prevent misdetection
      const langPart =
        `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="language"\r\n\r\n` +
        `en`;

      const endBoundary = `\r\n--${boundary}--\r\n`;

      // Combine all parts
      const preFileBuffer = Buffer.from(formParts[0], 'utf8');
      const postFileBuffer = Buffer.from(modelPart + formatPart + langPart + endBoundary, 'utf8');
      const fullBody = Buffer.concat([preFileBuffer, audioBuffer, postFileBuffer]);

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

      this.log('info', `Sending ${fullBody.length} bytes to Groq Whisper API`);

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            this.log('info', `Transcription successful: ${data.substring(0, 100)}...`);
            resolve(data.trim());
          } else {
            this.log('error', `Groq API error: ${res.statusCode}`, data);
            reject(new Error(`Transcription failed: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', (err) => {
        this.log('error', 'Groq request error', err);
        reject(err);
      });

      req.write(fullBody);
      req.end();
    });
  }

  /**
   * Process short voice notes - transcribe and intelligently route
   */
  async processShortVoice(transcript, context) {
    const wordCount = transcript.split(/\s+/).length;

    // Use Project Intelligence to classify intent
    let intelligence = null;
    if (projectIntelligence) {
      try {
        intelligence = await projectIntelligence.process(transcript, context);
        this.log('info', `Intelligence: intent=${intelligence.intent}, project=${intelligence.project}, confidence=${intelligence.confidence}`);
      } catch (e) {
        this.log('error', 'Project Intelligence failed', e);
      }
    }

    // Build response
    let response = `*🎙️ You said:*\n"${transcript}"\n`;

    // If we identified a project/intent with good confidence
    if (intelligence && intelligence.confidence > 0.6) {
      response += `\n*Detected:* ${intelligence.intent || 'general query'}`;

      if (intelligence.project) {
        response += `\n*Project:* ${intelligence.project}`;
        if (intelligence.projectDetails?.description) {
          response += ` - _${intelligence.projectDetails.description}_`;
        }
      }

      if (intelligence.company) {
        response += `\n*Company:* ${intelligence.company}`;
      }

      // If this is a command, mark for execution
      if (wordCount <= 15 || intelligence.suggestedSkill) {
        return this.success(response + '\n\n_Processing..._', {
          transcription: transcript,
          executeAsCommand: true,
          intelligence: intelligence
        });
      }
    }

    response += `\n_${wordCount} words_`;

    // Truncate if too long
    if (response.length > 1500) {
      response = response.substring(0, 1450) + '..."\n\n_[Truncated]_';
    }

    return this.success(response, {
      transcription: transcript,
      intelligence: intelligence
    });
  }

  /**
   * Process long recordings - full analysis with Project Intelligence
   */
  async processMeetingTranscript(transcript, audioSizeMB, userId) {
    const wordCount = transcript.split(/\s+/).length;

    // Try Project Intelligence for task extraction first
    let extractedTasks = null;
    if (projectIntelligence) {
      try {
        extractedTasks = await projectIntelligence.processVoiceTranscript(transcript, { userId });
        this.log('info', `Extracted ${extractedTasks.tasks?.length || 0} tasks from voice`);
      } catch (e) {
        this.log('error', 'Task extraction failed', e);
      }
    }

    // Initialize Claude for analysis
    if (!this.claude && process.env.ANTHROPIC_API_KEY) {
      this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    if (!this.claude) {
      return this.returnTranscriptInChunks(transcript, wordCount, audioSizeMB);
    }

    try {
      this.log('info', `Analyzing meeting transcript: ${wordCount} words`);

      // Analyze with Claude
      const analysis = await this.claude.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Analyze this voice message transcript and provide a structured summary.

TRANSCRIPT:
${transcript.substring(0, 30000)}

Provide your analysis in this EXACT format (keep it concise for WhatsApp):

**SUMMARY**
[2-3 sentence executive summary]

**KEY POINTS**
• [Point 1]
• [Point 2]
• [Point 3]

**ACTION ITEMS**
• [Action 1]
• [Action 2]

Keep each section brief. Total response under 1200 characters.`
        }]
      });

      const analysisText = analysis.content[0].text.trim();

      // Build response with Project Intelligence insights
      let response = `*🎙️ Voice Analysis*\n`;
      response += `_${wordCount} words | ${audioSizeMB}MB_\n\n`;
      response += analysisText;

      // Add extracted tasks with project routing
      if (extractedTasks && extractedTasks.tasks && extractedTasks.tasks.length > 0) {
        response += '\n\n*📋 Tasks by Project:*';
        const byProject = extractedTasks.byProject || {};
        for (const [project, tasks] of Object.entries(byProject)) {
          response += `\n_${project}:_`;
          for (const task of tasks.slice(0, 3)) { // Max 3 per project
            const emoji = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
            response += `\n${emoji} ${task.task}`;
          }
        }
      }

      // Truncate if too long
      if (response.length > 1500) {
        response = response.substring(0, 1450) + '\n\n_[Truncated]_';
      }

      return this.success(response, {
        transcript: transcript,
        wordCount: wordCount,
        analyzed: true,
        tasks: extractedTasks?.tasks || []
      });

    } catch (err) {
      this.log('error', 'Meeting analysis failed', err);
      return this.returnTranscriptInChunks(transcript, wordCount, audioSizeMB);
    }
  }

  /**
   * Return transcript in chunks if analysis fails
   */
  returnTranscriptInChunks(transcript, wordCount, audioSizeMB) {
    let response = `*Voice Transcription* 🎙️\n`;
    response += `_${wordCount} words | ${audioSizeMB}MB_\n\n`;

    // Take first ~1200 chars of transcript
    const preview = transcript.substring(0, 1200);
    response += `"${preview}`;

    if (transcript.length > 1200) {
      response += '..."\n\n_[Transcript truncated - send "meeting mode" first for full analysis]_';
    } else {
      response += '"';
    }

    return this.success(response);
  }

  /**
   * Download audio from Twilio URL
   */
  async downloadAudio(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      // Add Twilio auth
      const authUrl = new URL(url);
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        authUrl.username = process.env.TWILIO_ACCOUNT_SID;
        authUrl.password = process.env.TWILIO_AUTH_TOKEN;
      }

      protocol.get(authUrl.toString(), (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          this.downloadAudio(res.headers.location).then(resolve).catch(reject);
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
   * Show help for voice features
   */
  showHelp() {
    return this.success(
      '*Voice Message Features* 🎙️\n\n' +
      '*Send any voice note* → Automatic transcription\n\n' +
      '*For meetings/long recordings:*\n' +
      '1. Type "meeting mode"\n' +
      '2. Send your voice note (up to 1 hour)\n' +
      '3. Get full analysis:\n' +
      '   • Summary\n' +
      '   • Action items\n' +
      '   • Key decisions\n' +
      '   • Follow-ups\n\n' +
      '*Powered by:* Groq Whisper (FREE)\n\n' +
      '_Tip: Long recordings (>2 min) auto-trigger meeting mode_'
    );
  }

  async initialize() {
    await super.initialize();
    if (process.env.GROQ_API_KEY) {
      this.log('info', 'Voice skill ready with Groq Whisper (FREE transcription)');
    } else {
      this.log('warn', 'Voice skill: GROQ_API_KEY not set - transcription disabled');
    }
  }
}

module.exports = VoiceSkill;
