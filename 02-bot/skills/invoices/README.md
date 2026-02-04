# Invoice Management Skill

A comprehensive invoice management system for ClawdBot that handles invoice creation, status tracking, PDF generation, and payment tracking.

## Features

- Automatic invoice numbering (INV-YYYYMM-NNN format)
- Draft, sent, and paid status tracking
- PDF invoice generation (text format)
- 30-day default payment terms
- Multi-currency support (default: GBP)
- Integration with outcome tracker for intelligence
- SQLite persistence

## Commands

### Create Invoice
```
invoice create <client> <amount> [currency]
```
Creates a new invoice in draft status with automatic invoice number generation.

**Examples:**
- `invoice create "Acme Corp" 1500`
- `invoice create "John Smith" 2500.50 GBP`
- `invoice create ClientName 1000 USD`

**Response:**
```
✓ Invoice created: INV-202602-001
Client: Acme Corp
Amount: GBP 1500.00
Status: Draft
Due: 2026-03-06

Use "invoice send INV-202602-001" to mark as sent and generate PDF.
```

### List Invoices
```
invoice list [status]
```
Lists invoices, optionally filtered by status (draft, sent, paid).

**Examples:**
- `invoice list` - Show all invoices
- `invoice list draft` - Show only draft invoices
- `invoice list sent` - Show sent invoices
- `invoice list paid` - Show paid invoices

**Response:**
```
*Invoices*

*DRAFT*
• INV-202602-001 - Acme Corp
  GBP 1500.00 | Due: 06/03/2026

*SENT*
• INV-202602-002 - John Smith
  GBP 2500.50 | Due: 07/03/2026

Total: 2 invoice(s) | GBP 4000.50
```

### Send Invoice
```
invoice send <id|number>
```
Marks an invoice as sent and generates a PDF file.

**Examples:**
- `invoice send INV-202602-001`
- `invoice send 1`

**Response:**
```
✓ Invoice sent: INV-202602-001
Client: Acme Corp
Amount: GBP 1500.00
PDF: /opt/clawd-bot/data/invoices/INV-202602-001.txt
Sent: 04/02/2026, 18:00:00

Use "invoice paid INV-202602-001" when payment is received.
```

### Check Status
```
invoice status <id|number>
```
Shows detailed information about an invoice.

**Examples:**
- `invoice status INV-202602-001`
- `invoice status 1`

**Response:**
```
*Invoice INV-202602-001*

Client: Acme Corp
Amount: GBP 1500.00
Status: sent
Due: 06/03/2026
Created: 04/02/2026, 17:30:00
Sent: 04/02/2026, 18:00:00
Paid: Not paid
PDF: /opt/clawd-bot/data/invoices/INV-202602-001.txt
```

### Mark as Paid
```
invoice paid <id|number>
```
Marks an invoice as paid with automatic timestamp.

**Examples:**
- `invoice paid INV-202602-001`
- `invoice paid 1`

**Response:**
```
✓ Invoice marked as paid: INV-202602-001
Client: Acme Corp
Amount: GBP 1500.00
Paid: 04/02/2026, 19:00:00
```

### Delete Invoice
```
invoice delete <id|number>
```
Permanently deletes an invoice and its PDF file.

**Examples:**
- `invoice delete INV-202602-001`
- `invoice delete 1`

**Response:**
```
✓ Invoice deleted: INV-202602-001
Client: Acme Corp
Amount: GBP 1500.00
```

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'GBP',
  status TEXT DEFAULT 'draft',
  due_date DATE,
  pdf_path TEXT,
  sent_at DATETIME,
  paid_at DATETIME,
  user_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Invoice Number Format

Format: `INV-YYYYMM-NNN`

- `INV` - Prefix
- `YYYYMM` - Year and month (e.g., 202602 for February 2026)
- `NNN` - Sequential number within the month (001, 002, etc.)

Examples:
- `INV-202602-001` - First invoice in February 2026
- `INV-202603-015` - Fifteenth invoice in March 2026

## PDF Generation

Invoices are stored as text files in:
- EC2: `/opt/clawd-bot/data/invoices/`
- Local: `data/invoices/`

PDF format includes:
- Invoice number and dates
- Client name
- Amount and currency
- Payment terms (Net 30 days)
- Status

## Integration

### Outcome Tracker
All invoice actions are tracked:
- `invoice_create` - Invoice creation
- `invoice_send` - Marking as sent
- `invoice_paid` - Payment confirmation
- `invoice_delete` - Invoice deletion

### Context Engine
Invoice data is available to the AI for:
- Payment reminders
- Financial reporting
- Client history
- Outstanding invoices

## Configuration

In `skills/skills.json`:

```json
{
  "enabled": ["invoices"],
  "config": {
    "invoices": {
      "defaultDueDays": 30,
      "defaultCurrency": "GBP",
      "pdfFormat": "text"
    }
  }
}
```

## Testing

Run the test suite:

```bash
cd 02-bot
node skills/invoices/test-invoices.js
```

## Future Enhancements

- Email integration (send invoices to clients)
- Xero API integration for accounting sync
- PDF generation with actual PDF library (vs text)
- Recurring invoices
- Payment gateway integration
- Multi-line items per invoice
- Tax calculation
- Invoice templates
- Overdue payment alerts

## Error Handling

The skill provides detailed error messages with suggestions:

```
✗ Invoice not found
  Suggestion: Check the invoice number or ID

✗ Invalid amount
  Suggestion: Amount must be a positive number

✗ Failed to create invoice
  Reason: Database error
```

## Permissions

- Users can only access their own invoices
- Invoice numbers are unique across all users
- All operations require authentication

## Support

For issues or questions:
- Check logs: `pm2 logs clawd-bot`
- Run tests: `node skills/invoices/test-invoices.js`
- Database path: `data/clawdbot.db`
