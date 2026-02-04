# Image Generation Skill

AI-powered image generation using Replicate's Stable Diffusion XL.

## Overview

Generates high-quality images from text prompts via Telegram commands or voice notes. Uses Replicate API (more cost-effective than DALL-E at ~$0.02 per image).

## Commands

```
generate image <prompt>        # Generate image from text description
generate logo <description>    # Generate logo with optimized prompt
create image <prompt>          # Alias for generate image
make image <prompt>            # Alias for generate image
```

## Voice Support

```
"generate a hero image for JUDO project"
"create a logo for my startup"
"make an image of a sunset over mountains"
```

## Features

- **Cost-Effective**: ~$0.02 per image (Replicate Stable Diffusion XL)
- **Telegram Integration**: Images sent directly as photos
- **Local Storage**: Images saved at `/opt/clawd-bot/data/images/` with metadata
- **Logo Optimization**: Automatic prompt enhancement for logo generation
- **Confirmation Flow**: Requires user approval before generation
- **Outcome Tracking**: Full integration with outcome tracker

## Configuration

### Environment Variables

```bash
REPLICATE_API_TOKEN=r8_...  # Required - from replicate.com
```

### Settings (skills.json)

```json
{
  "image-gen": {
    "model": "stability-ai/sdxl",
    "costPerGeneration": 0.02,
    "maxWidth": 1024,
    "maxHeight": 1024,
    "defaultSteps": 25,
    "guidanceScale": 7.5,
    "requiresConfirmation": true
  }
}
```

## Usage Examples

### Basic Image Generation

```
User: generate image a futuristic city at night
Bot: ⚠ Generate image requires approval
     Prompt: "a futuristic city at night"
     Estimated cost: $0.02
     Reply 'yes' to proceed
User: yes
Bot: ✓ Image generated
     [Sends image via Telegram]
```

### Logo Generation

```
User: generate logo modern tech startup
Bot: ⚠ Generate image requires approval
     Prompt: "professional logo design, modern tech startup, clean, modern, minimalist, vector style, white background, high quality, centered"
     Estimated cost: $0.02
     Reply 'yes' to proceed
User: yes
Bot: ✓ Image generated
     [Sends logo via Telegram]
```

### Voice Command

```
User: [voice note] "create a hero image for the JUDO landing page, make it energetic and sporty"
Bot: ⚠ Generate image requires approval
     Prompt: "energetic and sporty hero image for landing page, dynamic movement, JUDO theme"
     Estimated cost: $0.02
     Reply 'yes' to proceed
User: yes
Bot: ✓ Image generated
     [Sends image via Telegram]
```

## Technical Details

### Model

- **Provider**: Replicate
- **Model**: `stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b`
- **Resolution**: 1024x1024 (default)
- **Inference Steps**: 25 (balance of quality and speed)
- **Guidance Scale**: 7.5 (prompt adherence)

### Storage

Images are saved with the following structure:

```
/opt/clawd-bot/data/images/
├── image_1234567890_abc12345.png
├── image_1234567890_abc12345.png.meta.json
└── ...
```

Metadata format:
```json
{
  "filename": "image_1234567890_abc12345.png",
  "prompt": "a futuristic city at night",
  "timestamp": "2026-02-04T12:34:56.789Z",
  "model": "stability-ai/sdxl:..."
}
```

### API Flow

1. User sends command
2. Skill extracts prompt
3. Skill returns `needsApproval: true`
4. Confirmation manager sets pending action
5. User confirms with "yes"
6. Index.js routes to `executeConfirmed()`
7. Skill calls Replicate API:
   - Creates prediction
   - Polls every 1 second (max 60 seconds)
   - Downloads image on completion
8. Image saved locally
9. Image sent to Telegram via bot.telegram.sendPhoto()
10. Success response sent to user

## Error Handling

### API Not Configured
```
✗ Image generation not configured
  Reason: REPLICATE_API_TOKEN environment variable is not set
  Suggestion: Add REPLICATE_API_TOKEN to config/.env.local and restart the bot
```

### Missing Prompt
```
✗ Missing prompt
  Reason: Please provide a description of what you want to generate
  Suggestion: Try: generate image a sunset over mountains
```

### Generation Failed
```
✗ Image generation failed
  Reason: [API error message]
  Attempted: Generating image with prompt: "..."
  Suggestion: Check API token and try again
```

### Timeout
```
✗ Image generation failed
  Reason: Timeout waiting for image generation
  Attempted: Generating image with prompt: "..."
  Suggestion: Try again with a simpler prompt
```

## Cost Management

- **Per Image**: ~$0.02
- **Confirmation Required**: All generations require explicit "yes" confirmation
- **No Auto-Generation**: Never generates without user approval
- **Budget Tracking**: Integrates with outcome tracker for cost monitoring

## Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",
    "better-sqlite3": "^9.2.2"
  }
}
```

No additional npm packages required - uses native Node.js `https` module for Replicate API calls.

## Priority

Priority: **17**

Higher than generic media skills but lower than critical operations.

## Skill Category

Media Generation

## Changelog

### v2.6.0 (2026-02-04)
- Initial implementation
- Replicate Stable Diffusion XL integration
- Telegram photo sending
- Local storage with metadata
- Logo prompt optimization
- Confirmation flow
- Outcome tracking

## Future Enhancements

- [ ] S3 storage integration for history
- [ ] Multiple size options (512x512, 768x768, 1024x1024)
- [ ] Style presets (photorealistic, artistic, cartoon)
- [ ] Negative prompts support
- [ ] Image-to-image generation
- [ ] Upscaling support
- [ ] Gallery view of generated images
- [ ] Budget limits per user
- [ ] Image editing capabilities
- [ ] Batch generation

## Support

For issues or questions, check:
1. Environment variables are set correctly
2. Replicate API token is valid
3. Bot has permission to send photos in Telegram
4. `/opt/clawd-bot/data/images/` directory exists and is writable
5. PM2 logs: `pm2 logs clawd-bot`

## Related Skills

- **image-analysis**: Analyze and describe images using Claude Vision
- **files**: Handle file uploads and downloads
- **voice**: Process voice commands for generation requests
