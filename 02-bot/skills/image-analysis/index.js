/**
 * Image Analysis Skill - General image analysis using Claude Vision
 *
 * Uses Claude Vision API to analyze any image sent via WhatsApp.
 * Lower priority than receipts skill (25 vs 30) so receipts are handled first.
 *
 * Commands:
 *   [image message]              - Describe what's in the image
 *   [image message with text]    - Answer question about the image
 *   analyze image | what's this  - Prompt to send an image
 *
 * @example
 * [User sends image]
 * -> "I can see a golden retriever dog sitting on grass..."
 *
 * [User sends image with "what color is this?"]
 * -> "The car in the image is bright red..."
 */
const BaseSkill = require('../base-skill');
const Anthropic = require('@anthropic-ai/sdk');

class ImageAnalysisSkill extends BaseSkill {
  name = 'image-analysis';
  description = 'Analyze images and answer questions about them using AI vision';
  priority = 25; // Lower than receipts (30) so receipts skill handles receipt images first

  commands = [
    {
      pattern: /^(analyze image|analyse image|what'?s this|describe this|what is this)$/i,
      description: 'Prompt to send an image for analysis',
      usage: 'analyze image'
    },
    {
      pattern: /^(analyze|analyse|describe|what'?s in|identify|explain)$/i,
      description: 'Image analysis keywords',
      usage: 'analyze [send image]'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.claude = null;
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
   * Handles images that are NOT receipts
   */
  canHandle(command, context = {}) {
    // Check text commands first (analyze image, what's this, etc.)
    if (super.canHandle(command)) {
      return true;
    }

    // Check if there's an image message
    if (context.mediaUrl && context.mediaContentType) {
      // Only handle image types (not audio, video, documents)
      if (context.mediaContentType.startsWith('image/')) {
        return true;
      }
    }

    // Fallback check for numMedia (Twilio sends this)
    if (context.numMedia > 0 && context.mediaUrl) {
      return true;
    }

    return false;
  }

  /**
   * Execute the command
   */
  async execute(command, context) {
    const { userId, mediaUrl, mediaContentType, numMedia } = context;

    // Check for image message
    const hasImage = mediaUrl && (
      (mediaContentType && mediaContentType.startsWith('image/')) ||
      numMedia > 0
    );

    if (hasImage) {
      return await this.handleImageAnalysis(command, context);
    }

    // Text-only command - prompt to send an image
    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    if (/^(analyze image|analyse image|what'?s this|describe this|what is this)$/i.test(lowerCommand)) {
      return this.success(
        'Send me an image and I\'ll describe what I see.\n\n' +
        'You can also add a question like:\n' +
        '- "what color is this?"\n' +
        '- "how many people?"\n' +
        '- "what brand is this?"'
      );
    }

    if (/^(analyze|analyse|describe|what'?s in|identify|explain)$/i.test(lowerCommand)) {
      return this.success(
        'Send an image with your question and I\'ll analyze it for you.'
      );
    }

    return this.error('Send me an image to analyze.');
  }

  /**
   * Handle image analysis using Claude Vision
   */
  async handleImageAnalysis(command, context) {
    const { userId, mediaUrl } = context;
    const userQuestion = command ? command.trim() : '';

    this.log('info', `Analyzing image for user ${userId}${userQuestion ? ` with question: "${userQuestion}"` : ''}`);

    try {
      const client = this.initClient();
      if (!client) {
        return this.error('AI service not configured. Cannot analyze image.');
      }

      // Build the prompt based on whether user asked a question
      let analysisPrompt;
      if (userQuestion && userQuestion.length > 0) {
        // User has a specific question about the image
        analysisPrompt = `The user sent this image with the question: "${userQuestion}"

Answer their question directly and concisely. Keep your response under 400 characters for WhatsApp readability.

If you cannot answer the question based on what's visible in the image, say so briefly.`;
      } else {
        // No question - provide a general description
        analysisPrompt = `Describe what you see in this image. Be concise and informative.

Focus on:
- Main subject or objects
- Key details that stand out
- Any text visible (if relevant)
- Context or setting

Keep your response under 400 characters for WhatsApp readability. Be direct - no need for phrases like "I can see" or "The image shows".`;
      }

      // Call Claude Vision API
      const response = await this.claude.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'url',
                url: mediaUrl
              }
            },
            {
              type: 'text',
              text: analysisPrompt
            }
          ]
        }]
      });

      // Extract the response text
      const analysisResult = response.content[0].text.trim();

      // Ensure response is under 500 chars for WhatsApp
      const truncatedResult = analysisResult.length > 480
        ? analysisResult.substring(0, 477) + '...'
        : analysisResult;

      return this.success(truncatedResult);

    } catch (error) {
      this.log('error', 'Image analysis failed', error);

      // Handle specific error cases
      if (error.message && error.message.includes('Could not process image')) {
        return this.error('Could not process the image. Try sending a clearer photo.');
      }

      if (error.message && error.message.includes('rate limit')) {
        return this.error('Too many requests. Please wait a moment and try again.');
      }

      return this.error(`Failed to analyze image: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();
    this.initClient();
    this.log('info', 'Image analysis skill ready');
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      provider: 'Claude Vision API',
      capabilities: ['image_analysis', 'visual_qa']
    };
  }
}

module.exports = ImageAnalysisSkill;
