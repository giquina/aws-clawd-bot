/**
 * Messaging Platform Abstraction Layer
 *
 * Provides a unified interface for multiple messaging platforms (WhatsApp, Telegram).
 * Handles message normalization, platform-specific formatting, and user-platform mapping.
 *
 * @module lib/messaging-platform
 */

/**
 * Platform identifiers
 * @constant {Object}
 */
const PLATFORMS = {
  WHATSAPP: 'whatsapp',
  TELEGRAM: 'telegram'
};

/**
 * Default platform for proactive outbound messages
 * Telegram is primary, WhatsApp is backup for critical alerts only
 * @constant {string}
 */
const DEFAULT_PLATFORM = process.env.DEFAULT_PLATFORM || 'telegram';

/**
 * Alert levels that should also be sent to WhatsApp (as backup)
 * @constant {string[]}
 */
const WHATSAPP_ALERT_LEVELS = ['critical'];

/**
 * Alert level definitions for routing
 * @constant {Object}
 */
const ALERT_LEVELS = {
  CRITICAL: 'critical',   // CI failures, errors, system alerts -> Both platforms
  IMPORTANT: 'important', // PRs, deadlines -> Telegram only
  INFO: 'info'            // Morning briefs, digests -> Telegram only
};

/**
 * Platform-specific configurations and limits
 * @constant {Object}
 */
const PLATFORM_CONFIG = {
  [PLATFORMS.WHATSAPP]: {
    name: 'WhatsApp',
    maxLength: 1600,
    mediaTypes: ['image/jpeg', 'image/png', 'image/gif', 'audio/ogg', 'audio/mp3', 'video/mp4', 'application/pdf'],
    userIdFormat: 'whatsapp:+{number}',
    userIdPattern: /^whatsapp:\+(\d+)$/,
    supportsMarkdown: false,
    supportsButtons: false,
    supportsInlineKeyboard: false,
    maxMediaSize: 16 * 1024 * 1024, // 16MB
    rateLimit: {
      messagesPerSecond: 80,
      messagesPerDay: 1000
    }
  },
  [PLATFORMS.TELEGRAM]: {
    name: 'Telegram',
    maxLength: 4096,
    mediaTypes: ['image/jpeg', 'image/png', 'image/gif', 'audio/ogg', 'audio/mp3', 'video/mp4', 'application/pdf', 'image/webp'],
    userIdFormat: '{chatId}',
    userIdPattern: /^-?\d+$/,
    supportsMarkdown: true,
    supportsButtons: true,
    supportsInlineKeyboard: true,
    maxMediaSize: 50 * 1024 * 1024, // 50MB
    rateLimit: {
      messagesPerSecond: 30,
      messagesPerMinute: 20 // per chat
    }
  }
};

/**
 * In-memory storage for user-platform mappings
 * Maps userId (without platform prefix) to their primary platform
 * @type {Map<string, string>}
 */
const userPlatformMap = new Map();

/**
 * Normalized message structure
 * @typedef {Object} NormalizedMessage
 * @property {string} userId - User identifier (without platform prefix)
 * @property {string} text - Message text content
 * @property {string|null} mediaUrl - URL of attached media (if any)
 * @property {string|null} mediaType - MIME type of attached media
 * @property {string} platform - Platform identifier (whatsapp/telegram)
 * @property {Object} raw - Original raw message object
 */

/**
 * Platform limits structure
 * @typedef {Object} PlatformLimits
 * @property {number} maxLength - Maximum message length in characters
 * @property {string[]} mediaTypes - Supported media MIME types
 * @property {number} maxMediaSize - Maximum media file size in bytes
 * @property {boolean} supportsMarkdown - Whether platform supports markdown
 * @property {boolean} supportsButtons - Whether platform supports button replies
 * @property {boolean} supportsInlineKeyboard - Whether platform supports inline keyboards
 */

/**
 * Messaging Platform Abstraction Class
 * Provides both static methods for utilities and instance methods for sending
 */
class MessagingPlatform {
  constructor() {
    this.twilioClient = null;
    this.telegramHandler = null;
  }

  /**
   * Initialize the messaging platform with available clients
   * @param {Object} options - Initialization options
   * @param {Object} [options.twilioClient] - Twilio client instance
   * @param {Object} [options.telegramHandler] - Telegram handler instance
   */
  initialize(options = {}) {
    if (options.twilioClient) {
      this.twilioClient = options.twilioClient;
    }
    if (options.telegramHandler) {
      this.telegramHandler = options.telegramHandler;
    }
  }

  /**
   * Set the Telegram handler (can be set after initialization)
   * @param {Object} handler - Telegram handler instance
   */
  setTelegramHandler(handler) {
    this.telegramHandler = handler;
  }

  /**
   * Set the Twilio client (can be set after initialization)
   * @param {Object} client - Twilio client instance
   */
  setTwilioClient(client) {
    this.twilioClient = client;
  }

  // ============================================================
  // STATIC METHODS - Platform-agnostic utilities
  // ============================================================

  /**
   * Normalize incoming message from any platform
   * @static
   * @param {string} platform - Platform identifier (whatsapp/telegram)
   * @param {Object} rawMessage - Raw message from platform webhook
   * @returns {NormalizedMessage} Normalized message object
   */
  static normalizeIncoming(platform, rawMessage) {
    switch (platform) {
      case PLATFORMS.WHATSAPP:
        return MessagingPlatform._normalizeWhatsApp(rawMessage);
      case PLATFORMS.TELEGRAM:
        return MessagingPlatform._normalizeTelegram(rawMessage);
      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }

  /**
   * Normalize WhatsApp message from Twilio webhook
   * @private
   * @static
   * @param {Object} rawMessage - Twilio webhook body
   * @returns {NormalizedMessage}
   */
  static _normalizeWhatsApp(rawMessage) {
    const fromNumber = rawMessage.From || '';
    const userId = MessagingPlatform.extractUserId(PLATFORMS.WHATSAPP, fromNumber);
    const numMedia = parseInt(rawMessage.NumMedia || '0', 10);

    // Store user-platform mapping
    if (userId) {
      MessagingPlatform.setUserPlatform(userId, PLATFORMS.WHATSAPP);
    }

    return {
      userId,
      text: rawMessage.Body?.trim() || '',
      mediaUrl: numMedia > 0 ? rawMessage.MediaUrl0 : null,
      mediaType: numMedia > 0 ? rawMessage.MediaContentType0 : null,
      platform: PLATFORMS.WHATSAPP,
      raw: rawMessage,
      // Compatibility fields
      fromNumber,
      numMedia
    };
  }

  /**
   * Normalize Telegram message from webhook
   * @private
   * @static
   * @param {Object} rawMessage - Telegram webhook update
   * @returns {NormalizedMessage}
   */
  static _normalizeTelegram(rawMessage) {
    // Telegram can have message in different places
    const message = rawMessage.message || rawMessage.edited_message || rawMessage.callback_query?.message;

    if (!message) {
      return {
        userId: null,
        text: '',
        mediaUrl: null,
        mediaType: null,
        platform: PLATFORMS.TELEGRAM,
        raw: rawMessage
      };
    }

    const chatId = message.chat?.id?.toString();
    const userId = chatId;

    // Store user-platform mapping
    if (userId) {
      MessagingPlatform.setUserPlatform(userId, PLATFORMS.TELEGRAM);
    }

    // Determine media info
    let mediaUrl = null;
    let mediaType = null;
    let numMedia = 0;

    if (message.photo) {
      // Telegram sends array of photo sizes, get largest
      const largestPhoto = message.photo[message.photo.length - 1];
      mediaUrl = largestPhoto.file_id; // Will need to be resolved via Telegram API
      mediaType = 'image/jpeg';
      numMedia = 1;
    } else if (message.document) {
      mediaUrl = message.document.file_id;
      mediaType = message.document.mime_type || 'application/octet-stream';
      numMedia = 1;
    } else if (message.voice) {
      mediaUrl = message.voice.file_id;
      mediaType = 'audio/ogg';
      numMedia = 1;
    } else if (message.audio) {
      mediaUrl = message.audio.file_id;
      mediaType = message.audio.mime_type || 'audio/mpeg';
      numMedia = 1;
    } else if (message.video) {
      mediaUrl = message.video.file_id;
      mediaType = message.video.mime_type || 'video/mp4';
      numMedia = 1;
    }

    // Handle callback query (button press)
    const callbackData = rawMessage.callback_query?.data;

    return {
      userId,
      text: message.text || message.caption || callbackData || '',
      mediaUrl,
      mediaType,
      platform: PLATFORMS.TELEGRAM,
      raw: rawMessage,
      // Compatibility fields
      fromNumber: chatId,
      numMedia,
      // Telegram-specific extras
      telegramMessage: message,
      messageId: message.message_id,
      chatType: message.chat?.type,
      username: message.from?.username,
      firstName: message.from?.first_name,
      callbackQueryId: rawMessage.callback_query?.id
    };
  }

  /**
   * Send message via appropriate platform
   * Routes to the correct handler based on platform
   * @static
   * @param {string} platform - Platform identifier
   * @param {string} userId - User ID (without platform prefix)
   * @param {string} text - Message text
   * @param {Object} options - Platform-specific options
   * @param {Object} options.handlers - Object containing sendWhatsApp and sendTelegram functions
   * @param {Object} [options.replyMarkup] - Telegram reply markup (keyboards, buttons)
   * @param {string} [options.parseMode] - Telegram parse mode (Markdown, HTML)
   * @returns {Promise<Object>} Send result
   */
  static async sendMessage(platform, userId, text, options = {}) {
    const { handlers, ...platformOptions } = options;

    if (!handlers) {
      throw new Error('Handlers object required with sendWhatsApp and sendTelegram functions');
    }

    // Truncate message if exceeds platform limit
    const config = PLATFORM_CONFIG[platform];
    const truncatedText = MessagingPlatform.truncateMessage(text, config?.maxLength || 1600);

    switch (platform) {
      case PLATFORMS.WHATSAPP:
        if (!handlers.sendWhatsApp) {
          throw new Error('sendWhatsApp handler not provided');
        }
        const formattedUserId = MessagingPlatform.formatUserId(platform, userId);
        return handlers.sendWhatsApp(truncatedText, formattedUserId);

      case PLATFORMS.TELEGRAM:
        if (!handlers.sendTelegram) {
          throw new Error('sendTelegram handler not provided');
        }
        return handlers.sendTelegram(userId, truncatedText, platformOptions);

      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }

  /**
   * Get platform-specific limits and capabilities
   * @static
   * @param {string} platform - Platform identifier
   * @returns {PlatformLimits} Platform limits and capabilities
   */
  static getLimits(platform) {
    const config = PLATFORM_CONFIG[platform];

    if (!config) {
      throw new Error(`Unknown platform: ${platform}`);
    }

    return {
      maxLength: config.maxLength,
      mediaTypes: config.mediaTypes,
      maxMediaSize: config.maxMediaSize,
      supportsMarkdown: config.supportsMarkdown,
      supportsButtons: config.supportsButtons,
      supportsInlineKeyboard: config.supportsInlineKeyboard,
      rateLimit: config.rateLimit
    };
  }

  /**
   * Extract user ID without platform prefix
   * @static
   * @param {string} platform - Platform identifier
   * @param {string} platformUserId - Platform-specific user ID
   * @returns {string} Clean user ID
   */
  static extractUserId(platform, platformUserId) {
    if (!platformUserId) return '';

    switch (platform) {
      case PLATFORMS.WHATSAPP:
        // Handle "whatsapp:+123456789" format
        const match = platformUserId.match(/^whatsapp:\+?(\d+)$/);
        return match ? match[1] : platformUserId.replace('whatsapp:', '').replace('+', '');

      case PLATFORMS.TELEGRAM:
        // Telegram uses numeric chat IDs directly
        return platformUserId.toString();

      default:
        return platformUserId;
    }
  }

  /**
   * Format user ID for platform
   * @static
   * @param {string} platform - Platform identifier
   * @param {string} userId - Clean user ID
   * @returns {string} Platform-formatted user ID
   */
  static formatUserId(platform, userId) {
    if (!userId) return '';

    switch (platform) {
      case PLATFORMS.WHATSAPP:
        // Format as "whatsapp:+123456789"
        const cleanNumber = userId.replace(/\D/g, '');
        return `whatsapp:+${cleanNumber}`;

      case PLATFORMS.TELEGRAM:
        // Telegram uses numeric IDs directly
        return userId.toString();

      default:
        return userId;
    }
  }

  /**
   * Detect platform from user ID format
   * @static
   * @param {string} platformUserId - User ID that may include platform prefix
   * @returns {string|null} Platform identifier or null if unknown
   */
  static detectPlatform(platformUserId) {
    if (!platformUserId) return null;

    if (platformUserId.startsWith('whatsapp:')) {
      return PLATFORMS.WHATSAPP;
    }

    // Check if it looks like a Telegram chat ID (numeric, possibly negative for groups)
    if (/^-?\d+$/.test(platformUserId)) {
      // Could be Telegram, but need to check mapping
      return MessagingPlatform.getUserPlatform(platformUserId) || null;
    }

    return null;
  }

  // ============================================================
  // USER-PLATFORM MAPPING UTILITIES
  // ============================================================

  /**
   * Set user's primary platform
   * @static
   * @param {string} userId - Clean user ID
   * @param {string} platform - Platform identifier
   */
  static setUserPlatform(userId, platform) {
    if (!userId || !platform) return;
    userPlatformMap.set(userId, platform);
    console.log(`[MessagingPlatform] Mapped user ${userId} to ${platform}`);
  }

  /**
   * Get user's primary platform
   * @static
   * @param {string} userId - Clean user ID
   * @returns {string|null} Platform identifier or null if not found
   */
  static getUserPlatform(userId) {
    return userPlatformMap.get(userId) || null;
  }

  /**
   * Get all user-platform mappings
   * @static
   * @returns {Object} Object with userId keys and platform values
   */
  static getAllUserPlatforms() {
    const result = {};
    for (const [userId, platform] of userPlatformMap.entries()) {
      result[userId] = platform;
    }
    return result;
  }

  /**
   * Clear user-platform mapping
   * @static
   * @param {string} userId - User ID to clear
   * @returns {boolean} True if mapping was cleared
   */
  static clearUserPlatform(userId) {
    return userPlatformMap.delete(userId);
  }

  /**
   * Get user count by platform
   * @static
   * @returns {Object} Object with platform keys and count values
   */
  static getUserCountByPlatform() {
    const counts = {
      [PLATFORMS.WHATSAPP]: 0,
      [PLATFORMS.TELEGRAM]: 0
    };
    for (const platform of userPlatformMap.values()) {
      if (counts[platform] !== undefined) {
        counts[platform]++;
      }
    }
    return counts;
  }

  // ============================================================
  // MESSAGE UTILITIES
  // ============================================================

  /**
   * Truncate message to platform limit with ellipsis
   * @static
   * @param {string} text - Message text
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated message
   */
  static truncateMessage(text, maxLength) {
    if (!text || text.length <= maxLength) {
      return text;
    }

    // Leave room for truncation notice
    const notice = '\n\n_[Message truncated]_';
    return text.substring(0, maxLength - notice.length) + notice;
  }

  /**
   * Split long message into multiple parts
   * Useful for sending messages that exceed platform limits
   * @static
   * @param {string} text - Message text
   * @param {number} maxLength - Maximum length per part
   * @returns {string[]} Array of message parts
   */
  static splitMessage(text, maxLength) {
    if (!text || text.length <= maxLength) {
      return [text];
    }

    const parts = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        parts.push(remaining);
        break;
      }

      // Try to split at a natural break point (newline, space)
      let splitIndex = maxLength;

      // Look for newline within last 20% of max length
      const newlineIndex = remaining.lastIndexOf('\n', maxLength);
      if (newlineIndex > maxLength * 0.8) {
        splitIndex = newlineIndex + 1;
      } else {
        // Look for space
        const spaceIndex = remaining.lastIndexOf(' ', maxLength);
        if (spaceIndex > maxLength * 0.8) {
          splitIndex = spaceIndex + 1;
        }
      }

      parts.push(remaining.substring(0, splitIndex).trim());
      remaining = remaining.substring(splitIndex);
    }

    return parts;
  }

  /**
   * Check if media type is supported on platform
   * @static
   * @param {string} platform - Platform identifier
   * @param {string} mediaType - MIME type
   * @returns {boolean} True if supported
   */
  static isMediaSupported(platform, mediaType) {
    const config = PLATFORM_CONFIG[platform];
    if (!config) return false;
    return config.mediaTypes.includes(mediaType);
  }

  /**
   * Format text for platform (handle markdown differences)
   * @static
   * @param {string} platform - Platform identifier
   * @param {string} text - Text with markdown
   * @returns {string} Platform-appropriate formatted text
   */
  static formatTextForPlatform(platform, text) {
    const config = PLATFORM_CONFIG[platform];

    if (!config || !config.supportsMarkdown) {
      // Strip markdown for platforms that don't support it (WhatsApp)
      return text
        .replace(/\*\*(.*?)\*\*/g, '*$1*') // Bold: ** -> * (WhatsApp style)
        .replace(/__(.*?)__/g, '_$1_')     // Italic: __ -> _ (WhatsApp style)
        .replace(/`{3}[\s\S]*?`{3}/g, (match) => match.replace(/`{3}/g, '```')) // Keep code blocks
        .replace(/\[(.*?)\]\((.*?)\)/g, '$1 ($2)'); // Links: [text](url) -> text (url)
    }

    return text;
  }

  /**
   * Get platform name for display
   * @static
   * @param {string} platform - Platform identifier
   * @returns {string} Human-readable platform name
   */
  static getPlatformName(platform) {
    return PLATFORM_CONFIG[platform]?.name || platform;
  }

  /**
   * Get all supported platforms
   * @static
   * @returns {string[]} Array of platform identifiers
   */
  static getSupportedPlatforms() {
    return Object.values(PLATFORMS);
  }

  /**
   * Check if platform is supported
   * @static
   * @param {string} platform - Platform identifier
   * @returns {boolean} True if supported
   */
  static isSupported(platform) {
    return Object.values(PLATFORMS).includes(platform);
  }

  // ============================================================
  // PLATFORM PRIORITY METHODS - Telegram primary, WhatsApp backup
  // ============================================================

  /**
   * Get the default platform for proactive outbound messages
   * @static
   * @returns {string} Default platform identifier (telegram)
   */
  static getDefaultPlatform() {
    return DEFAULT_PLATFORM;
  }

  /**
   * Check if an alert should also be sent to WhatsApp as backup
   * Critical alerts go to both Telegram and WhatsApp
   * @static
   * @param {string} alertLevel - Alert level (critical, important, info)
   * @returns {boolean} True if should use WhatsApp as backup
   */
  static shouldUseWhatsAppBackup(alertLevel) {
    return WHATSAPP_ALERT_LEVELS.includes(alertLevel);
  }

  /**
   * Get all alert levels
   * @static
   * @returns {Object} Alert level constants
   */
  static getAlertLevels() {
    return ALERT_LEVELS;
  }

  /**
   * Determine platforms to send a proactive message to based on alert level
   * @static
   * @param {string} alertLevel - Alert level (critical, important, info)
   * @returns {string[]} Array of platform identifiers to send to
   */
  static getPlatformsForAlert(alertLevel) {
    const platforms = [DEFAULT_PLATFORM];

    // Critical alerts also go to WhatsApp as backup
    if (WHATSAPP_ALERT_LEVELS.includes(alertLevel)) {
      if (!platforms.includes(PLATFORMS.WHATSAPP)) {
        platforms.push(PLATFORMS.WHATSAPP);
      }
    }

    return platforms;
  }

  /**
   * Check if WhatsApp should only be used for critical alerts
   * @static
   * @returns {boolean} True if WhatsApp is backup-only mode
   */
  static isWhatsAppBackupOnly() {
    return process.env.WHATSAPP_CRITICAL_ALERTS === 'true' ||
           DEFAULT_PLATFORM === PLATFORMS.TELEGRAM;
  }

  // ============================================================
  // INSTANCE METHODS - For backward compatibility
  // ============================================================

  /**
   * Get message character limit for a platform
   * @param {string} platform - Platform identifier
   * @returns {number} Maximum message length
   */
  getMessageLimit(platform) {
    return PLATFORM_CONFIG[platform]?.maxLength || 1600;
  }

  /**
   * Truncate message to fit platform limits (instance method)
   * @param {string} message - Message text
   * @param {string} platform - Platform identifier
   * @returns {string} Truncated message
   */
  truncateForPlatform(message, platform) {
    const limit = this.getMessageLimit(platform);
    return MessagingPlatform.truncateMessage(message, limit);
  }

  /**
   * Send a message to the appropriate platform (instance method)
   * @param {string} message - The message to send
   * @param {string} platform - 'whatsapp' or 'telegram'
   * @param {string} recipient - Platform-specific recipient ID
   * @returns {Promise<boolean>} - Success status
   */
  async sendToRecipient(message, platform, recipient) {
    // Truncate message to fit platform limits
    const truncatedMessage = this.truncateForPlatform(message, platform);

    if (platform === PLATFORMS.TELEGRAM) {
      return this.sendTelegramMessage(truncatedMessage, recipient);
    } else {
      return this.sendWhatsAppMessage(truncatedMessage, recipient);
    }
  }

  /**
   * Send a WhatsApp message via Twilio (instance method)
   * @param {string} message - Message text
   * @param {string} toNumber - Recipient number
   * @returns {Promise<boolean>} Success status
   */
  async sendWhatsAppMessage(message, toNumber) {
    if (!this.twilioClient) {
      console.log('[Mock] Would send WhatsApp:', message.substring(0, 50) + '...');
      return false;
    }

    try {
      // Guard against undefined/null toNumber
      const number = toNumber || process.env.YOUR_WHATSAPP;
      if (!number) {
        console.error('[WhatsApp] No recipient number provided');
        return false;
      }

      // Ensure proper WhatsApp format
      const recipient = number.startsWith('whatsapp:')
        ? number
        : `whatsapp:${number}`;

      await this.twilioClient.messages.create({
        body: message,
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: recipient
      });
      return true;
    } catch (error) {
      console.error('[WhatsApp] Send error:', error.message);
      return false;
    }
  }

  /**
   * Send a Telegram message (instance method)
   * @param {string} message - Message text
   * @param {string} chatId - Telegram chat ID
   * @returns {Promise<boolean>} Success status
   */
  async sendTelegramMessage(message, chatId) {
    if (!this.telegramHandler) {
      console.log('[Mock] Would send Telegram:', message.substring(0, 50) + '...');
      return false;
    }

    try {
      await this.telegramHandler.sendMessage(chatId, message);
      return true;
    } catch (error) {
      console.error('[Telegram] Send error:', error.message);
      return false;
    }
  }

  /**
   * Normalize incoming message format across platforms (instance method)
   * @param {Object} rawMessage - Platform-specific message object
   * @param {string} platform - 'whatsapp' or 'telegram'
   * @returns {NormalizedMessage} - Normalized message object
   */
  normalizeMessage(rawMessage, platform) {
    return MessagingPlatform.normalizeIncoming(platform, rawMessage);
  }
}

// Create singleton instance for backward compatibility
const messagingPlatform = new MessagingPlatform();

// Export both the class and the singleton instance
module.exports = messagingPlatform;
module.exports.MessagingPlatform = MessagingPlatform;
module.exports.PLATFORMS = PLATFORMS;
module.exports.PLATFORM_CONFIG = PLATFORM_CONFIG;
module.exports.DEFAULT_PLATFORM = DEFAULT_PLATFORM;
module.exports.ALERT_LEVELS = ALERT_LEVELS;
module.exports.WHATSAPP_ALERT_LEVELS = WHATSAPP_ALERT_LEVELS;
