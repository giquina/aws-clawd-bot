// hooks/error-alerter.js
// Error alerting system - catches uncaught errors and sends alerts
// Primary: Telegram, Backup: WhatsApp (critical alerts only)
const twilio = require('twilio');

class ErrorAlerter {
  constructor() {
    this.twilioClient = null;
    this.telegramHandler = null;
    this.ownerNumber = process.env.YOUR_WHATSAPP;
    this.twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    this.telegramHQChatId = process.env.TELEGRAM_HQ_CHAT_ID;
    this.lastAlertTime = 0;
    this.alertCooldown = 5 * 60 * 1000; // 5 min cooldown to prevent spam
  }

  initialize() {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }

    // Telegram handler will be set later via setTelegramHandler
    // Catch uncaught exceptions
    process.on('uncaughtException', (err) => this.handleError('Uncaught Exception', err));
    process.on('unhandledRejection', (reason) => this.handleError('Unhandled Rejection', reason));

    console.log('[ErrorAlerter] Initialized - watching for errors (Telegram primary)');
  }

  /**
   * Set the Telegram handler for sending alerts
   * @param {Object} handler - Telegram handler instance
   */
  setTelegramHandler(handler) {
    this.telegramHandler = handler;
    console.log('[ErrorAlerter] Telegram handler configured');
  }

  async handleError(type, error) {
    const now = Date.now();
    console.error(`[ErrorAlerter] ${type}:`, error);

    // Cooldown check
    if (now - this.lastAlertTime < this.alertCooldown) {
      console.log('[ErrorAlerter] Skipping alert (cooldown)');
      return;
    }

    this.lastAlertTime = now;
    await this.sendAlert(type, error, 'critical'); // Errors are always critical
  }

  /**
   * Send alert to appropriate platforms based on alert level
   * Critical alerts go to both Telegram and WhatsApp
   * @param {string} type - Error type
   * @param {Error} error - Error object
   * @param {string} alertLevel - 'critical', 'important', or 'info'
   */
  async sendAlert(type, error, alertLevel = 'critical') {
    const message = `*CLAWDBOT ERROR*

Type: ${type}
Time: ${new Date().toISOString()}

Error: ${error?.message || String(error)}

Stack: ${error?.stack?.slice(0, 500) || 'N/A'}`;

    // Send to Telegram first (primary platform)
    const telegramSent = await this.sendTelegramAlert(message);

    // For critical alerts, also send to WhatsApp as backup
    if (alertLevel === 'critical') {
      await this.sendWhatsAppAlert(message);
    } else if (!telegramSent) {
      // Fallback to WhatsApp if Telegram failed
      await this.sendWhatsAppAlert(message);
    }
  }

  /**
   * Send alert via Telegram
   * @param {string} message - Alert message
   * @returns {Promise<boolean>} Success status
   */
  async sendTelegramAlert(message) {
    if (!this.telegramHandler || !this.telegramHQChatId) {
      console.log('[ErrorAlerter] Telegram not configured, skipping');
      return false;
    }

    try {
      await this.telegramHandler.sendMessage(this.telegramHQChatId, message);
      console.log('[ErrorAlerter] Alert sent to Telegram');
      return true;
    } catch (e) {
      console.error('[ErrorAlerter] Failed to send Telegram alert:', e.message);
      return false;
    }
  }

  /**
   * Send alert via WhatsApp
   * @param {string} message - Alert message
   * @returns {Promise<boolean>} Success status
   */
  async sendWhatsAppAlert(message) {
    if (!this.twilioClient || !this.ownerNumber) {
      console.log('[ErrorAlerter] WhatsApp not configured, skipping');
      return false;
    }

    try {
      await this.twilioClient.messages.create({
        body: message,
        from: `whatsapp:${this.twilioNumber}`,
        to: `whatsapp:${this.ownerNumber}`
      });
      console.log('[ErrorAlerter] Alert sent to WhatsApp (backup)');
      return true;
    } catch (e) {
      console.error('[ErrorAlerter] Failed to send WhatsApp alert:', e.message);
      return false;
    }
  }

  /**
   * Manual alert for skills to use
   * @param {string} title - Alert title
   * @param {string} details - Alert details
   * @param {string} alertLevel - 'critical', 'important', or 'info'
   */
  async alert(title, details, alertLevel = 'important') {
    const message = `*CLAWDBOT ALERT*

${title}

${details}

Time: ${new Date().toISOString()}`;

    // Send to Telegram first (primary platform)
    const telegramSent = await this.sendTelegramAlert(message);

    // For critical alerts, also send to WhatsApp
    if (alertLevel === 'critical') {
      await this.sendWhatsAppAlert(message);
    } else if (!telegramSent) {
      // Fallback to WhatsApp if Telegram failed
      await this.sendWhatsAppAlert(message);
    }
  }
}

module.exports = new ErrorAlerter();
