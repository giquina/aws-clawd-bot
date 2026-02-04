/**
 * Video Skill - Handle video messages sent via WhatsApp
 *
 * This skill handles incoming video messages, acknowledging receipt and
 * explaining current limitations. It stores video URLs for potential
 * future processing and offers options for thumbnail extraction.
 *
 * Commands:
 *   [video message]  - Acknowledge receipt, explain limitations, offer options
 *   video help       - Explain video capabilities and limitations
 *
 * Future capabilities (not yet implemented):
 *   - Thumbnail/first frame extraction via ffmpeg
 *   - Video transcription (audio track)
 *   - Duration and metadata extraction
 *   - Frame-by-frame analysis
 */
const BaseSkill = require('../base-skill');
const https = require('https');
const http = require('http');

class VideoSkill extends BaseSkill {
  name = 'video';
  description = 'Handle video messages and provide options for processing';
  priority = 20; // Lower than image-analysis (25), receipts (30), voice (99)

  commands = [
    {
      pattern: /^video help$/i,
      description: 'Show video handling capabilities',
      usage: 'video help'
    },
    {
      pattern: /^__video__$/i,
      description: 'Internal video handler',
      usage: 'Send video message'
    }
  ];

  constructor(context = {}) {
    super(context);
    // Store recent video URLs for potential later processing
    this.recentVideos = new Map(); // userId -> { url, contentType, timestamp }
  }

  /**
   * Check if this skill can handle the command
   * Override to detect video messages via mediaContentType
   */
  canHandle(command, context = {}) {
    // Check if this is a video message
    if (context.mediaContentType && context.mediaContentType.startsWith('video/')) {
      return true;
    }

    // Check text commands
    return super.canHandle(command, context);
  }

  /**
   * Execute the command
   */
  async execute(command, context) {
    const { userId, mediaUrl, mediaContentType } = context;

    // Handle video message
    if (mediaContentType && mediaContentType.startsWith('video/')) {
      return await this.handleVideoMessage(context);
    }

    // Handle text commands
    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    if (/^video help$/i.test(lowerCommand)) {
      return this.handleHelpCommand();
    }

    return this.error('Unknown video command. Try "video help" for options.');
  }

  /**
   * Handle incoming video message
   */
  async handleVideoMessage(context) {
    const { userId, mediaUrl, mediaContentType, numMedia } = context;

    this.log('info', `Video message received from user ${userId}`, {
      contentType: mediaContentType,
      hasUrl: !!mediaUrl
    });

    // Store video URL for potential future processing
    if (mediaUrl) {
      this.recentVideos.set(userId, {
        url: mediaUrl,
        contentType: mediaContentType,
        timestamp: new Date().toISOString()
      });

      // Limit stored videos per user (keep only most recent)
      this.cleanupOldVideos();
    }

    // Build response message
    let msg = '*Video Received*\n\n';
    msg += 'Got your video! Full video analysis is not yet available.\n\n';

    msg += '*Current limitations:*\n';
    msg += '- Cannot analyze full video content\n';
    msg += '- Cannot transcribe audio from video\n';
    msg += '- Cannot extract scenes or objects\n\n';

    msg += '*What I can do instead:*\n';
    msg += '- If you need to share specific content, try sending a screenshot\n';
    msg += '- For audio content, send as a voice message\n';
    msg += '- Describe what you need help with and I can assist\n\n';

    // Add video metadata if available
    if (mediaContentType) {
      const format = this.getVideoFormat(mediaContentType);
      msg += `_Video format: ${format}_\n`;
    }

    msg += '\n_Type "video help" for more info_';

    return this.success(msg);
  }

  /**
   * Handle video help command
   */
  handleHelpCommand() {
    let msg = '*Video Message Support*\n\n';

    msg += '*Current Status:* Basic handling only\n\n';

    msg += '*What happens when you send a video:*\n';
    msg += '1. Video URL is stored temporarily\n';
    msg += '2. You receive acknowledgment\n';
    msg += '3. No automatic analysis is performed\n\n';

    msg += '*Planned features (coming soon):*\n';
    msg += '- Thumbnail extraction (first frame)\n';
    msg += '- Audio transcription from video\n';
    msg += '- Duration and metadata info\n';
    msg += '- Key frame analysis\n\n';

    msg += '*Workarounds for now:*\n';
    msg += '- Send screenshots of important frames\n';
    msg += '- Extract audio and send as voice message\n';
    msg += '- Describe what you need analyzed\n\n';

    msg += '*Supported formats:*\n';
    msg += 'MP4, MOV, AVI, WebM, 3GP\n\n';

    msg += '_Video analysis requires ffmpeg and additional processing power._';

    return this.success(msg);
  }

  /**
   * Get human-readable video format from content type
   */
  getVideoFormat(contentType) {
    const formats = {
      'video/mp4': 'MP4',
      'video/quicktime': 'MOV',
      'video/x-msvideo': 'AVI',
      'video/webm': 'WebM',
      'video/3gpp': '3GP',
      'video/3gpp2': '3GP2',
      'video/x-matroska': 'MKV',
      'video/ogg': 'OGG'
    };

    return formats[contentType] || contentType.replace('video/', '').toUpperCase();
  }

  /**
   * Cleanup old stored videos (keep only last 10 per session)
   */
  cleanupOldVideos() {
    // Simple cleanup: if map gets too large, clear older entries
    if (this.recentVideos.size > 50) {
      const entries = Array.from(this.recentVideos.entries());
      // Sort by timestamp, keep newest 25
      entries.sort((a, b) => {
        return new Date(b[1].timestamp) - new Date(a[1].timestamp);
      });
      this.recentVideos.clear();
      entries.slice(0, 25).forEach(([key, value]) => {
        this.recentVideos.set(key, value);
      });
      this.log('info', 'Cleaned up old video entries');
    }
  }

  /**
   * Get stored video for a user (for future processing)
   * @param {string} userId - User ID
   * @returns {Object|null} - Stored video info or null
   */
  getStoredVideo(userId) {
    return this.recentVideos.get(userId) || null;
  }

  /**
   * Download video from URL (for future thumbnail extraction)
   * Note: Not currently used, prepared for future ffmpeg integration
   */
  async downloadVideo(url) {
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

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();
    this.log('info', 'Video skill ready - basic handling mode');
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      status: 'basic',
      capabilities: ['video_acknowledgment', 'url_storage'],
      plannedCapabilities: ['thumbnail_extraction', 'audio_transcription', 'metadata_extraction']
    };
  }
}

module.exports = VideoSkill;
