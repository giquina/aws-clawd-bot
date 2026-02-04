/**
 * Image Generation Skill - AI Image Generation using Replicate
 *
 * Generates images from text prompts using Stable Diffusion via Replicate API.
 * More cost-effective than DALL-E (~$0.01-0.05 per image).
 *
 * Commands:
 *   generate image <prompt>        - Generate image from text prompt
 *   generate logo <description>    - Generate logo with optimized prompt
 *   create image <prompt>          - Alias for generate image
 *   make image <prompt>            - Alias for generate image
 *
 * Voice Support:
 *   "generate a hero image for JUDO project"
 *   "create a logo for my startup"
 *   "make an image of a sunset over mountains"
 *
 * Features:
 *   - Generates images using Replicate's Stable Diffusion XL
 *   - Saves images locally with metadata
 *   - Sends image directly to Telegram
 *   - Tracks generation in outcome tracker
 *   - Requires confirmation for generation (cost: ~$0.01-0.05 per image)
 *
 * Requirements:
 *   - REPLICATE_API_TOKEN env var
 *   - /opt/clawd-bot/data/images/ directory on EC2
 *   - Telegram bot with sendPhoto capability
 *
 * @example
 * User: generate image a futuristic city at night
 * Bot: ⚠ Generate image requires approval
 *      Prompt: "a futuristic city at night"
 *      Estimated cost: $0.02
 *      Reply 'yes' to proceed
 * User: yes
 * Bot: ✓ Image generated [sends image via Telegram]
 */
const BaseSkill = require('../base-skill');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

class ImageGenSkill extends BaseSkill {
  name = 'image-gen';
  description = 'Generate images from text prompts using AI (Replicate Stable Diffusion)';
  priority = 17;

  commands = [
    {
      pattern: /^generate image (.+)/i,
      description: 'Generate an image from a text prompt',
      usage: 'generate image <prompt>'
    },
    {
      pattern: /^generate logo (.+)/i,
      description: 'Generate a logo with optimized prompt',
      usage: 'generate logo <description>'
    },
    {
      pattern: /^(create|make) image (.+)/i,
      description: 'Generate an image (alias)',
      usage: 'create image <prompt>'
    },
    {
      pattern: /^(generate|create|make) (a |an )?image$/i,
      description: 'Prompt for image generation',
      usage: 'generate image'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.replicateApiUrl = 'https://api.replicate.com/v1';
    this.model = 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b';
    this.imagesDir = this._resolveImagesDir();
    this._ensureImagesDirExists();
  }

  /**
   * Resolve the images directory path
   */
  _resolveImagesDir() {
    // EC2 production path
    if (process.platform !== 'win32' && fs.existsSync('/opt/clawd-bot')) {
      return '/opt/clawd-bot/data/images';
    }
    // Local development path
    return path.join(__dirname, '..', '..', 'data', 'images');
  }

  /**
   * Ensure images directory exists
   */
  _ensureImagesDirExists() {
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
      this.log('info', `Created images directory: ${this.imagesDir}`);
    }
  }

  /**
   * Execute the command
   */
  async execute(command, context) {
    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Check if API is configured
    if (!process.env.REPLICATE_API_TOKEN) {
      return this.error(
        'Image generation not configured',
        'REPLICATE_API_TOKEN environment variable is not set',
        {
          suggestion: 'Add REPLICATE_API_TOKEN to config/.env.local and restart the bot'
        }
      );
    }

    // Handle prompt-only commands (no args)
    if (/^(generate|create|make) (a |an )?image$/i.test(lowerCommand)) {
      return this.success(
        'Send me a prompt and I\'ll generate an image.\n\n' +
        'Examples:\n' +
        '- generate image a futuristic city at night\n' +
        '- generate logo modern tech startup\n' +
        '- create image sunset over mountains\n\n' +
        'Note: Each generation costs ~$0.02'
      );
    }

    // Extract prompt from command
    let prompt = '';
    let isLogo = false;

    if (/^generate image (.+)/i.test(lowerCommand)) {
      const match = lowerCommand.match(/^generate image (.+)/i);
      prompt = match[1].trim();
    } else if (/^generate logo (.+)/i.test(lowerCommand)) {
      const match = lowerCommand.match(/^generate logo (.+)/i);
      prompt = match[1].trim();
      isLogo = true;
    } else if (/^(create|make) image (.+)/i.test(lowerCommand)) {
      const match = lowerCommand.match(/^(create|make) image (.+)/i);
      prompt = match[2].trim();
    }

    if (!prompt) {
      return this.error(
        'Missing prompt',
        'Please provide a description of what you want to generate',
        {
          suggestion: 'Try: generate image a sunset over mountains'
        }
      );
    }

    // Optimize prompt for logo generation
    if (isLogo) {
      prompt = this._optimizeLogoPrompt(prompt);
    }

    // Request confirmation (required for all generations due to cost)
    return this.warning('Generate image', {
      cost: '0.02',
      risk: 'low',
      action: "Reply 'yes' to proceed",
      data: {
        action: 'generate-image',
        prompt: prompt,
        isLogo: isLogo,
        context: context
      }
    });
  }

  /**
   * Optimize prompt for logo generation
   */
  _optimizeLogoPrompt(description) {
    return `professional logo design, ${description}, clean, modern, minimalist, vector style, white background, high quality, centered`;
  }

  /**
   * Execute the image generation after confirmation
   * Called by confirmation manager after user says 'yes'
   */
  async executeConfirmed(approvalData, context) {
    const { prompt, isLogo } = approvalData;

    this.log('info', `Generating ${isLogo ? 'logo' : 'image'} with prompt: "${prompt}"`);

    try {
      // Start tracking outcome
      const outcomeTracker = this._getOutcomeTracker();
      const actionId = outcomeTracker?.startAction(
        'image-generation',
        {
          prompt: prompt,
          isLogo: isLogo,
          user: context.userId,
          chat: context.chatId
        },
        context.chatId
      );

      // Generate image via Replicate API
      const imageUrl = await this._generateImage(prompt);

      if (!imageUrl) {
        outcomeTracker?.completeAction(actionId, 'failed', { error: 'No image URL returned' });
        return this.error(
          'Image generation failed',
          'The API did not return an image URL',
          {
            attempted: `Prompt: "${prompt}"`,
            suggestion: 'Try again with a different prompt or check API status'
          }
        );
      }

      // Download and save image
      const filename = await this._downloadAndSaveImage(imageUrl, prompt);

      if (!filename) {
        outcomeTracker?.completeAction(actionId, 'failed', { error: 'Failed to save image' });
        return this.error(
          'Image download failed',
          'Could not save the generated image',
          {
            attempted: 'Downloading from Replicate',
            suggestion: 'Check disk space and permissions'
          }
        );
      }

      const imagePath = path.join(this.imagesDir, filename);

      // Send image to Telegram
      const sent = await this._sendImageToTelegram(imagePath, prompt, context);

      if (!sent) {
        outcomeTracker?.completeAction(actionId, 'completed', {
          filename: filename,
          imagePath: imagePath,
          telegramSent: false
        });
        return this.success(
          `Image generated and saved as ${filename}`,
          { filename, imagePath },
          { cost: '0.02' }
        );
      }

      outcomeTracker?.completeAction(actionId, 'completed', {
        filename: filename,
        imagePath: imagePath,
        telegramSent: true
      });

      return this.success(
        `Image generated from prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`,
        { filename, imagePath },
        { cost: '0.02' }
      );

    } catch (error) {
      this.log('error', 'Image generation failed', error);

      const outcomeTracker = this._getOutcomeTracker();
      if (outcomeTracker) {
        const actionId = outcomeTracker.startAction('image-generation', { prompt }, context.chatId);
        outcomeTracker.completeAction(actionId, 'failed', { error: error.message });
      }

      return this.error(
        'Image generation failed',
        error,
        {
          attempted: `Generating image with prompt: "${prompt}"`,
          suggestion: 'Check API token and try again'
        }
      );
    }
  }

  /**
   * Generate image using Replicate API
   * @returns {Promise<string>} Image URL
   */
  async _generateImage(prompt) {
    const apiToken = process.env.REPLICATE_API_TOKEN;

    return new Promise((resolve, reject) => {
      // Create prediction
      const postData = JSON.stringify({
        version: this.model.split(':')[1],
        input: {
          prompt: prompt,
          num_outputs: 1,
          guidance_scale: 7.5,
          num_inference_steps: 25,
          width: 1024,
          height: 1024
        }
      });

      const options = {
        hostname: 'api.replicate.com',
        port: 443,
        path: `/v1/predictions`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${apiToken}`,
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', async () => {
          try {
            const response = JSON.parse(data);

            if (res.statusCode !== 201) {
              this.log('error', 'Replicate API error', response);
              reject(new Error(response.detail || 'Failed to create prediction'));
              return;
            }

            // Poll for completion
            const imageUrl = await this._pollPrediction(response.id, apiToken);
            resolve(imageUrl);

          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Poll prediction until complete
   * @returns {Promise<string>} Image URL
   */
  async _pollPrediction(predictionId, apiToken) {
    return new Promise((resolve, reject) => {
      const maxAttempts = 60; // 60 seconds max
      let attempts = 0;

      const poll = () => {
        attempts++;

        const options = {
          hostname: 'api.replicate.com',
          port: 443,
          path: `/v1/predictions/${predictionId}`,
          method: 'GET',
          headers: {
            'Authorization': `Token ${apiToken}`
          }
        };

        const req = https.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const response = JSON.parse(data);

              if (response.status === 'succeeded') {
                // Image is ready
                const imageUrl = response.output?.[0];
                if (!imageUrl) {
                  reject(new Error('No image URL in response'));
                  return;
                }
                resolve(imageUrl);
                return;
              }

              if (response.status === 'failed' || response.status === 'canceled') {
                reject(new Error(`Generation ${response.status}: ${response.error || 'Unknown error'}`));
                return;
              }

              // Still processing
              if (attempts >= maxAttempts) {
                reject(new Error('Timeout waiting for image generation'));
                return;
              }

              // Poll again after 1 second
              setTimeout(poll, 1000);

            } catch (error) {
              reject(error);
            }
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.end();
      };

      poll();
    });
  }

  /**
   * Download image from URL and save to disk
   * @returns {Promise<string>} Filename
   */
  async _downloadAndSaveImage(imageUrl, prompt) {
    return new Promise((resolve, reject) => {
      const timestamp = Date.now();
      const hash = crypto.createHash('md5').update(prompt).digest('hex').substring(0, 8);
      const filename = `image_${timestamp}_${hash}.png`;
      const filepath = path.join(this.imagesDir, filename);

      const file = fs.createWriteStream(filepath);

      https.get(imageUrl, (response) => {
        response.pipe(file);

        file.on('finish', () => {
          file.close();
          this.log('info', `Image saved: ${filename}`);

          // Save metadata
          this._saveMetadata(filename, prompt);

          resolve(filename);
        });
      }).on('error', (error) => {
        fs.unlink(filepath, () => {}); // Delete partial file
        reject(error);
      });
    });
  }

  /**
   * Save image metadata to JSON file
   */
  _saveMetadata(filename, prompt) {
    try {
      const metadataFile = path.join(this.imagesDir, `${filename}.meta.json`);
      const metadata = {
        filename: filename,
        prompt: prompt,
        timestamp: new Date().toISOString(),
        model: this.model
      };

      fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    } catch (error) {
      this.log('warn', 'Failed to save metadata', error);
    }
  }

  /**
   * Send image to Telegram
   */
  async _sendImageToTelegram(imagePath, prompt, context) {
    try {
      const { chatId } = context;

      // Get telegram handler from context
      const telegramHandler = this.config.telegramHandler;
      if (!telegramHandler?.bot) {
        this.log('warn', 'Telegram handler not available');
        return false;
      }

      // Send photo
      await telegramHandler.bot.telegram.sendPhoto(chatId, {
        source: imagePath
      }, {
        caption: `Generated: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`
      });

      this.log('info', `Image sent to Telegram chat ${chatId}`);
      return true;

    } catch (error) {
      this.log('error', 'Failed to send image to Telegram', error);
      return false;
    }
  }

  /**
   * Get outcome tracker (lazy load to avoid circular dependencies)
   */
  _getOutcomeTracker() {
    try {
      if (!this._outcomeTracker) {
        this._outcomeTracker = require('../../lib/outcome-tracker');
      }
      return this._outcomeTracker;
    } catch (error) {
      this.log('warn', 'Outcome tracker not available', error);
      return null;
    }
  }
}

module.exports = ImageGenSkill;
