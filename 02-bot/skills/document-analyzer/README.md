# Document Analyzer Skill

Analyzes PDF documents using Claude Opus and pdf-parse for text extraction.

## Features

- **Automatic PDF Analysis**: Automatically analyzes PDF documents sent to the bot
- **Structured Data Extraction**: Extracts key information like parties, dates, amounts, terms, action items
- **Intelligent Summarization**: Provides concise 2-3 sentence summaries using Claude Opus
- **Question Answering**: Users can ask specific questions about uploaded documents
- **Analysis History**: Stores all analyses in SQLite database with full search capability
- **Outcome Tracking**: Integrates with outcome tracker for monitoring and learning

## Commands

| Command | Description | Example |
|---------|-------------|---------|
| [PDF document] | Automatically analyze uploaded PDF | Send any PDF file |
| `analyze summary` | Get summary of last analyzed document | `analyze summary` |
| `analyze extract <fields>` | Extract specific data fields | `analyze extract dates, parties` |
| `analyze list` | List recent analyzed documents | `analyze list` |
| `analyze document` | Prompt to send a PDF | `analyze document` |

## Usage Examples

### Basic PDF Analysis
```
[User sends contract.pdf]
→ ✓ Document analyzed: contract.pdf

2-page service agreement between Acme Corp and John Doe for software development services
starting January 2024 with monthly payments of $5,000.

*Key Data Extracted:*
• parties: Acme Corp, John Doe
• dates: 2024-01-15, 2024-12-31
• amounts: $5,000/month
• terms: 12 months, renewable
• action_items: Submit invoices monthly, Quarterly reviews
```

### Question-Based Analysis
```
[User sends invoice.pdf with message: "what is the total amount?"]
→ ✓ Document analyzed: invoice.pdf

The total amount on this invoice is $12,450.00 including $450 in taxes.
```

### Retrieve Last Analysis
```
User: analyze summary
→ ✓ Last analyzed: contract.pdf

2-page service agreement between Acme Corp and John Doe...
```

### Extract Specific Fields
```
User: analyze extract dates, amounts
→ *Extracted data from contract.pdf:*

• dates: 2024-01-15, 2024-12-31
• amounts: $5,000/month
```

### List Recent Analyses
```
User: analyze list
→ *Recent analyzed documents:*

1. contract.pdf (2024-02-04)
   2-page service agreement between Acme Corp and John Doe...

2. invoice-2401.pdf (2024-02-03)
   Invoice for January 2024 services rendered totaling $5,000...

3. proposal.pdf (2024-02-02)
   Project proposal for new mobile application development...
```

## Technical Implementation

### PDF Processing Pipeline

1. **Download**: Downloads PDF from Telegram file URL using axios
2. **Parse**: Extracts text using pdf-parse library
3. **Analyze**: Sends text to Claude Opus with intelligent prompts
4. **Extract**: Uses structured prompts to extract JSON data
5. **Store**: Saves summary and extracted data to SQLite
6. **Track**: Records outcome for learning and monitoring

### Data Extraction

The skill extracts structured data in JSON format:

```json
{
  "parties": ["Company A", "Company B", "John Doe"],
  "dates": ["2024-01-15", "2024-12-31"],
  "amounts": ["$5,000/month", "$60,000 total"],
  "terms": ["12 months", "renewable annually"],
  "action_items": [
    "Submit invoices monthly",
    "Quarterly performance reviews",
    "30-day termination notice required"
  ]
}
```

### Database Schema

```sql
CREATE TABLE document_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  file_path TEXT,
  summary TEXT,
  extracted_data TEXT,      -- JSON string
  user_id TEXT NOT NULL,
  chat_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### AI Model

- **Primary**: Claude Opus 4 (`claude-opus-4-20250514`) for best analysis quality
- **Max Tokens**: 2000 for response
- **Max Input**: ~45k tokens (~180k characters)
- **Truncation**: Automatically truncates very long documents

## Configuration

Located in `skills/skills.json`:

```json
"document-analyzer": {
  "maxFileSizeMB": 50,
  "analysisModel": "opus"
}
```

## Priority

**Priority: 21** - Higher than general file handling (20) to catch PDFs before generic file skills.

Lower than receipts skill (30) so receipt images are handled by receipt-specific logic first.

## Integration Points

### Database (`lib/database.js`)
- `saveDocumentAnalysis(userId, chatId, data)` - Save analysis
- `getDocumentAnalysis(id)` - Get full analysis by ID
- `getDocumentAnalyses(userId, limit)` - Get user's analyses
- `getDocumentAnalysesByChat(chatId, limit)` - Get chat analyses

### Outcome Tracker (`lib/outcome-tracker.js`)
- `startAction()` - Records analysis start
- `completeAction()` - Records success/failure
- Action type: `document_analysis`

### Telegram Handler
- Detects PDF documents via `mediaContentType === 'application/pdf'`
- Downloads PDF from Telegram file URL
- Passes to skill with full context

## Error Handling

The skill handles various error scenarios:

- **No Text Extracted**: Returns error if PDF is image-based or corrupted
- **Download Failed**: Catches network errors, suggests retry
- **Rate Limits**: Detects Claude API rate limits, asks user to wait
- **Database Unavailable**: Gracefully degrades, still provides analysis
- **Large Files**: Enforces 50MB limit via axios config

## Voice Integration

Can be triggered via voice commands:
- "Analyze this contract" → Prompts to send PDF
- [Voice note + PDF] → "Summarize this document" → Auto-analyzes

## Future Enhancements

- Multi-page image PDF support (OCR via Claude Vision)
- Comparative analysis (compare two contracts)
- Template extraction (identify contract types)
- Automatic deadline tracking from extracted dates
- Integration with accountancy skills for financial docs
- Support for Word documents (.docx)
- Batch processing multiple PDFs

## Dependencies

- `pdf-parse: ^1.1.1` - PDF text extraction
- `@anthropic-ai/sdk` - Claude API client
- `axios` - HTTP client for downloads
- `better-sqlite3` - Database persistence

## Testing

To test the skill:

1. Send a PDF document via Telegram
2. Verify analysis response with summary and extracted data
3. Test `analyze summary` command
4. Test `analyze extract dates, parties` command
5. Test `analyze list` command
6. Check database entries in `document_analyses` table

## Deployment Notes

- Requires `npm install` on EC2 after adding pdf-parse
- Database table auto-created on first init
- No additional environment variables needed (uses existing ANTHROPIC_API_KEY)
- Works with both Telegram and WhatsApp platforms
