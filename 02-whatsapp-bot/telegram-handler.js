/**
 * Telegram Bot Handler for ClawdBot
 * Mirrors the Twilio/WhatsApp integration pattern for Telegram
 *
 * Key Differences from Twilio/WhatsApp:
 * =====================================
 * - Message length: Telegram allows 4096 chars (vs WhatsApp ~1600 chars via Twilio)
 * - User IDs: Telegram uses numeric chat IDs (vs phone numbers like +447123456789)
 * - Media handling: Telegram uses file_id system that must be converted to URLs
 *                   (vs Twilio which provides direct MediaUrl0, MediaUrl1, etc.)
 * - Webhooks: Telegram requires HTTPS with valid SSL certificate
 *             Can use long-polling for development (no SSL needed)
 * - Bot token format: 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
 *                     (vs Twilio uses AccountSID + AuthToken pair)
 * - Authorization: Check chat ID (vs phone number in WhatsApp)
 * - Voice format: Telegram sends OGG/Opus (vs WhatsApp sends various formats)
 *
 * Environment Variables:
 * ----------------------
 * - TELEGRAM_BOT_TOKEN: Bot token from @BotFather (required)
 * - TELEGRAM_WEBHOOK_SECRET: Optional secret for webhook verification
 * - TELEGRAM_AUTHORIZED_USER: Single authorized user's chat ID
 * - TELEGRAM_AUTHORIZED_USERS: Comma-separated list of authorized chat IDs
 *
 * Usage Pattern (mirrors Twilio in index.js lines 105-138):
 * --------------------------------------------------------
 * const { getTelegramHandler } = require('./telegram-handler');
 * const telegram = getTelegramHandler();
 *
 * if (telegram.isAvailable()) {
 *     await telegram.initialize({ webhookUrl, messageHandler });
 *     // or use Express middleware:
 *     app.use(telegram.getWebhookPath(), telegram.getWebhookMiddleware());
 * }
 */

const { Telegraf } = require('telegraf');

// Message limits comparison (documented for reference)
const MESSAGE_LIMITS = {
    TELEGRAM: 4096,       // Telegram's text message limit
    TELEGRAM_CAPTION: 1024, // Telegram caption limit for media
    WHATSAPP: 1600,       // WhatsApp via Twilio limit (approximate)
    TRUNCATE_AT: 4000     // Safe truncation point with room for suffix
};

class TelegramHandler {
    /**
     * Initialize Telegram handler with bot token
     * Similar pattern to Twilio client initialization in index.js lines 105-119
     */
    constructor() {
        this.bot = null;
        this.botInfo = null;
        this.isInitialized = false;
        this.webhookPath = '/telegram-webhook';

        // Check if Telegram is configured
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
            console.log('⚠️  Telegram not configured (add TELEGRAM_BOT_TOKEN to .env)');
            return;
        }

        try {
            this.bot = new Telegraf(token);
            console.log('✅ Telegram bot instance created');
        } catch (err) {
            console.log('⚠️  Telegram initialization failed:', err.message);
        }
    }

    /**
     * Check if Telegram bot is available/configured
     * Use this before attempting to send messages
     * @returns {boolean} True if bot is configured and ready
     */
    isAvailable() {
        return this.bot !== null;
    }

    /**
     * Get the bot instance for advanced operations
     * @returns {Telegraf|null} The Telegraf bot instance
     */
    getBot() {
        return this.bot;
    }

    /**
     * Get the webhook path for Express route setup
     * @returns {string} The webhook path (default: '/telegram-webhook')
     */
    getWebhookPath() {
        return this.webhookPath;
    }

    /**
     * Check if a user is authorized to use the bot
     * Similar to WhatsApp authorized number check in index.js lines 511-516
     *
     * @param {string|number} chatId - Telegram chat ID to check
     * @returns {boolean} True if authorized
     */
    isAuthorized(chatId) {
        const userId = chatId.toString();

        // Check single authorized user first
        const singleUser = process.env.TELEGRAM_AUTHORIZED_USER;
        if (singleUser && userId === singleUser) {
            return true;
        }

        // Check comma-separated list of authorized users
        const authorizedUsers = (process.env.TELEGRAM_AUTHORIZED_USERS || '')
            .split(',')
            .map(id => id.trim())
            .filter(Boolean);

        // If no authorized users configured, deny all
        if (!singleUser && authorizedUsers.length === 0) {
            return false;
        }

        return authorizedUsers.includes(userId);
    }

    /**
     * Initialize the bot with handlers and optional webhook
     * Call this after Express app is set up
     *
     * @param {Object} options - Initialization options
     * @param {string} [options.webhookUrl] - Full webhook URL (e.g., https://yourdomain.com/telegram-webhook)
     * @param {Function} [options.messageHandler] - Async function(messageData) => responseText
     * @returns {Promise<boolean>} Success status
     */
    async initialize(options = {}) {
        if (!this.bot) {
            console.log('⚠️  Cannot initialize - Telegram bot not configured');
            return false;
        }

        const { webhookUrl, messageHandler } = options;

        try {
            // Get bot info to verify token and store username
            this.botInfo = await this.bot.telegram.getMe();
            console.log(`✅ Telegram bot verified: @${this.botInfo.username}`);

            // Set up message handlers if provided
            if (messageHandler) {
                this.setupMessageHandlers(messageHandler);
            }

            // Set up webhook or use long-polling
            if (webhookUrl) {
                const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
                await this.bot.telegram.setWebhook(webhookUrl, {
                    secret_token: secret || undefined,
                    allowed_updates: ['message', 'edited_message', 'callback_query']
                });
                console.log(`✅ Telegram webhook set: ${webhookUrl}`);
            } else {
                // Development mode: use long-polling (no SSL required)
                // Delete any existing webhook first to avoid conflicts
                await this.bot.telegram.deleteWebhook({ drop_pending_updates: false });
                console.log('📡 Telegram using long-polling (no webhook URL provided)');

                // Launch with error handling - bot.launch() returns a promise
                this.bot.launch({
                    dropPendingUpdates: false,
                    allowedUpdates: ['message', 'edited_message', 'callback_query']
                }).then(() => {
                    console.log('✅ Telegram long-polling started successfully');
                }).catch(err => {
                    console.error('❌ Telegram long-polling failed:', err.message);
                    // Retry after 5 seconds
                    setTimeout(() => {
                        console.log('🔄 Retrying Telegram long-polling...');
                        this.bot.launch({ dropPendingUpdates: false }).catch(e => {
                            console.error('❌ Telegram retry failed:', e.message);
                        });
                    }, 5000);
                });

                // Graceful shutdown handlers
                process.once('SIGINT', () => this.bot?.stop('SIGINT'));
                process.once('SIGTERM', () => this.bot?.stop('SIGTERM'));
            }

            this.isInitialized = true;
            return true;
        } catch (err) {
            console.error('⚠️  Telegram initialization failed:', err.message);
            return false;
        }
    }

    /**
     * Set up message handlers for different content types
     * Normalizes Telegram message format to match Twilio/WhatsApp structure
     *
     * @param {Function} messageHandler - Async function(messageData) => responseText
     */
    setupMessageHandlers(messageHandler) {
        if (!this.bot) return;

        // Handle text messages
        this.bot.on('text', async (ctx) => {
            await this.handleIncomingMessage(ctx, messageHandler, 'text');
        });

        // Handle photo messages (similar to WhatsApp images)
        this.bot.on('photo', async (ctx) => {
            await this.handleIncomingMessage(ctx, messageHandler, 'photo');
        });

        // Handle voice messages (similar to WhatsApp voice notes)
        this.bot.on('voice', async (ctx) => {
            await this.handleIncomingMessage(ctx, messageHandler, 'voice');
        });

        // Handle document/file messages
        this.bot.on('document', async (ctx) => {
            await this.handleIncomingMessage(ctx, messageHandler, 'document');
        });

        // Handle audio messages
        this.bot.on('audio', async (ctx) => {
            await this.handleIncomingMessage(ctx, messageHandler, 'audio');
        });

        // Handle video messages
        this.bot.on('video', async (ctx) => {
            await this.handleIncomingMessage(ctx, messageHandler, 'video');
        });

        console.log('✅ Telegram message handlers configured');
    }

    /**
     * Internal handler that normalizes all message types
     * Creates a unified message data structure matching Twilio/WhatsApp format
     *
     * @param {Object} ctx - Telegraf context
     * @param {Function} messageHandler - Handler function
     * @param {string} type - Message type
     */
    async handleIncomingMessage(ctx, messageHandler, type) {
        const chatId = ctx.chat.id;
        const userId = chatId.toString();
        const message = ctx.message;

        // Log incoming message (similar to index.js line 509)
        const preview = message.text || message.caption || `[${type}]`;
        console.log(`[${new Date().toISOString()}] Telegram received: "${preview.substring(0, 50)}" from ${userId}`);

        // Authorization check (similar to index.js lines 511-516)
        if (!this.isAuthorized(chatId)) {
            console.log(`Unauthorized Telegram user: ${userId}`);
            await ctx.reply('Unauthorized. This bot is private.');
            return;
        }

        try {
            // Extract media info (normalizes to Twilio-like structure)
            const mediaInfo = await this.extractMediaInfo(message);

            // Build normalized message data structure
            // Matches the structure used in processMessageAsync (index.js lines 541+)
            const messageData = {
                // Core message info
                text: message.text || message.caption || '',
                userId,
                chatId,
                platform: 'telegram',

                // Media info (same field names as Twilio)
                numMedia: mediaInfo.numMedia,
                mediaUrl: mediaInfo.mediaUrl,
                mediaContentType: mediaInfo.mediaContentType,

                // Telegram-specific extras
                messageType: type,
                fileName: mediaInfo.fileName,
                telegramContext: ctx,

                // User info
                from: {
                    id: message.from.id,
                    username: message.from.username,
                    firstName: message.from.first_name,
                    lastName: message.from.last_name
                }
            };

            // Send typing indicator for better UX
            await this.sendTypingIndicator(chatId);

            // Call the handler and get response
            const response = await messageHandler(messageData);

            // Send response if provided
            if (response) {
                await this.sendMessage(chatId, response);
            }
        } catch (err) {
            console.error('[Telegram] Error processing message:', err.message);
            await ctx.reply('Sorry, an error occurred processing your message.');
        }
    }

    /**
     * Extract media info from a Telegram message
     * Converts Telegram's file_id system to direct URLs (matching Twilio's MediaUrl format)
     *
     * @param {Object} message - Telegram message object
     * @returns {Promise<Object>} Media info with mediaUrl, mediaContentType, numMedia
     */
    async extractMediaInfo(message) {
        let mediaUrl = null;
        let mediaContentType = null;
        let numMedia = 0;
        let fileName = null;

        try {
            if (message.photo) {
                // Get the largest photo (last in array)
                const photos = message.photo;
                const largestPhoto = photos[photos.length - 1];
                const fileLink = await this.bot.telegram.getFileLink(largestPhoto.file_id);
                mediaUrl = fileLink.href;
                mediaContentType = 'image/jpeg'; // Telegram converts to JPEG
                numMedia = 1;
            } else if (message.voice) {
                const fileLink = await this.bot.telegram.getFileLink(message.voice.file_id);
                mediaUrl = fileLink.href;
                mediaContentType = message.voice.mime_type || 'audio/ogg';
                numMedia = 1;
            } else if (message.audio) {
                const fileLink = await this.bot.telegram.getFileLink(message.audio.file_id);
                mediaUrl = fileLink.href;
                mediaContentType = message.audio.mime_type || 'audio/mpeg';
                numMedia = 1;
                fileName = message.audio.file_name;
            } else if (message.video) {
                const fileLink = await this.bot.telegram.getFileLink(message.video.file_id);
                mediaUrl = fileLink.href;
                mediaContentType = message.video.mime_type || 'video/mp4';
                numMedia = 1;
            } else if (message.document) {
                const fileLink = await this.bot.telegram.getFileLink(message.document.file_id);
                mediaUrl = fileLink.href;
                mediaContentType = message.document.mime_type || 'application/octet-stream';
                numMedia = 1;
                fileName = message.document.file_name;
            }
        } catch (error) {
            console.error('[Telegram] Error extracting media:', error.message);
        }

        return { mediaUrl, mediaContentType, numMedia, fileName };
    }

    /**
     * Send a text message to a Telegram chat
     * Similar to sendWhatsAppMessage function in index.js lines 121-138
     *
     * @param {number|string} chatId - Telegram chat ID
     * @param {string} text - Message text to send
     * @param {Object} [options] - Additional Telegram message options
     * @returns {Promise<Object|null>} Message result or null if failed
     */
    async sendMessage(chatId, text, options = {}) {
        if (!this.bot) {
            console.log('[Mock] Would send Telegram:', text.substring(0, 50) + '...');
            return null;
        }

        try {
            // Split long messages (Telegram limit: 4096 chars)
            const chunks = this.splitMessage(text, MESSAGE_LIMITS.TRUNCATE_AT);

            let result = null;
            for (const chunk of chunks) {
                result = await this.bot.telegram.sendMessage(chatId, chunk, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    ...options
                });
            }

            console.log(`[${new Date().toISOString()}] Telegram message sent to ${chatId}`);
            try {
                const activityLog = require('./lib/activity-log');
                activityLog.log('activity', 'telegram', `Response sent to ${chatId} (${text.length} chars)`, { chatId });
            } catch (e) { /* activity log not critical */ }
            return result;
        } catch (error) {
            // Handle markdown parse errors by retrying without markdown
            if (error.message?.includes('parse') || error.message?.includes('Can\'t parse')) {
                try {
                    console.log('[Telegram] Markdown parse failed, retrying as plain text');
                    return await this.bot.telegram.sendMessage(chatId, text, {
                        disable_web_page_preview: true,
                        ...options
                    });
                } catch (retryError) {
                    console.error('Error sending Telegram message (retry):', retryError.message);
                }
            }
            console.error('Error sending Telegram message:', error.message);
            return null;
        }
    }

    /**
     * Send a media message to a Telegram chat
     * Handles photos, documents, audio, video, and voice
     *
     * @param {number|string} chatId - Telegram chat ID
     * @param {string} mediaUrl - URL or file_id of the media to send
     * @param {string} [mediaType='photo'] - Type: 'photo', 'document', 'audio', 'video', 'voice'
     * @param {string} [caption=''] - Optional caption (max 1024 chars)
     * @returns {Promise<Object|null>} Message result or null if failed
     */
    async sendMediaMessage(chatId, mediaUrl, mediaType = 'photo', caption = '') {
        if (!this.bot) {
            console.log('[Mock] Would send Telegram media:', mediaType, mediaUrl?.substring(0, 50));
            return null;
        }

        try {
            // Truncate caption if needed (Telegram limit: 1024 chars for captions)
            const truncatedCaption = caption.length > MESSAGE_LIMITS.TELEGRAM_CAPTION
                ? caption.substring(0, MESSAGE_LIMITS.TELEGRAM_CAPTION - 20) + '\n_[Caption truncated]_'
                : caption;

            const options = {
                caption: truncatedCaption,
                parse_mode: 'Markdown'
            };

            let result = null;

            switch (mediaType.toLowerCase()) {
                case 'photo':
                case 'image':
                    result = await this.bot.telegram.sendPhoto(chatId, mediaUrl, options);
                    break;
                case 'document':
                case 'file':
                    result = await this.bot.telegram.sendDocument(chatId, mediaUrl, options);
                    break;
                case 'audio':
                    result = await this.bot.telegram.sendAudio(chatId, mediaUrl, options);
                    break;
                case 'video':
                    result = await this.bot.telegram.sendVideo(chatId, mediaUrl, options);
                    break;
                case 'voice':
                    result = await this.bot.telegram.sendVoice(chatId, mediaUrl, options);
                    break;
                default:
                    // Default to document for unknown types
                    result = await this.bot.telegram.sendDocument(chatId, mediaUrl, options);
            }

            console.log(`[${new Date().toISOString()}] Telegram ${mediaType} sent to ${chatId}`);
            return result;
        } catch (error) {
            console.error(`Error sending Telegram ${mediaType}:`, error.message);
            return null;
        }
    }

    /**
     * Send a typing indicator (shows "typing..." in chat)
     * Useful for long-running operations to indicate the bot is processing
     *
     * @param {number|string} chatId - Telegram chat ID
     * @returns {Promise<boolean>} Success status
     */
    async sendTypingIndicator(chatId) {
        if (!this.bot) return false;

        try {
            await this.bot.telegram.sendChatAction(chatId, 'typing');
            return true;
        } catch (error) {
            // Don't log typing errors - they're not critical
            return false;
        }
    }

    /**
     * Split a message into chunks that fit within Telegram's limit
     * Tries to break at sensible points (newlines, spaces)
     *
     * @param {string} text - Text to split
     * @param {number} [maxLength=4000] - Maximum length per chunk
     * @returns {string[]} Array of message chunks
     */
    splitMessage(text, maxLength = MESSAGE_LIMITS.TRUNCATE_AT) {
        if (!text || text.length <= maxLength) {
            return [text];
        }

        const chunks = [];
        let remaining = text;

        while (remaining.length > 0) {
            if (remaining.length <= maxLength) {
                chunks.push(remaining);
                break;
            }

            // Find a good break point (prefer double newline, then newline, then space)
            let breakPoint = remaining.lastIndexOf('\n\n', maxLength);
            if (breakPoint === -1 || breakPoint < maxLength * 0.5) {
                breakPoint = remaining.lastIndexOf('\n', maxLength);
            }
            if (breakPoint === -1 || breakPoint < maxLength * 0.5) {
                breakPoint = remaining.lastIndexOf(' ', maxLength);
            }
            if (breakPoint === -1 || breakPoint < maxLength * 0.5) {
                breakPoint = maxLength;
            }

            chunks.push(remaining.substring(0, breakPoint));
            remaining = remaining.substring(breakPoint).trim();
        }

        // Add continuation markers if multiple chunks
        if (chunks.length > 1) {
            for (let i = 0; i < chunks.length; i++) {
                chunks[i] = chunks[i] + `\n\n_(${i + 1}/${chunks.length})_`;
            }
        }

        return chunks;
    }

    /**
     * Get Express middleware for webhook handling
     * Use this to set up the webhook route in Express
     *
     * Example:
     *   app.use(telegram.getWebhookPath(), telegram.getWebhookMiddleware());
     *
     * @returns {Function|null} Express middleware or null if not configured
     */
    getWebhookMiddleware() {
        if (!this.bot) return null;

        const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
        return this.bot.webhookCallback(this.webhookPath, {
            secretToken: secret || undefined
        });
    }

    /**
     * Get bot info (username, name, etc.)
     * @returns {Promise<Object|null>} Bot info or cached value
     */
    async getBotInfo() {
        if (this.botInfo) return this.botInfo;
        if (!this.bot) return null;

        try {
            this.botInfo = await this.bot.telegram.getMe();
            return this.botInfo;
        } catch (error) {
            console.error('Error getting bot info:', error.message);
            return null;
        }
    }

    /**
     * Delete the webhook (useful for switching to long-polling)
     * @returns {Promise<boolean>} Success status
     */
    async deleteWebhook() {
        if (!this.bot) return false;

        try {
            await this.bot.telegram.deleteWebhook();
            console.log('✅ Telegram webhook deleted');
            return true;
        } catch (error) {
            console.error('Error deleting webhook:', error.message);
            return false;
        }
    }

    /**
     * Set webhook URL for receiving updates
     * @param {string} url - Full webhook URL (must be HTTPS)
     * @returns {Promise<boolean>} Success status
     */
    async setWebhook(url) {
        if (!this.bot) return false;

        try {
            const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
            await this.bot.telegram.setWebhook(url, {
                secret_token: secret || undefined,
                allowed_updates: ['message', 'edited_message', 'callback_query']
            });
            console.log(`✅ Telegram webhook set: ${url}`);
            return true;
        } catch (error) {
            console.error('Error setting webhook:', error.message);
            return false;
        }
    }

    /**
     * Get current webhook info
     * @returns {Promise<Object|null>} Webhook info
     */
    async getWebhookInfo() {
        if (!this.bot) return null;

        try {
            return await this.bot.telegram.getWebhookInfo();
        } catch (error) {
            console.error('Error getting webhook info:', error.message);
            return null;
        }
    }

    // ============================================================================
    // Inline Keyboard Button Support
    // ============================================================================

    /**
     * Send a message with inline keyboard buttons
     * Buttons allow quick one-tap actions directly from the message
     *
     * @param {number|string} chatId - Telegram chat ID
     * @param {string} text - Message text to send
     * @param {Array} buttons - Button layout array
     *   Format: [[{text: 'Button 1', callback_data: 'action:param'}], [{text: 'B2', callback_data: 'x'}]]
     *   - Outer array: rows
     *   - Inner array: buttons in that row
     * @param {Object} [options] - Additional Telegram message options
     * @returns {Promise<Object|null>} Message result or null if failed
     *
     * @example
     * await telegram.sendMessageWithButtons(chatId, 'Choose action:', [
     *     [{ text: 'Deploy', callback_data: 'deploy:my-repo' }],
     *     [{ text: 'Logs', callback_data: 'logs:my-repo' }, { text: 'Tests', callback_data: 'tests:my-repo' }]
     * ]);
     */
    async sendMessageWithButtons(chatId, text, buttons, options = {}) {
        if (!this.bot) {
            console.log('[Mock] Would send Telegram with buttons:', text.substring(0, 50) + '...');
            return null;
        }

        try {
            // Validate buttons array
            if (!Array.isArray(buttons) || buttons.length === 0) {
                // Fall back to regular message if no buttons
                return await this.sendMessage(chatId, text, options);
            }

            // Split long messages - buttons only attach to last chunk
            const chunks = this.splitMessage(text, MESSAGE_LIMITS.TRUNCATE_AT);

            let result = null;

            // Send all chunks except the last without buttons
            for (let i = 0; i < chunks.length - 1; i++) {
                await this.bot.telegram.sendMessage(chatId, chunks[i], {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    ...options
                });
            }

            // Send last chunk with inline keyboard
            result = await this.bot.telegram.sendMessage(chatId, chunks[chunks.length - 1], {
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: buttons
                },
                ...options
            });

            console.log(`[${new Date().toISOString()}] Telegram message with buttons sent to ${chatId}`);
            return result;
        } catch (error) {
            // Handle markdown parse errors by retrying without markdown
            if (error.message?.includes('parse') || error.message?.includes('Can\'t parse')) {
                try {
                    console.log('[Telegram] Markdown parse failed, retrying as plain text with buttons');
                    return await this.bot.telegram.sendMessage(chatId, text, {
                        disable_web_page_preview: true,
                        reply_markup: {
                            inline_keyboard: buttons
                        },
                        ...options
                    });
                } catch (retryError) {
                    console.error('Error sending Telegram message with buttons (retry):', retryError.message);
                }
            }
            console.error('Error sending Telegram message with buttons:', error.message);
            return null;
        }
    }

    /**
     * Set up a callback query handler for inline keyboard button presses
     * When a user clicks an inline button, this handler processes the callback
     *
     * @param {Function} handler - Async callback handler function
     *   Signature: async (callbackData, chatId, ctx) => void
     *   - callbackData: The callback_data string from the pressed button
     *   - chatId: The chat ID where the button was pressed
     *   - ctx: Full Telegraf context for advanced operations
     *
     * @example
     * telegram.setupCallbackHandler(async (callbackData, chatId, ctx) => {
     *     const { action, params } = ActionButtons.parseCallback(callbackData);
     *     if (action === 'deploy') {
     *         await executeDeployment(params);
     *         await ctx.editMessageText('Deployment started!');
     *     }
     * });
     */
    setupCallbackHandler(handler) {
        if (!this.bot) {
            console.log('[Telegram] Cannot setup callback handler - bot not configured');
            return;
        }

        this.bot.on('callback_query', async (ctx) => {
            try {
                const callbackData = ctx.callbackQuery.data;
                const chatId = ctx.callbackQuery.message?.chat?.id;
                const userId = chatId?.toString();

                console.log(`[${new Date().toISOString()}] Telegram callback: "${callbackData}" from ${userId}`);

                // Authorization check
                if (!this.isAuthorized(chatId)) {
                    console.log(`[Telegram] Unauthorized callback from: ${userId}`);
                    await ctx.answerCbQuery('Unauthorized');
                    return;
                }

                // Acknowledge button press immediately (removes loading state)
                await ctx.answerCbQuery();

                // Send typing indicator for longer operations
                await this.sendTypingIndicator(chatId);

                // Call the provided handler
                await handler(callbackData, chatId, ctx);

            } catch (error) {
                console.error('[Telegram] Callback handler error:', error.message);
                try {
                    await ctx.answerCbQuery('Error processing request');
                } catch (e) {
                    // Already answered or other error
                }
            }
        });

        console.log('[Telegram] Callback handler configured for inline buttons');
    }

    /**
     * Edit an existing message's text (useful for updating button messages)
     *
     * @param {number|string} chatId - Chat ID containing the message
     * @param {number} messageId - Message ID to edit
     * @param {string} text - New text content
     * @param {Array} [buttons] - Optional new button layout (null to remove buttons)
     * @returns {Promise<Object|null>} Edited message or null if failed
     */
    async editMessage(chatId, messageId, text, buttons = undefined) {
        if (!this.bot) return null;

        try {
            const options = {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            };

            // Include buttons if provided, or remove them if explicitly null
            if (buttons !== undefined) {
                options.reply_markup = buttons ? { inline_keyboard: buttons } : undefined;
            }

            return await this.bot.telegram.editMessageText(chatId, messageId, null, text, options);
        } catch (error) {
            // Ignore "message is not modified" errors
            if (!error.message?.includes('not modified')) {
                console.error('Error editing Telegram message:', error.message);
            }
            return null;
        }
    }

    /**
     * Answer a callback query with a toast notification
     * Shows a brief popup to the user
     *
     * @param {string} callbackQueryId - The callback query ID from ctx.callbackQuery.id
     * @param {string} text - Text to show (optional, max 200 chars)
     * @param {boolean} showAlert - If true, shows as modal alert instead of toast
     * @returns {Promise<boolean>} Success status
     */
    async answerCallback(callbackQueryId, text = '', showAlert = false) {
        if (!this.bot) return false;

        try {
            await this.bot.telegram.answerCbQuery(callbackQueryId, text, showAlert);
            return true;
        } catch (error) {
            // Callback queries expire after 30 seconds, so this error is common
            if (!error.message?.includes('query is too old')) {
                console.error('Error answering callback:', error.message);
            }
            return false;
        }
    }
}

// ============================================================================
// Singleton Pattern (mirrors Twilio client pattern in index.js)
// ============================================================================

let telegramHandlerInstance = null;

/**
 * Get or create the Telegram handler singleton
 * Usage:
 *   const { getTelegramHandler } = require('./telegram-handler');
 *   const telegram = getTelegramHandler();
 *
 *   if (telegram.isAvailable()) {
 *       await telegram.sendMessage(chatId, 'Hello!');
 *   }
 *
 * @returns {TelegramHandler} The singleton instance
 */
function getTelegramHandler() {
    if (!telegramHandlerInstance) {
        telegramHandlerInstance = new TelegramHandler();
    }
    return telegramHandlerInstance;
}

module.exports = {
    TelegramHandler,
    getTelegramHandler,
    MESSAGE_LIMITS,
    // Also export singleton for backwards compatibility with existing code
    telegramHandler: getTelegramHandler()
};
