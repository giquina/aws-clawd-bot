/**
 * Document Analyzer Skill - Analyze PDF documents using Claude Opus
 *
 * Extracts text from PDF documents, analyzes content, and extracts structured data.
 * Uses Claude Opus for comprehensive document analysis with intelligent data extraction.
 *
 * Commands:
 *   [PDF document]                  - Automatically analyze uploaded PDFs
 *   analyze summary                 - Get summary of last analyzed document
 *   analyze extract <fields>        - Extract specific data fields from last document
 *   analyze list                    - List recent analyzed documents
 *
 * @example
 * [User sends PDF contract]
 * -> "Document analyzed: 5-page contract. Key details: parties, dates, amounts extracted..."
 *
 * [User: "analyze extract dates, parties"]
 * -> "Extracted dates: 2024-01-15, 2024-12-31. Parties: Acme Corp, John Doe..."
 */
const BaseSkill = require('../base-skill');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

class DocumentAnalyzerSkill extends BaseSkill {
  name = 'document-analyzer';
  description = 'Analyze PDF documents and extract structured data using AI';
  priority = 21; // Higher than general file handling

  commands = [
    {
      pattern: /^analyze\s+(summary|last)$/i,
      description: 'Get summary of last analyzed document',
      usage: 'analyze summary'
    },
    {
      pattern: /^analyze\s+extract\s+(.+)$/i,
      description: 'Extract specific data fields from last document',
      usage: 'analyze extract dates, parties, amounts'
    },
    {
      pattern: /^analyze\s+list$/i,
      description: 'List recent analyzed documents',
      usage: 'analyze list'
    },
    {
      pattern: /^(analyze|summarize)\s+(document|pdf|contract|file)$/i,
      description: 'Prompt to send a PDF document',
      usage: 'analyze document'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.claude = null;
    this.db = null;
    this.outcomeTracker = null;
  }

  /**
   * Initialize Claude client and database
   */
  initClient() {
    if (!this.claude && process.env.ANTHROPIC_API_KEY) {
      this.claude = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }

    if (!this.db) {
      try {
        this.db = require('../../lib/database');
      } catch (e) {
        this.log('warn', 'Database not available');
      }
    }

    if (!this.outcomeTracker) {
      try {
        this.outcomeTracker = require('../../lib/outcome-tracker');
      } catch (e) {
        this.log('warn', 'Outcome tracker not available');
      }
    }

    return this.claude;
  }

  /**
   * Check if this skill can handle the command
   * Handles PDF documents sent via Telegram
   */
  canHandle(command, context = {}) {
    // Check text commands first
    if (super.canHandle(command)) {
      return true;
    }

    // Check if there's a document message with PDF
    if (context.mediaUrl && context.mediaContentType) {
      if (context.mediaContentType === 'application/pdf') {
        return true;
      }
    }

    // Check for PDF filename
    if (context.fileName && context.fileName.toLowerCase().endsWith('.pdf')) {
      return true;
    }

    return false;
  }

  /**
   * Execute the command
   */
  async execute(command, context) {
    const { userId, chatId, mediaUrl, mediaContentType, fileName } = context;

    // Initialize clients
    this.initClient();

    // Check for PDF document message
    const hasPDF = mediaUrl && (
      mediaContentType === 'application/pdf' ||
      (fileName && fileName.toLowerCase().endsWith('.pdf'))
    );

    if (hasPDF) {
      return await this.handlePDFAnalysis(command, context);
    }

    // Handle text-only commands
    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // analyze summary / analyze last
    if (/^analyze\s+(summary|last)$/i.test(lowerCommand)) {
      return await this.getLastAnalysisSummary(userId);
    }

    // analyze extract <fields>
    const extractMatch = lowerCommand.match(/^analyze\s+extract\s+(.+)$/i);
    if (extractMatch) {
      const fields = extractMatch[1];
      return await this.extractFieldsFromLast(userId, fields);
    }

    // analyze list
    if (/^analyze\s+list$/i.test(lowerCommand)) {
      return await this.listRecentAnalyses(userId);
    }

    // Generic prompt to send document
    if (/^(analyze|summarize)\s+(document|pdf|contract|file)$/i.test(lowerCommand)) {
      return this.success(
        'Send me a PDF document and I\'ll analyze it.\n\n' +
        'I can extract:\n' +
        '- Key parties and contacts\n' +
        '- Important dates\n' +
        '- Financial amounts\n' +
        '- Terms and conditions\n' +
        '- Action items'
      );
    }

    return this.error('Send me a PDF document to analyze.');
  }

  /**
   * Handle PDF document analysis
   */
  async handlePDFAnalysis(command, context) {
    const { userId, chatId, mediaUrl, fileName } = context;
    const userQuestion = command ? command.trim() : '';

    this.log('info', `Analyzing PDF for user ${userId}: ${fileName || 'unnamed.pdf'}`);

    // Start outcome tracking
    let outcomeId = null;
    if (this.outcomeTracker) {
      outcomeId = this.outcomeTracker.startAction({
        chatId: String(chatId),
        userId: String(userId),
        actionType: 'document_analysis',
        actionDetail: `Analyzing PDF: ${fileName || 'document'}`
      });
    }

    try {
      const client = this.initClient();
      if (!client) {
        if (outcomeId && this.outcomeTracker) {
          this.outcomeTracker.completeAction(outcomeId, 'failed', 'AI service not configured');
        }
        return this.error('AI service not configured. Cannot analyze document.');
      }

      // Download the PDF
      const pdfBuffer = await this.downloadPDF(mediaUrl);

      // Parse PDF to extract text
      const pdfText = await this.parsePDF(pdfBuffer);

      if (!pdfText || pdfText.length < 50) {
        if (outcomeId && this.outcomeTracker) {
          this.outcomeTracker.completeAction(outcomeId, 'failed', 'Could not extract text from PDF');
        }
        return this.error('Could not extract text from PDF. The document may be image-based or corrupted.');
      }

      // Analyze with Claude Opus
      const analysis = await this.analyzeDocument(pdfText, fileName, userQuestion);

      // Save to database
      if (this.db && this.db.saveDocumentAnalysis) {
        try {
          this.db.saveDocumentAnalysis(String(userId), String(chatId), {
            filename: fileName || 'document.pdf',
            summary: analysis.summary,
            extractedData: JSON.stringify(analysis.extractedData)
          });
        } catch (dbErr) {
          this.log('warn', 'Failed to save analysis to database', dbErr);
        }
      }

      // Complete outcome tracking
      if (outcomeId && this.outcomeTracker) {
        this.outcomeTracker.completeAction(outcomeId, 'success', 'Document analyzed successfully');
      }

      // Format response
      let response = `✓ Document analyzed: ${fileName || 'document.pdf'}\n\n`;
      response += `${analysis.summary}\n\n`;

      if (analysis.extractedData && Object.keys(analysis.extractedData).length > 0) {
        response += `*Key Data Extracted:*\n`;
        for (const [key, value] of Object.entries(analysis.extractedData)) {
          if (value && value.length > 0) {
            const displayValue = Array.isArray(value) ? value.join(', ') : value;
            response += `• ${key}: ${displayValue}\n`;
          }
        }
      }

      return this.success(response);

    } catch (error) {
      this.log('error', 'PDF analysis failed', error);

      // Complete outcome tracking with failure
      if (outcomeId && this.outcomeTracker) {
        this.outcomeTracker.completeAction(outcomeId, 'failed', error.message);
      }

      // Handle specific error cases
      if (error.message && error.message.includes('rate limit')) {
        return this.error('Too many requests. Please wait a moment and try again.');
      }

      if (error.message && error.message.includes('download')) {
        return this.error('Could not download the PDF. Please try sending it again.');
      }

      return this.error(`Failed to analyze document: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Download PDF from URL
   */
  async downloadPDF(url) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024 // 50MB max
      });
      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`PDF download failed: ${error.message}`);
    }
  }

  /**
   * Parse PDF to extract text using pdf-parse
   */
  async parsePDF(pdfBuffer) {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(pdfBuffer);
      return data.text;
    } catch (error) {
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  /**
   * Analyze document text with Claude Opus
   */
  async analyzeDocument(text, filename, userQuestion = '') {
    // Truncate text if too long (Claude has token limits)
    const maxChars = 180000; // ~45k tokens
    const truncatedText = text.length > maxChars ? text.substring(0, maxChars) + '\n\n[Document truncated...]' : text;

    let prompt;
    if (userQuestion && userQuestion.length > 0) {
      // User has a specific question
      prompt = `Analyze this document and answer the user's question: "${userQuestion}"

Document: ${filename}

Content:
${truncatedText}

Provide a clear, concise answer to the user's question based on the document content.`;
    } else {
      // General analysis with structured data extraction
      prompt = `Analyze this document comprehensively and extract key information.

Document: ${filename}

Content:
${truncatedText}

Provide:
1. A 2-3 sentence summary of the document
2. Extract structured data in JSON format for these fields (if present):
   - parties: array of involved parties/companies/people
   - dates: array of important dates (format: YYYY-MM-DD)
   - amounts: array of financial amounts with currency
   - terms: key terms or durations
   - action_items: things that need to be done

Format your response as:
SUMMARY: [your summary]

DATA:
{json object with extracted fields}`;
    }

    const response = await this.claude.messages.create({
      model: 'claude-opus-4-20250514', // Using Opus for best analysis
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const responseText = response.content[0].text.trim();

    // Parse response to extract summary and structured data
    if (userQuestion) {
      // For question-based analysis, return as summary
      return {
        summary: responseText,
        extractedData: {}
      };
    }

    // Parse structured response
    const summaryMatch = responseText.match(/SUMMARY:\s*(.+?)(?=\n\nDATA:|$)/s);
    const dataMatch = responseText.match(/DATA:\s*(\{[\s\S]+\})/);

    let summary = summaryMatch ? summaryMatch[1].trim() : responseText;
    let extractedData = {};

    if (dataMatch) {
      try {
        extractedData = JSON.parse(dataMatch[1]);
      } catch (e) {
        this.log('warn', 'Failed to parse extracted data JSON', e);
      }
    }

    return { summary, extractedData };
  }

  /**
   * Get summary of last analyzed document
   */
  async getLastAnalysisSummary(userId) {
    if (!this.db || !this.db.getDocumentAnalyses) {
      return this.error('Database not available.');
    }

    const analyses = this.db.getDocumentAnalyses(String(userId), 1);
    if (analyses.length === 0) {
      return this.error('No documents analyzed yet. Send me a PDF to analyze.');
    }

    const last = analyses[0];
    return this.success(`Last analyzed: ${last.filename}\n\n${last.summary}`);
  }

  /**
   * Extract specific fields from last analyzed document
   */
  async extractFieldsFromLast(userId, fields) {
    if (!this.db || !this.db.getDocumentAnalyses) {
      return this.error('Database not available.');
    }

    const analyses = this.db.getDocumentAnalyses(String(userId), 1);
    if (analyses.length === 0) {
      return this.error('No documents analyzed yet. Send me a PDF to analyze first.');
    }

    const last = analyses[0];
    const fullAnalysis = this.db.getDocumentAnalysis(last.id);

    if (!fullAnalysis || !fullAnalysis.extracted_data) {
      return this.error('No extracted data available for this document.');
    }

    const extractedData = JSON.parse(fullAnalysis.extracted_data);
    const requestedFields = fields.split(',').map(f => f.trim().toLowerCase());

    let response = `*Extracted data from ${fullAnalysis.filename}:*\n\n`;

    for (const field of requestedFields) {
      const key = Object.keys(extractedData).find(k => k.toLowerCase().includes(field));
      if (key && extractedData[key]) {
        const value = Array.isArray(extractedData[key])
          ? extractedData[key].join(', ')
          : extractedData[key];
        response += `• ${key}: ${value}\n`;
      } else {
        response += `• ${field}: Not found\n`;
      }
    }

    return this.success(response);
  }

  /**
   * List recent analyzed documents
   */
  async listRecentAnalyses(userId) {
    if (!this.db || !this.db.getDocumentAnalyses) {
      return this.error('Database not available.');
    }

    const analyses = this.db.getDocumentAnalyses(String(userId), 10);
    if (analyses.length === 0) {
      return this.error('No documents analyzed yet.');
    }

    let response = `*Recent analyzed documents:*\n\n`;
    analyses.forEach((doc, i) => {
      const date = new Date(doc.created_at).toLocaleDateString();
      response += `${i + 1}. ${doc.filename} (${date})\n`;
      if (doc.summary) {
        const shortSummary = doc.summary.length > 60
          ? doc.summary.substring(0, 60) + '...'
          : doc.summary;
        response += `   ${shortSummary}\n`;
      }
      response += '\n';
    });

    return this.success(response);
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();
    this.initClient();
    this.log('info', 'Document analyzer skill ready');
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      provider: 'Claude Opus + pdf-parse',
      capabilities: ['pdf_analysis', 'data_extraction', 'document_summary']
    };
  }
}

module.exports = DocumentAnalyzerSkill;
