// hooks/error-alerter.js
// Error alerting system - catches uncaught errors and sends WhatsApp alerts to owner
const twilio = require('twilio');

class ErrorAlerter {
  constructor() {
    this.client = null;
    this.ownerNumber = process.env.YOUR_WHATSAPP;
    this.twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    this.lastAlertTime = 0;
    this.alertCooldown = 5 * 60 * 1000; // 5 min cooldown to prevent spam
  }

  initialize() {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }

    // Catch uncaught exceptions
    process.on('uncaughtException', (err) => this.handleError('Uncaught Exception', err));
    process.on('unhandledRejection', (reason) => this.handleError('Unhandled Rejection', reason));

    console.log('[ErrorAlerter] Initialized - watching for errors');
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
    await this.sendAlert(type, error);
  }

  async sendAlert(type, error) {
    if (!this.client || !this.ownerNumber) return;

    const message = `*CLAWDBOT ERROR*

Type: ${type}
Time: ${new Date().toISOString()}

Error: ${error?.message || String(error)}

Stack: ${error?.stack?.slice(0, 500) || 'N/A'}`;

    try {
      await this.client.messages.create({
        body: message,
        from: `whatsapp:${this.twilioNumber}`,
        to: `whatsapp:${this.ownerNumber}`
      });
      console.log('[ErrorAlerter] Alert sent to owner');
    } catch (e) {
      console.error('[ErrorAlerter] Failed to send alert:', e.message);
    }
  }

  // Manual alert for skills to use
  async alert(title, details) {
    if (!this.client || !this.ownerNumber) return;

    const message = `*CLAWDBOT ALERT*

${title}

${details}

Time: ${new Date().toISOString()}`;

    try {
      await this.client.messages.create({
        body: message,
        from: `whatsapp:${this.twilioNumber}`,
        to: `whatsapp:${this.ownerNumber}`
      });
    } catch (e) {
      console.error('[ErrorAlerter] Failed to send alert:', e.message);
    }
  }
}

module.exports = new ErrorAlerter();
