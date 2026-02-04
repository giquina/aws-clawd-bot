/**
 * Meeting Assistant Skill - Record, transcribe, and analyze meetings
 *
 * Uses Groq Whisper for FREE transcription and Claude Opus for intelligent
 * summary generation and action item extraction.
 *
 * Commands:
 *   meeting start [title]    - Start a new meeting recording session
 *   meeting stop             - Stop recording, transcribe, and analyze
 *   meeting summary          - Get AI summary of last meeting
 *   meeting actions          - Get action items from last meeting
 *   meeting list             - List recent meetings
 *   meeting view <id>        - View details of a specific meeting
 *
 * @example
 * meeting start Team Standup
 * meeting stop
 * meeting summary
 * meeting actions
 * meeting list
 * meeting view 3
 */

const BaseSkill = require('../base-skill');
const path = require('path');
const fs = require('fs').promises;

class MeetingSkill extends BaseSkill {
  name = 'meeting';
  description = 'Record, transcribe, and analyze meetings with AI-powered summaries';
  priority = 20;

  commands = [
    {
      pattern: /^meeting\s+start\s*(.+)?$/i,
      description: 'Start a new meeting recording session',
      usage: 'meeting start [title]'
    },
    {
      pattern: /^meeting\s+stop$/i,
      description: 'Stop recording and analyze the meeting',
      usage: 'meeting stop'
    },
    {
      pattern: /^meeting\s+summary$/i,
      description: 'Get AI summary of the last meeting',
      usage: 'meeting summary'
    },
    {
      pattern: /^meeting\s+actions$/i,
      description: 'Get action items from the last meeting',
      usage: 'meeting actions'
    },
    {
      pattern: /^meeting\s+list$/i,
      description: 'List recent meetings',
      usage: 'meeting list'
    },
    {
      pattern: /^meeting\s+view\s+(\d+)$/i,
      description: 'View details of a specific meeting',
      usage: 'meeting view <id>'
    }
  ];

  constructor(context = {}) {
    super(context);
    // In-memory store for active meeting sessions per user
    // Structure: { userId: { meetingId, title, startTime, audioChunks } }
    this.activeSessions = new Map();
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();

    // Ensure meetings data directory exists
    const dataDir = this._getMeetingsDir();
    try {
      await fs.mkdir(dataDir, { recursive: true });
      this.log('info', `Meetings directory initialized: ${dataDir}`);
    } catch (error) {
      this.log('warn', 'Could not create meetings directory', error);
    }

    this.log('info', 'Meeting skill initialized with voice note support');
  }

  /**
   * Execute meeting commands
   */
  async execute(command, context) {
    const { from: userId } = context;

    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Handle "meeting start [title]"
    if (lowerCommand.startsWith('meeting start')) {
      const match = parsed.raw.match(/^meeting\s+start\s*(.+)?$/i);
      if (match) {
        const title = match[1]?.trim() || null;
        return await this.handleStartMeeting(userId, title, context);
      }
    }

    // Handle "meeting stop"
    if (lowerCommand === 'meeting stop') {
      return await this.handleStopMeeting(userId, context);
    }

    // Handle "meeting summary"
    if (lowerCommand === 'meeting summary') {
      return await this.handleSummary(userId);
    }

    // Handle "meeting actions"
    if (lowerCommand === 'meeting actions') {
      return await this.handleActions(userId);
    }

    // Handle "meeting list"
    if (lowerCommand === 'meeting list') {
      return await this.handleList(userId);
    }

    // Handle "meeting view <id>"
    if (lowerCommand.startsWith('meeting view')) {
      const match = parsed.raw.match(/^meeting\s+view\s+(\d+)$/i);
      if (match) {
        const meetingId = parseInt(match[1]);
        return await this.handleView(userId, meetingId);
      }
    }

    return this.error('Unknown meeting command. Try: start, stop, summary, actions, list, or view');
  }

  /**
   * Handle "meeting start [title]"
   */
  async handleStartMeeting(userId, title, context) {
    try {
      // Check if already have active session
      if (this.activeSessions.has(userId)) {
        const existing = this.activeSessions.get(userId);
        return this.error(
          `You already have an active meeting: "${existing.title || 'Untitled'}"\n\n` +
          'Use "meeting stop" to end it first.'
        );
      }

      // Create meeting record in database
      const db = require('../../lib/database');
      const result = db.saveMeeting(userId, { title });

      if (!result) {
        return this.error('Failed to create meeting record. Please try again.');
      }

      const meetingId = result.id;

      // Store active session in memory
      this.activeSessions.set(userId, {
        meetingId,
        title: title || 'Untitled Meeting',
        startTime: new Date(),
        audioChunks: []
      });

      // Build response
      let response = `✓ Meeting started: "${title || 'Untitled Meeting'}"\n\n`;
      response += `Meeting ID: ${meetingId}\n`;
      response += `Started: ${this._formatTime(new Date())}\n\n`;
      response += `📝 *Instructions:*\n`;
      response += `1. Send voice notes with your meeting content\n`;
      response += `2. When done, use "meeting stop" to transcribe and analyze\n`;
      response += `3. I'll generate a summary and extract action items\n\n`;
      response += `Recording... 🎙️`;

      this.log('info', `Meeting started for user ${userId}: "${title || 'Untitled'}" (ID: ${meetingId})`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error starting meeting', error);
      return this.error('Failed to start meeting. Please try again.');
    }
  }

  /**
   * Handle "meeting stop"
   */
  async handleStopMeeting(userId, context) {
    try {
      // Check if session exists
      if (!this.activeSessions.has(userId)) {
        return this.error(
          'No active meeting session.\n\n' +
          'Start one with: meeting start [title]'
        );
      }

      const session = this.activeSessions.get(userId);

      // Calculate duration
      const duration = new Date() - session.startTime;
      const durationMinutes = Math.floor(duration / 60000);

      // Check if we have any audio chunks
      if (session.audioChunks.length === 0) {
        this.activeSessions.delete(userId);

        // Update meeting status
        const db = require('../../lib/database');
        db.updateMeeting(session.meetingId, {
          status: 'completed',
          durationMinutes,
          summary: 'No audio recorded',
          transcript: 'No voice notes received during this meeting.'
        });

        return this.error(
          'No voice notes received during this meeting.\n\n' +
          'The meeting has been closed without transcription.'
        );
      }

      // Show processing message
      let response = `✓ Meeting stopped: "${session.title}"\n\n`;
      response += `Duration: ${durationMinutes}m\n`;
      response += `Voice notes: ${session.audioChunks.length}\n\n`;
      response += `Processing... This may take a moment.\n`;
      response += `📝 Transcribing audio...\n`;
      response += `🤖 Generating summary...\n`;
      response += `✅ Extracting action items...`;

      // Return immediate response and process asynchronously
      this._processTranscriptAndAnalysis(userId, session, durationMinutes, context).catch(error => {
        this.log('error', 'Error processing meeting analysis', error);
      });

      return this.success(response);
    } catch (error) {
      this.log('error', 'Error stopping meeting', error);
      return this.error('Failed to stop meeting. Please try again.');
    }
  }

  /**
   * Handle "meeting summary"
   */
  async handleSummary(userId) {
    try {
      const db = require('../../lib/database');
      const meetings = db.listMeetings(userId, 1);

      if (meetings.length === 0) {
        return this.error(
          'No meetings found.\n\n' +
          'Start one with: meeting start [title]'
        );
      }

      const meeting = meetings[0];

      if (!meeting.summary) {
        return this.error(
          'Summary not available for this meeting.\n\n' +
          'The meeting may not have been analyzed yet.'
        );
      }

      let response = `*Meeting Summary*\n`;
      response += `${meeting.title || 'Untitled Meeting'}\n`;
      response += `${this._formatDate(meeting.created_at)}\n\n`;
      response += meeting.summary;

      return this.success(response);
    } catch (error) {
      this.log('error', 'Error getting summary', error);
      return this.error('Failed to get meeting summary. Please try again.');
    }
  }

  /**
   * Handle "meeting actions"
   */
  async handleActions(userId) {
    try {
      const db = require('../../lib/database');
      const meetings = db.listMeetings(userId, 1);

      if (meetings.length === 0) {
        return this.error(
          'No meetings found.\n\n' +
          'Start one with: meeting start [title]'
        );
      }

      const meeting = meetings[0];

      if (!meeting.action_items) {
        return this.error(
          'No action items found for this meeting.\n\n' +
          'The meeting may not have been analyzed yet, or there were no action items.'
        );
      }

      let response = `*Action Items*\n`;
      response += `${meeting.title || 'Untitled Meeting'}\n`;
      response += `${this._formatDate(meeting.created_at)}\n\n`;
      response += meeting.action_items;

      return this.success(response);
    } catch (error) {
      this.log('error', 'Error getting actions', error);
      return this.error('Failed to get action items. Please try again.');
    }
  }

  /**
   * Handle "meeting list"
   */
  async handleList(userId) {
    try {
      const db = require('../../lib/database');
      const meetings = db.listMeetings(userId, 10);

      if (meetings.length === 0) {
        return this.error(
          'No meetings found.\n\n' +
          'Start one with: meeting start [title]'
        );
      }

      let response = `*Recent Meetings*\n\n`;

      for (const meeting of meetings) {
        const date = this._formatDate(meeting.created_at);
        const title = meeting.title || 'Untitled';
        const duration = meeting.duration_minutes ? `${meeting.duration_minutes}m` : 'N/A';
        const status = meeting.status === 'active' ? '🟢 Active' : '✓';

        response += `${status} *#${meeting.id}* ${title}\n`;
        response += `   ${date} • ${duration}\n`;

        if (meeting.summary) {
          const preview = meeting.summary.substring(0, 80);
          response += `   ${preview}${meeting.summary.length > 80 ? '...' : ''}\n`;
        }

        response += `\n`;
      }

      response += `Use "meeting view <id>" to see details`;

      return this.success(response);
    } catch (error) {
      this.log('error', 'Error listing meetings', error);
      return this.error('Failed to list meetings. Please try again.');
    }
  }

  /**
   * Handle "meeting view <id>"
   */
  async handleView(userId, meetingId) {
    try {
      const db = require('../../lib/database');
      const meeting = db.getMeeting(meetingId);

      if (!meeting) {
        return this.error(`Meeting #${meetingId} not found.`);
      }

      // Check ownership
      if (meeting.user_id !== String(userId)) {
        return this.error(`Meeting #${meetingId} does not belong to you.`);
      }

      let response = `*Meeting #${meetingId}*\n`;
      response += `${meeting.title || 'Untitled Meeting'}\n`;
      response += `${this._formatDate(meeting.created_at)}\n`;
      response += `Duration: ${meeting.duration_minutes || 'N/A'}m\n`;
      response += `Status: ${meeting.status}\n\n`;

      if (meeting.summary) {
        response += `*Summary:*\n${meeting.summary}\n\n`;
      }

      if (meeting.action_items) {
        response += `*Action Items:*\n${meeting.action_items}\n\n`;
      }

      if (meeting.participants) {
        response += `*Participants:* ${meeting.participants}\n`;
      }

      if (!meeting.summary && !meeting.action_items) {
        response += `_No analysis available for this meeting._`;
      }

      return this.success(response);
    } catch (error) {
      this.log('error', 'Error viewing meeting', error);
      return this.error('Failed to view meeting. Please try again.');
    }
  }

  /**
   * Handle incoming voice note during active meeting
   * This method is called by the main bot when a voice note is received
   * and there's an active meeting session
   */
  async handleVoiceNote(userId, audioUrl) {
    try {
      if (!this.activeSessions.has(userId)) {
        return null; // No active session
      }

      const session = this.activeSessions.get(userId);

      // Add audio chunk to session
      session.audioChunks.push({
        url: audioUrl,
        timestamp: new Date()
      });

      this.log('info', `Voice note added to meeting ${session.meetingId}: ${session.audioChunks.length} chunks`);

      return {
        success: true,
        message: `✓ Voice note recorded (${session.audioChunks.length} total)\n\nContinue recording or use "meeting stop" when done.`
      };
    } catch (error) {
      this.log('error', 'Error handling voice note', error);
      return null;
    }
  }

  // ==================== Private Helpers ====================

  /**
   * Process transcript and analysis asynchronously
   * @private
   */
  async _processTranscriptAndAnalysis(userId, session, durationMinutes, context) {
    try {
      const sendMessage = this.config.sendMessage;

      // Transcribe all audio chunks
      let fullTranscript = '';

      for (let i = 0; i < session.audioChunks.length; i++) {
        const chunk = session.audioChunks[i];

        try {
          // Use voice-flow for transcription
          const { voiceFlow } = require('../../lib/voice-flow');
          const transcript = await voiceFlow.transcribe(chunk.url);

          if (transcript && transcript.trim()) {
            fullTranscript += `[Part ${i + 1}]\n${transcript}\n\n`;
          }
        } catch (error) {
          this.log('error', `Error transcribing chunk ${i + 1}`, error);
          fullTranscript += `[Part ${i + 1}]\n[Transcription failed]\n\n`;
        }
      }

      if (!fullTranscript.trim()) {
        fullTranscript = 'No audio could be transcribed.';
      }

      // Generate AI summary and action items
      let summary = '';
      let actionItems = '';

      try {
        const { processQuery } = require('../../ai-handler');

        // Generate summary
        const summaryPrompt = `Analyze this meeting transcript and provide a concise summary in 3-5 bullet points:\n\n${fullTranscript}`;
        const summaryResponse = await processQuery(summaryPrompt, {
          ...context,
          from: userId,
          preferredModel: 'opus' // Use Claude Opus for best results
        });
        summary = summaryResponse.response || 'Summary not available';

        // Extract action items
        const actionsPrompt = `Extract all action items from this meeting transcript. For each action, identify:\n- What needs to be done\n- Who is responsible (if mentioned)\n- When it's due (if mentioned)\n\nTranscript:\n${fullTranscript}`;
        const actionsResponse = await processQuery(actionsPrompt, {
          ...context,
          from: userId,
          preferredModel: 'opus'
        });
        actionItems = actionsResponse.response || 'No action items identified';
      } catch (error) {
        this.log('error', 'Error generating AI analysis', error);
        summary = 'AI analysis failed';
        actionItems = 'Could not extract action items';
      }

      // Update database
      const db = require('../../lib/database');
      db.updateMeeting(session.meetingId, {
        transcript: fullTranscript,
        summary,
        actionItems,
        durationMinutes,
        status: 'completed'
      });

      // Track outcome
      try {
        const outcomeTracker = require('../../lib/outcome-tracker');
        await outcomeTracker.completeAction('meeting_analysis', 'success', {
          meetingId: session.meetingId,
          title: session.title,
          durationMinutes,
          audioChunks: session.audioChunks.length,
          transcriptLength: fullTranscript.length,
          hasActionItems: actionItems !== 'No action items identified'
        });
      } catch (error) {
        this.log('debug', 'Could not track outcome', error);
      }

      // Remove from active sessions
      this.activeSessions.delete(userId);

      // Send completion message with results
      if (sendMessage) {
        let completionMsg = `✅ *Meeting Analysis Complete*\n\n`;
        completionMsg += `*${session.title}*\n`;
        completionMsg += `Duration: ${durationMinutes}m\n\n`;
        completionMsg += `*Summary:*\n${summary}\n\n`;
        completionMsg += `*Action Items:*\n${actionItems}\n\n`;
        completionMsg += `Use "meeting summary" or "meeting actions" to view again.`;

        await sendMessage(completionMsg);
      }

      this.log('info', `Meeting analysis complete for meeting ${session.meetingId}`);
    } catch (error) {
      this.log('error', 'Fatal error in meeting analysis', error);

      // Update database with error
      const db = require('../../lib/database');
      db.updateMeeting(session.meetingId, {
        status: 'failed',
        summary: 'Analysis failed due to an error',
        durationMinutes
      });

      // Remove from active sessions
      this.activeSessions.delete(userId);

      // Send error message
      const sendMessage = this.config.sendMessage;
      if (sendMessage) {
        await sendMessage(
          `❌ Meeting analysis failed\n\n` +
          `The meeting has been saved but analysis could not be completed.\n` +
          `Error: ${error.message}`
        );
      }
    }
  }

  /**
   * Get meetings data directory path
   * @private
   */
  _getMeetingsDir() {
    // Use EC2 path if available, otherwise local
    const isEc2 = process.platform !== 'win32' && require('fs').existsSync('/opt/clawd-bot');
    const basePath = isEc2 ? '/opt/clawd-bot/data' : path.join(__dirname, '..', '..', 'data');
    return path.join(basePath, 'meetings');
  }

  /**
   * Format a date object to "MMM DD, HH:MM" format
   * @private
   */
  _formatDate(dateString) {
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month} ${day}, ${hours}:${minutes}`;
  }

  /**
   * Format a date object to HH:MM format
   * @private
   */
  _formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      activeSessions: this.activeSessions.size,
      dataType: 'meetings'
    };
  }

  /**
   * Shutdown the skill - close all active sessions
   */
  async shutdown() {
    // Mark all active sessions as incomplete
    for (const [userId, session] of this.activeSessions) {
      try {
        const db = require('../../lib/database');
        db.updateMeeting(session.meetingId, {
          status: 'incomplete',
          summary: 'Meeting session closed without completion'
        });
        this.log('debug', `Marked meeting ${session.meetingId} as incomplete on shutdown`);
      } catch (error) {
        this.log('warn', 'Error updating meeting on shutdown', error);
      }
    }

    this.activeSessions.clear();
    await super.shutdown();
  }
}

module.exports = MeetingSkill;
