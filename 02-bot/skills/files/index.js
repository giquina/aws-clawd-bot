/**
 * Files Skill - Document/file handling for WhatsApp uploads
 *
 * Handles document uploads via WhatsApp including PDFs, Word docs, etc.
 * For PDFs: extracts text and provides AI-powered summary.
 * For other files: acknowledges receipt and explains options.
 *
 * Commands:
 *   [document message]    - Detect file, process accordingly
 *   my files              - List recently received files
 *
 * @example
 * [User sends PDF]
 * -> Extracts text, summarizes content
 *
 * [User sends .docx]
 * -> Acknowledges receipt, explains options
 */
const BaseSkill = require('../base-skill');
const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Path to files data
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILES_FILE = path.join(DATA_DIR, 'files.json');

// Supported document MIME types
const DOCUMENT_TYPES = {
  'application/pdf': { name: 'PDF', canExtract: true },
  'application/msword': { name: 'Word Document (.doc)', canExtract: false },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { name: 'Word Document (.docx)', canExtract: false },
  'application/vnd.ms-excel': { name: 'Excel Spreadsheet (.xls)', canExtract: false },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { name: 'Excel Spreadsheet (.xlsx)', canExtract: false },
  'application/vnd.ms-powerpoint': { name: 'PowerPoint (.ppt)', canExtract: false },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { name: 'PowerPoint (.pptx)', canExtract: false },
  'text/plain': { name: 'Text File', canExtract: true },
  'text/csv': { name: 'CSV File', canExtract: true },
  'application/json': { name: 'JSON File', canExtract: true },
  'application/xml': { name: 'XML File', canExtract: true },
  'text/xml': { name: 'XML File', canExtract: true },
  'application/zip': { name: 'ZIP Archive', canExtract: false },
  'application/x-rar-compressed': { name: 'RAR Archive', canExtract: false }
};

class FilesSkill extends BaseSkill {
  name = 'files';
  description = 'Handle document and file uploads via WhatsApp';
  priority = 15; // Catch-all for remaining media types (lower than receipts=30, voice=99)

  commands = [
    {
      pattern: /^(my files|list files|files)$/i,
      description: 'List recently received files',
      usage: 'my files'
    },
    {
      pattern: /^file #?(\d+)$/i,
      description: 'View details of a specific file',
      usage: 'file #<id>'
    },
    {
      pattern: /^delete file #?(\d+)$/i,
      description: 'Delete a file record',
      usage: 'delete file #<id>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.claude = null;
    this.pdfParser = null;
    this.ensureDataDirectory();
  }

  /**
   * Ensure the data directory exists
   */
  ensureDataDirectory() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        this.log('info', `Created data directory: ${DATA_DIR}`);
      }
      if (!fs.existsSync(FILES_FILE)) {
        fs.writeFileSync(FILES_FILE, JSON.stringify({ files: [], nextId: 1 }, null, 2));
        this.log('info', `Created files file: ${FILES_FILE}`);
      }
    } catch (error) {
      this.log('error', 'Failed to create data directory', error);
    }
  }

  /**
   * Load files from JSON file
   * @returns {{files: Array, nextId: number}}
   */
  loadFiles() {
    try {
      this.ensureDataDirectory();
      const data = fs.readFileSync(FILES_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      this.log('error', 'Failed to load files, returning empty', error);
      return { files: [], nextId: 1 };
    }
  }

  /**
   * Save files to JSON file
   * @param {{files: Array, nextId: number}} data
   */
  saveFiles(data) {
    try {
      this.ensureDataDirectory();
      fs.writeFileSync(FILES_FILE, JSON.stringify(data, null, 2));
      this.log('info', `Saved ${data.files.length} files to file`);
    } catch (error) {
      this.log('error', 'Failed to save files', error);
      throw error;
    }
  }

  /**
   * Add a file record to storage
   * @param {Object} fileData - File data to store
   * @returns {number} - The ID of the saved file
   */
  addFile(fileData) {
    const data = this.loadFiles();
    const id = data.nextId;

    const fileRecord = {
      id,
      filename: fileData.filename || 'Unknown',
      contentType: fileData.contentType || 'application/octet-stream',
      typeName: fileData.typeName || 'Unknown File',
      size: fileData.size || 0,
      summary: fileData.summary || null,
      extractedText: fileData.extractedText ? fileData.extractedText.substring(0, 5000) : null, // Limit stored text
      mediaUrl: fileData.mediaUrl || null,
      receivedAt: new Date().toISOString()
    };

    data.files.push(fileRecord);
    data.nextId = id + 1;
    this.saveFiles(data);

    return id;
  }

  /**
   * Get file by ID
   * @param {number} id
   * @returns {Object|null}
   */
  getFile(id) {
    const data = this.loadFiles();
    return data.files.find(f => f.id === id) || null;
  }

  /**
   * Delete a file record
   * @param {number} id
   * @returns {Object|null}
   */
  deleteFile(id) {
    const data = this.loadFiles();
    const index = data.files.findIndex(f => f.id === id);
    if (index === -1) return null;
    const deleted = data.files.splice(index, 1)[0];
    this.saveFiles(data);
    return deleted;
  }

  /**
   * Get recent files
   * @param {number} limit
   * @returns {Array}
   */
  getRecentFiles(limit = 10) {
    const data = this.loadFiles();
    return data.files
      .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
      .slice(0, limit);
  }

  /**
   * Initialize Claude client
   */
  initClient() {
    if (!this.claude && process.env.ANTHROPIC_API_KEY) {
      this.claude = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }
    return this.claude;
  }

  /**
   * Check if this skill can handle the command
   * Override to check for document messages
   */
  canHandle(command, context = {}) {
    // Check text commands first
    if (super.canHandle(command, context)) {
      return true;
    }

    // Check if there's a document/file (not image, not audio - those are handled by receipts/voice)
    if (context.mediaContentType) {
      const contentType = context.mediaContentType.toLowerCase();

      // Skip images (handled by receipts skill)
      if (contentType.startsWith('image/')) {
        return false;
      }

      // Skip audio (handled by voice skill)
      if (contentType.startsWith('audio/')) {
        return false;
      }

      // Handle documents and other file types
      if (contentType.startsWith('application/') ||
          contentType.startsWith('text/') ||
          DOCUMENT_TYPES[contentType]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Execute the command
   */
  async execute(command, context) {
    const { userId, mediaUrl, mediaContentType } = context;

    // Check for document message first
    if (mediaUrl && mediaContentType && this.isDocumentType(mediaContentType)) {
      return await this.handleDocumentMessage(context);
    }

    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Handle text commands
    if (/^(my files|list files|files)$/i.test(lowerCommand)) {
      return await this.handleListFilesCommand(userId);
    }

    const fileMatch = lowerCommand.match(/^file #?(\d+)$/i);
    if (fileMatch) {
      return await this.handleViewFileCommand(userId, parseInt(fileMatch[1]));
    }

    const deleteMatch = lowerCommand.match(/^delete file #?(\d+)$/i);
    if (deleteMatch) {
      return await this.handleDeleteFileCommand(userId, parseInt(deleteMatch[1]));
    }

    return this.error('Unknown files command. Try "my files" or send a document.');
  }

  /**
   * Check if content type is a document we handle
   */
  isDocumentType(contentType) {
    if (!contentType) return false;
    const ct = contentType.toLowerCase();
    return ct.startsWith('application/') ||
           ct.startsWith('text/') ||
           !!DOCUMENT_TYPES[ct];
  }

  /**
   * Handle incoming document message
   */
  async handleDocumentMessage(context) {
    const { userId, mediaUrl, mediaContentType } = context;
    const contentType = mediaContentType.toLowerCase();
    const typeInfo = DOCUMENT_TYPES[contentType] || { name: 'Document', canExtract: false };

    this.log('info', `Processing document for user ${userId}: ${contentType}`);

    try {
      // Download the file
      const fileBuffer = await this.downloadFile(mediaUrl);
      const fileSize = fileBuffer.length;

      // Check if it's a PDF we can extract text from
      if (contentType === 'application/pdf') {
        return await this.handlePdfDocument(userId, mediaUrl, fileBuffer, fileSize);
      }

      // Check if it's a text-based file we can read
      if (contentType.startsWith('text/') ||
          contentType === 'application/json' ||
          contentType === 'application/xml') {
        return await this.handleTextDocument(userId, mediaUrl, fileBuffer, contentType, typeInfo, fileSize);
      }

      // For other document types, just acknowledge and store reference
      return await this.handleOtherDocument(userId, mediaUrl, contentType, typeInfo, fileSize);

    } catch (error) {
      this.log('error', 'Document processing failed', error);
      return this.error(`Failed to process document: ${error.message}`);
    }
  }

  /**
   * Handle PDF document - extract text and summarize
   */
  async handlePdfDocument(userId, mediaUrl, fileBuffer, fileSize) {
    try {
      // Try to extract text using pdf-parse
      let extractedText = '';
      let pageCount = 0;

      try {
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(fileBuffer);
        extractedText = pdfData.text || '';
        pageCount = pdfData.numpages || 0;
      } catch (pdfError) {
        this.log('warn', 'pdf-parse not available or failed, trying basic extraction', pdfError);
        // Fallback: just note that we received a PDF but can't extract
        extractedText = '';
      }

      if (!extractedText || extractedText.trim().length < 50) {
        // Could not extract meaningful text
        const fileId = this.addFile({
          filename: 'document.pdf',
          contentType: 'application/pdf',
          typeName: 'PDF Document',
          size: fileSize,
          summary: 'Unable to extract text (scanned/image-based PDF)',
          extractedText: null,
          mediaUrl
        });

        return this.success(
          `*PDF Received* (File #${fileId})\n\n` +
          `Size: ${this.formatSize(fileSize)}\n` +
          `Pages: ${pageCount || 'Unknown'}\n\n` +
          `Could not extract text - this appears to be a scanned or image-based PDF.\n\n` +
          `_Use "my files" to see all received files_`
        );
      }

      // Summarize using Claude
      const summary = await this.summarizeText(extractedText);

      // Store file record
      const fileId = this.addFile({
        filename: 'document.pdf',
        contentType: 'application/pdf',
        typeName: 'PDF Document',
        size: fileSize,
        summary,
        extractedText: extractedText.substring(0, 5000),
        mediaUrl
      });

      // Format response
      let response = `*PDF Received* (File #${fileId})\n\n`;
      response += `Size: ${this.formatSize(fileSize)}`;
      if (pageCount) response += ` | ${pageCount} pages`;
      response += `\n\n`;
      response += `*Summary:*\n${summary}\n\n`;
      response += `_Use "file #${fileId}" for details or "my files" to see all_`;

      return this.success(response);

    } catch (error) {
      this.log('error', 'PDF processing failed', error);

      // Still store the file reference even if we couldn't process it
      const fileId = this.addFile({
        filename: 'document.pdf',
        contentType: 'application/pdf',
        typeName: 'PDF Document',
        size: fileSize,
        summary: `Processing failed: ${error.message}`,
        extractedText: null,
        mediaUrl
      });

      return this.success(
        `*PDF Received* (File #${fileId})\n\n` +
        `Size: ${this.formatSize(fileSize)}\n\n` +
        `Could not process this PDF: ${error.message}\n\n` +
        `_File saved - use "my files" to see all_`
      );
    }
  }

  /**
   * Handle text-based documents (txt, json, csv, xml)
   */
  async handleTextDocument(userId, mediaUrl, fileBuffer, contentType, typeInfo, fileSize) {
    try {
      const text = fileBuffer.toString('utf8');

      // For small files, just show the content
      if (text.length < 500) {
        const fileId = this.addFile({
          filename: `document.${this.getExtension(contentType)}`,
          contentType,
          typeName: typeInfo.name,
          size: fileSize,
          summary: 'Full content stored',
          extractedText: text,
          mediaUrl
        });

        return this.success(
          `*${typeInfo.name} Received* (File #${fileId})\n\n` +
          `Size: ${this.formatSize(fileSize)}\n\n` +
          `*Content:*\n\`\`\`\n${text.substring(0, 400)}\n\`\`\`\n\n` +
          `_Use "file #${fileId}" for full details_`
        );
      }

      // For larger files, summarize
      const summary = await this.summarizeText(text);

      const fileId = this.addFile({
        filename: `document.${this.getExtension(contentType)}`,
        contentType,
        typeName: typeInfo.name,
        size: fileSize,
        summary,
        extractedText: text.substring(0, 5000),
        mediaUrl
      });

      return this.success(
        `*${typeInfo.name} Received* (File #${fileId})\n\n` +
        `Size: ${this.formatSize(fileSize)}\n\n` +
        `*Summary:*\n${summary}\n\n` +
        `_Use "file #${fileId}" for details_`
      );

    } catch (error) {
      this.log('error', 'Text document processing failed', error);
      return this.error(`Failed to process document: ${error.message}`);
    }
  }

  /**
   * Handle other document types (Word, Excel, etc.)
   */
  async handleOtherDocument(userId, mediaUrl, contentType, typeInfo, fileSize) {
    const fileId = this.addFile({
      filename: `document.${this.getExtension(contentType)}`,
      contentType,
      typeName: typeInfo.name,
      size: fileSize,
      summary: 'Document received - text extraction not supported for this format',
      extractedText: null,
      mediaUrl
    });

    let response = `*${typeInfo.name} Received* (File #${fileId})\n\n`;
    response += `Size: ${this.formatSize(fileSize)}\n\n`;

    if (!typeInfo.canExtract) {
      response += `I can't extract text from ${typeInfo.name} files directly.\n\n`;
      response += `*Options:*\n`;
      response += `- Convert to PDF for text extraction\n`;
      response += `- Copy/paste the text in chat\n`;
      response += `- Export as .txt or .csv\n\n`;
    }

    response += `_File logged - use "my files" to see all_`;

    return this.success(response);
  }

  /**
   * Summarize text using Claude
   */
  async summarizeText(text) {
    const client = this.initClient();
    if (!client) {
      return 'AI service not available for summarization.';
    }

    try {
      // Limit text length for API call
      const truncatedText = text.substring(0, 15000);

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Summarize this document in 2-3 concise sentences. Focus on the main topic, key points, and any important details. Be brief and direct.\n\n---\n\n${truncatedText}`
        }]
      });

      return response.content[0].text.trim();
    } catch (error) {
      this.log('error', 'Summarization failed', error);
      return 'Could not generate summary.';
    }
  }

  /**
   * Download file from URL
   */
  async downloadFile(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      // Add Twilio auth if needed
      const authUrl = new URL(url);
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        authUrl.username = process.env.TWILIO_ACCOUNT_SID;
        authUrl.password = process.env.TWILIO_AUTH_TOKEN;
      }

      protocol.get(authUrl.toString(), (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          // Follow redirect
          this.downloadFile(res.headers.location).then(resolve).catch(reject);
          return;
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * Handle list files command
   */
  async handleListFilesCommand(userId) {
    const files = this.getRecentFiles(10);

    if (files.length === 0) {
      return this.success(
        '*My Files*\n\n' +
        'No files received yet.\n\n' +
        'Send a PDF, document, or text file to get started!'
      );
    }

    let msg = '*Recent Files*\n\n';

    for (const file of files) {
      const date = this.formatShortDate(file.receivedAt);
      msg += `#${file.id} ${file.typeName}\n`;
      msg += `   ${this.formatSize(file.size)} | ${date}\n`;
      if (file.summary && file.summary.length < 60) {
        msg += `   _${file.summary}_\n`;
      }
      msg += '\n';
    }

    msg += `_${files.length} file(s) shown. Use "file #<id>" for details_`;

    return this.success(msg);
  }

  /**
   * Handle view file command
   */
  async handleViewFileCommand(userId, fileId) {
    const file = this.getFile(fileId);

    if (!file) {
      return this.error(`File #${fileId} not found.`);
    }

    let msg = `*File #${file.id}*\n\n`;
    msg += `Type: ${file.typeName}\n`;
    msg += `Size: ${this.formatSize(file.size)}\n`;
    msg += `Received: ${this.formatDate(file.receivedAt)}\n\n`;

    if (file.summary) {
      msg += `*Summary:*\n${file.summary}\n\n`;
    }

    if (file.extractedText) {
      const preview = file.extractedText.substring(0, 300);
      msg += `*Text Preview:*\n\`\`\`\n${preview}${file.extractedText.length > 300 ? '...' : ''}\n\`\`\`\n\n`;
    }

    msg += `_Use "delete file #${fileId}" to remove_`;

    return this.success(msg);
  }

  /**
   * Handle delete file command
   */
  async handleDeleteFileCommand(userId, fileId) {
    const deleted = this.deleteFile(fileId);

    if (!deleted) {
      return this.error(`File #${fileId} not found.`);
    }

    return this.success(
      `Deleted file #${fileId}\n\n` +
      `${deleted.typeName} (${this.formatSize(deleted.size)})`
    );
  }

  /**
   * Get file extension from content type
   */
  getExtension(contentType) {
    const extensions = {
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/plain': 'txt',
      'text/csv': 'csv',
      'application/json': 'json',
      'application/xml': 'xml',
      'text/xml': 'xml',
      'application/zip': 'zip'
    };
    return extensions[contentType] || 'file';
  }

  /**
   * Format file size for display
   */
  formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  /**
   * Format date for short display
   */
  formatShortDate(isoDate) {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short'
      });
    } catch {
      return isoDate;
    }
  }

  /**
   * Format date for full display
   */
  formatDate(isoDate) {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoDate;
    }
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();
    this.initClient();
    this.log('info', 'Files skill ready for document processing');
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      dataType: 'files',
      supportedTypes: Object.keys(DOCUMENT_TYPES),
      capabilities: ['document_processing', 'pdf_extraction', 'text_summarization']
    };
  }
}

module.exports = FilesSkill;
