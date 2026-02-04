/**
 * Invoices Skill - Invoice management and PDF generation
 *
 * Manages client invoices with automatic numbering, PDF generation, and status tracking.
 * Integrates with the outcome tracker for intelligent context awareness.
 *
 * Commands:
 *   invoice create <client> <amount> [currency] - Create new invoice (draft status)
 *   invoice list [status]                        - List invoices (all, draft, sent, paid)
 *   invoice send <id|number>                     - Mark as sent and generate PDF
 *   invoice status <id|number>                   - Check invoice details
 *   invoice paid <id|number>                     - Mark as paid
 *   invoice delete <id|number>                   - Delete an invoice
 *
 * Invoice number format: INV-YYYYMM-NNN (e.g., INV-202602-001)
 * Default due date: 30 days from creation
 * PDF storage: /opt/clawd-bot/data/invoices/ (EC2) or data/invoices/ (local)
 *
 * @example
 * invoice create "Acme Corp" 1500 GBP
 * -> Creates draft invoice INV-202602-001 for £1,500, due in 30 days
 *
 * invoice send INV-202602-001
 * -> Generates PDF, marks as sent, returns file path
 *
 * invoice list sent
 * -> Shows all sent invoices with amounts and due dates
 */
const BaseSkill = require('../base-skill');
const db = require('../../lib/database');
const fs = require('fs');
const path = require('path');

// Determine invoice storage path (EC2 vs local)
function getInvoicesDir() {
  const ec2Path = '/opt/clawd-bot/data/invoices';
  const localPath = path.join(__dirname, '..', '..', 'data', 'invoices');

  if (process.platform !== 'win32' && fs.existsSync('/opt/clawd-bot')) {
    if (!fs.existsSync(ec2Path)) {
      fs.mkdirSync(ec2Path, { recursive: true });
    }
    return ec2Path;
  }

  if (!fs.existsSync(localPath)) {
    fs.mkdirSync(localPath, { recursive: true });
  }
  return localPath;
}

class InvoicesSkill extends BaseSkill {
  name = 'invoices';
  description = 'Invoice management and PDF generation';
  priority = 19;

  commands = [
    {
      pattern: /^invoice create (.+?) (\d+\.?\d*)\s*([A-Z]{3})?$/i,
      description: 'Create new invoice',
      usage: 'invoice create <client> <amount> [currency]'
    },
    {
      pattern: /^invoice list\s*(draft|sent|paid)?$/i,
      description: 'List invoices',
      usage: 'invoice list [status]'
    },
    {
      pattern: /^invoice send (.+?)$/i,
      description: 'Mark invoice as sent and generate PDF',
      usage: 'invoice send <id|number>'
    },
    {
      pattern: /^invoice status (.+?)$/i,
      description: 'Check invoice details',
      usage: 'invoice status <id|number>'
    },
    {
      pattern: /^invoice paid (.+?)$/i,
      description: 'Mark invoice as paid',
      usage: 'invoice paid <id|number>'
    },
    {
      pattern: /^invoice delete (.+?)$/i,
      description: 'Delete an invoice',
      usage: 'invoice delete <id|number>'
    }
  ];

  async execute(command, context) {
    const { from: userId, platform = 'telegram' } = context;
    const trimmedCmd = command.trim();

    try {
      // Create invoice
      const createMatch = trimmedCmd.match(/^invoice create (.+?) (\d+\.?\d*)\s*([A-Z]{3})?$/i);
      if (createMatch) {
        return await this.createInvoice(userId, createMatch, context);
      }

      // List invoices
      const listMatch = trimmedCmd.match(/^invoice list\s*(draft|sent|paid)?$/i);
      if (listMatch) {
        return await this.listInvoices(userId, listMatch[1] ? listMatch[1].toLowerCase() : null, context);
      }

      // Send invoice
      const sendMatch = trimmedCmd.match(/^invoice send (.+?)$/i);
      if (sendMatch) {
        return await this.sendInvoice(userId, sendMatch[1].trim(), context);
      }

      // Check invoice status
      const statusMatch = trimmedCmd.match(/^invoice status (.+?)$/i);
      if (statusMatch) {
        return await this.getInvoiceStatus(userId, statusMatch[1].trim(), context);
      }

      // Mark invoice as paid
      const paidMatch = trimmedCmd.match(/^invoice paid (.+?)$/i);
      if (paidMatch) {
        return await this.markInvoicePaid(userId, paidMatch[1].trim(), context);
      }

      // Delete invoice
      const deleteMatch = trimmedCmd.match(/^invoice delete (.+?)$/i);
      if (deleteMatch) {
        return await this.deleteInvoice(userId, deleteMatch[1].trim(), context);
      }

      return this.error('Unknown invoice command', null, {
        suggestion: 'Try "invoice create <client> <amount>" or "invoice list"'
      });
    } catch (error) {
      this.log('error', 'Invoice command error:', error);
      return this.error('Invoice command failed', error);
    }
  }

  /**
   * Create a new invoice
   */
  async createInvoice(userId, match, context) {
    // Strip quotes from client name if present
    const clientName = match[1].trim().replace(/^["'](.+)["']$/, '$1');
    const amount = parseFloat(match[2]);
    const currency = match[3] ? match[3].toUpperCase() : 'GBP';

    if (isNaN(amount) || amount <= 0) {
      return this.error('Invalid amount', null, {
        suggestion: 'Amount must be a positive number'
      });
    }

    try {
      // Start outcome tracking
      const outcomeTracker = require('../../lib/outcome-tracker');
      const actionId = outcomeTracker.startAction(
        'invoice_create',
        { clientName, amount, currency },
        context.chatId,
        userId
      );

      const result = db.saveInvoice(userId, { clientName, amount, currency });

      if (!result) {
        outcomeTracker.completeAction(actionId, 'failed', { error: 'Database error' });
        return this.error('Failed to create invoice', 'Database error');
      }

      outcomeTracker.completeAction(actionId, 'success', {
        invoiceNumber: result.invoiceNumber,
        amount,
        currency
      });

      // Calculate due date (30 days from now)
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const dueDateStr = dueDate.toISOString().split('T')[0];

      return this.success(
        `Invoice created: ${result.invoiceNumber}\n` +
        `Client: ${clientName}\n` +
        `Amount: ${currency} ${amount.toFixed(2)}\n` +
        `Status: Draft\n` +
        `Due: ${dueDateStr}\n\n` +
        `Use "invoice send ${result.invoiceNumber}" to mark as sent and generate PDF.`,
        { id: result.id, invoiceNumber: result.invoiceNumber }
      );
    } catch (error) {
      this.log('error', 'Create invoice error:', error);
      return this.error('Failed to create invoice', error);
    }
  }

  /**
   * List invoices with optional status filter
   */
  async listInvoices(userId, status, context) {
    try {
      const invoices = db.listInvoices(userId, status);

      if (!invoices || invoices.length === 0) {
        const statusText = status ? ` with status "${status}"` : '';
        return this.success(`No invoices found${statusText}.`);
      }

      let response = `*Invoices${status ? ` (${status})` : ''}*\n\n`;

      // Group by status
      const grouped = invoices.reduce((acc, inv) => {
        if (!acc[inv.status]) acc[inv.status] = [];
        acc[inv.status].push(inv);
        return acc;
      }, {});

      for (const [statusKey, list] of Object.entries(grouped)) {
        response += `*${statusKey.toUpperCase()}*\n`;
        list.forEach(inv => {
          const created = new Date(inv.created_at).toLocaleDateString();
          const dueDate = inv.due_date ? new Date(inv.due_date).toLocaleDateString() : 'N/A';
          response += `• ${inv.invoice_number} - ${inv.client_name}\n`;
          response += `  ${inv.currency} ${parseFloat(inv.amount).toFixed(2)} | Due: ${dueDate}\n`;
        });
        response += '\n';
      }

      // Summary
      const total = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
      response += `Total: ${invoices.length} invoice(s) | ${invoices[0]?.currency || 'GBP'} ${total.toFixed(2)}`;

      return this.success(response);
    } catch (error) {
      this.log('error', 'List invoices error:', error);
      return this.error('Failed to list invoices', error);
    }
  }

  /**
   * Send invoice (mark as sent and generate PDF)
   */
  async sendInvoice(userId, idOrNumber, context) {
    try {
      // Parse ID if numeric
      const invoiceId = /^\d+$/.test(idOrNumber) ? parseInt(idOrNumber) : idOrNumber;
      const invoice = db.getInvoice(invoiceId);

      if (!invoice) {
        return this.error('Invoice not found', null, {
          suggestion: 'Check the invoice number or ID'
        });
      }

      if (invoice.user_id !== userId) {
        return this.error('Access denied', 'You can only send your own invoices');
      }

      if (invoice.status === 'sent' || invoice.status === 'paid') {
        return this.error('Invoice already sent', null, {
          suggestion: `Invoice is currently "${invoice.status}"`
        });
      }

      // Start outcome tracking
      const outcomeTracker = require('../../lib/outcome-tracker');
      const actionId = outcomeTracker.startAction(
        'invoice_send',
        { invoiceNumber: invoice.invoice_number },
        context.chatId,
        userId
      );

      // Generate PDF
      const pdfPath = await this.generatePDF(invoice);

      // Update status to sent
      const updated = db.updateInvoiceStatus(invoiceId, 'sent', { pdfPath });

      if (!updated) {
        outcomeTracker.completeAction(actionId, 'failed', { error: 'Update failed' });
        return this.error('Failed to update invoice status', 'Database error');
      }

      outcomeTracker.completeAction(actionId, 'success', {
        invoiceNumber: invoice.invoice_number,
        pdfPath
      });

      return this.success(
        `Invoice sent: ${invoice.invoice_number}\n` +
        `Client: ${invoice.client_name}\n` +
        `Amount: ${invoice.currency} ${parseFloat(invoice.amount).toFixed(2)}\n` +
        `PDF: ${pdfPath}\n` +
        `Sent: ${new Date().toLocaleString()}\n\n` +
        `Use "invoice paid ${invoice.invoice_number}" when payment is received.`,
        { pdfPath }
      );
    } catch (error) {
      this.log('error', 'Send invoice error:', error);
      return this.error('Failed to send invoice', error);
    }
  }

  /**
   * Get invoice status and details
   */
  async getInvoiceStatus(userId, idOrNumber, context) {
    try {
      const invoiceId = /^\d+$/.test(idOrNumber) ? parseInt(idOrNumber) : idOrNumber;
      const invoice = db.getInvoice(invoiceId);

      if (!invoice) {
        return this.error('Invoice not found', null, {
          suggestion: 'Check the invoice number or ID'
        });
      }

      if (invoice.user_id !== userId) {
        return this.error('Access denied', 'You can only view your own invoices');
      }

      const created = new Date(invoice.created_at).toLocaleString();
      const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A';
      const sentAt = invoice.sent_at ? new Date(invoice.sent_at).toLocaleString() : 'Not sent';
      const paidAt = invoice.paid_at ? new Date(invoice.paid_at).toLocaleString() : 'Not paid';

      let response = `*Invoice ${invoice.invoice_number}*\n\n`;
      response += `Client: ${invoice.client_name}\n`;
      response += `Amount: ${invoice.currency} ${parseFloat(invoice.amount).toFixed(2)}\n`;
      response += `Status: ${invoice.status}\n`;
      response += `Due: ${dueDate}\n`;
      response += `Created: ${created}\n`;
      response += `Sent: ${sentAt}\n`;
      response += `Paid: ${paidAt}\n`;

      if (invoice.pdf_path) {
        response += `PDF: ${invoice.pdf_path}\n`;
      }

      return this.success(response);
    } catch (error) {
      this.log('error', 'Get invoice status error:', error);
      return this.error('Failed to get invoice status', error);
    }
  }

  /**
   * Mark invoice as paid
   */
  async markInvoicePaid(userId, idOrNumber, context) {
    try {
      const invoiceId = /^\d+$/.test(idOrNumber) ? parseInt(idOrNumber) : idOrNumber;
      const invoice = db.getInvoice(invoiceId);

      if (!invoice) {
        return this.error('Invoice not found', null, {
          suggestion: 'Check the invoice number or ID'
        });
      }

      if (invoice.user_id !== userId) {
        return this.error('Access denied', 'You can only update your own invoices');
      }

      if (invoice.status === 'paid') {
        return this.error('Invoice already marked as paid');
      }

      // Start outcome tracking
      const outcomeTracker = require('../../lib/outcome-tracker');
      const actionId = outcomeTracker.startAction(
        'invoice_paid',
        { invoiceNumber: invoice.invoice_number, amount: invoice.amount },
        context.chatId,
        userId
      );

      const updated = db.updateInvoiceStatus(invoiceId, 'paid');

      if (!updated) {
        outcomeTracker.completeAction(actionId, 'failed', { error: 'Update failed' });
        return this.error('Failed to update invoice status', 'Database error');
      }

      outcomeTracker.completeAction(actionId, 'success', {
        invoiceNumber: invoice.invoice_number,
        amount: invoice.amount,
        currency: invoice.currency
      });

      return this.success(
        `Invoice marked as paid: ${invoice.invoice_number}\n` +
        `Client: ${invoice.client_name}\n` +
        `Amount: ${invoice.currency} ${parseFloat(invoice.amount).toFixed(2)}\n` +
        `Paid: ${new Date().toLocaleString()}`
      );
    } catch (error) {
      this.log('error', 'Mark invoice paid error:', error);
      return this.error('Failed to mark invoice as paid', error);
    }
  }

  /**
   * Delete an invoice
   */
  async deleteInvoice(userId, idOrNumber, context) {
    try {
      const invoiceId = /^\d+$/.test(idOrNumber) ? parseInt(idOrNumber) : idOrNumber;
      const invoice = db.getInvoice(invoiceId);

      if (!invoice) {
        return this.error('Invoice not found', null, {
          suggestion: 'Check the invoice number or ID'
        });
      }

      if (invoice.user_id !== userId) {
        return this.error('Access denied', 'You can only delete your own invoices');
      }

      // Start outcome tracking
      const outcomeTracker = require('../../lib/outcome-tracker');
      const actionId = outcomeTracker.startAction(
        'invoice_delete',
        { invoiceNumber: invoice.invoice_number },
        context.chatId,
        userId
      );

      // Delete PDF if exists
      if (invoice.pdf_path && fs.existsSync(invoice.pdf_path)) {
        try {
          fs.unlinkSync(invoice.pdf_path);
        } catch (err) {
          this.log('warn', 'Failed to delete PDF file:', err);
        }
      }

      const deleted = db.deleteInvoice(invoiceId);

      if (!deleted) {
        outcomeTracker.completeAction(actionId, 'failed', { error: 'Delete failed' });
        return this.error('Failed to delete invoice', 'Database error');
      }

      outcomeTracker.completeAction(actionId, 'success', {
        invoiceNumber: invoice.invoice_number
      });

      return this.success(
        `Invoice deleted: ${invoice.invoice_number}\n` +
        `Client: ${invoice.client_name}\n` +
        `Amount: ${invoice.currency} ${parseFloat(invoice.amount).toFixed(2)}`
      );
    } catch (error) {
      this.log('error', 'Delete invoice error:', error);
      return this.error('Failed to delete invoice', error);
    }
  }

  /**
   * Generate a simple text-based PDF invoice
   * @param {Object} invoice - Invoice data
   * @returns {Promise<string>} PDF file path
   */
  async generatePDF(invoice) {
    const invoicesDir = getInvoicesDir();
    const filename = `${invoice.invoice_number}.txt`; // Simple text format for now
    const filepath = path.join(invoicesDir, filename);

    const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A';
    const issueDate = new Date(invoice.created_at).toLocaleDateString();

    const content = `
========================================
           INVOICE
========================================

Invoice Number: ${invoice.invoice_number}
Issue Date:     ${issueDate}
Due Date:       ${dueDate}

----------------------------------------
BILL TO:
${invoice.client_name}

----------------------------------------
DESCRIPTION:

Professional Services

----------------------------------------
AMOUNT DUE:     ${invoice.currency} ${parseFloat(invoice.amount).toFixed(2)}
----------------------------------------

Payment Terms: Net 30 days
Status: ${invoice.status.toUpperCase()}

Please remit payment to the account details
provided separately.

Thank you for your business!

========================================
`;

    fs.writeFileSync(filepath, content.trim(), 'utf-8');
    return filepath;
  }
}

module.exports = InvoicesSkill;
