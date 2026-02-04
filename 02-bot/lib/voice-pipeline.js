/**
 * Voice Pipeline
 *
 * Processes voice notes through:
 * 1. Transcription (Groq Whisper - FREE)
 * 2. Summarization (if long)
 * 3. Task Extraction (Project Intelligence)
 * 4. Routing to appropriate projects/skills
 */

const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const http = require('http');
const FormData = require('form-data');
const projectIntelligence = require('./project-intelligence');

class VoicePipeline {
  constructor() {
    this.claude = null;
    this.groqApiKey = null;
  }

  initialize() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    this.groqApiKey = process.env.GROQ_API_KEY;
    console.log('[VoicePipeline] Initialized');
  }

  /**
   * Process a voice message through the full pipeline
   *
   * @param {Buffer} audioBuffer - Audio data
   * @param {Object} context - User context
   * @returns {Object} Pipeline result with transcription, tasks, routing
   */
  async process(audioBuffer, context = {}) {
    const startTime = Date.now();

    // Step 1: Transcribe
    console.log('[VoicePipeline] Step 1: Transcribing...');
    const transcription = await this.transcribe(audioBuffer);

    if (!transcription.success) {
      return {
        success: false,
        error: transcription.error,
        stage: 'transcription'
      };
    }

    const transcript = transcription.text;
    const duration = transcription.duration;
    const isLong = duration > 120 || transcript.length > 500; // > 2 min or > 500 chars

    console.log(`[VoicePipeline] Transcribed: ${transcript.length} chars, ~${duration}s, long=${isLong}`);

    // Step 2: If long, summarize and extract tasks
    let summary = null;
    let tasks = [];

    if (isLong) {
      console.log('[VoicePipeline] Step 2: Processing long voice note...');
      const processed = await projectIntelligence.processVoiceTranscript(transcript, context);
      summary = processed.summary;
      tasks = processed.tasks;
    }

    // Step 3: Classify intent and route
    console.log('[VoicePipeline] Step 3: Classifying intent...');
    const intelligence = await projectIntelligence.process(transcript, {
      ...context,
      numMedia: 0 // Voice is already processed
    });

    // Step 4: Build response
    const elapsed = Date.now() - startTime;
    console.log(`[VoicePipeline] Complete in ${elapsed}ms`);

    return {
      success: true,

      // Transcription
      transcript,
      duration,
      isLong,

      // Summary (for long messages)
      summary,

      // Tasks extracted
      tasks,
      taskCount: tasks.length,

      // Intelligence routing
      intent: intelligence.intent,
      project: intelligence.project,
      projectDetails: intelligence.projectDetails,
      company: intelligence.company,
      confidence: intelligence.confidence,

      // What to do next
      action: intelligence.action,
      suggestedSkill: intelligence.suggestedSkill,
      needsConfirmation: intelligence.needsConfirmation,

      // AI context for response
      aiContext: intelligence.aiContext,

      // Formatted response for user
      response: this.formatResponse({
        transcript,
        summary,
        tasks,
        intelligence,
        isLong,
        duration
      }),

      // Timing
      processingTime: elapsed
    };
  }

  /**
   * Transcribe audio using Groq Whisper (FREE)
   */
  async transcribe(audioBuffer) {
    if (!this.groqApiKey) {
      return {
        success: false,
        error: 'GROQ_API_KEY not configured. Get one free at console.groq.com'
      };
    }

    try {
      // Prepare form data
      const form = new FormData();
      form.append('file', audioBuffer, {
        filename: 'audio.ogg',
        contentType: 'audio/ogg'
      });
      form.append('model', 'whisper-large-v3');
      form.append('response_format', 'verbose_json');
      form.append('language', 'en');

      // Make request to Groq
      const response = await this.makeGroqRequest(form);

      return {
        success: true,
        text: response.text || '',
        duration: response.duration || 0,
        language: response.language || 'en'
      };
    } catch (err) {
      console.error('[VoicePipeline] Transcription error:', err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Make request to Groq API
   */
  makeGroqRequest(form) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.groq.com',
        port: 443,
        path: '/openai/v1/audio/transcriptions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.groqApiKey}`,
          ...form.getHeaders()
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`Groq API error: ${res.statusCode} - ${data}`));
              return;
            }
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse Groq response: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      form.pipe(req);
    });
  }

  /**
   * Download audio from URL
   */
  downloadAudio(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      // Need Twilio auth for media URLs
      const authHeader = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
        ? 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')
        : null;

      const options = {
        headers: authHeader ? { 'Authorization': authHeader } : {}
      };

      protocol.get(url, options, (res) => {
        // Handle redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          this.downloadAudio(res.headers.location).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download audio: ${res.statusCode}`));
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
   * Format response for user
   */
  formatResponse(data) {
    const parts = [];

    // Header based on length
    if (data.isLong) {
      parts.push('*🎙️ Voice Note Processed*\n');

      // Summary
      if (data.summary) {
        parts.push(`*Summary:*\n${data.summary}\n`);
      }

      // Tasks
      if (data.tasks && data.tasks.length > 0) {
        parts.push('*Tasks Extracted:*');
        for (const task of data.tasks) {
          const projectLabel = task.project ? ` → ${task.project}` : '';
          const priorityEmoji = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
          parts.push(`${priorityEmoji} ${task.task}${projectLabel}`);
        }
        parts.push('');
      }
    } else {
      // Short message - just show transcript
      parts.push('*🎙️ You said:*');
      parts.push(`"${data.transcript}"\n`);
    }

    // Project routing
    if (data.intelligence.project) {
      const proj = data.intelligence.projectDetails;
      parts.push(`*Routing to:* ${data.intelligence.project}`);
      if (proj?.description) {
        parts.push(`_${proj.description}_`);
      }
    }

    // Confirmation if needed
    if (data.intelligence.needsConfirmation) {
      parts.push('\n_Reply "yes" to proceed or clarify what you need._');
    }

    return parts.join('\n');
  }

  /**
   * Quick process - just transcribe, no intelligence
   */
  async quickTranscribe(audioBuffer) {
    return await this.transcribe(audioBuffer);
  }
}

// Singleton
const pipeline = new VoicePipeline();
module.exports = pipeline;
