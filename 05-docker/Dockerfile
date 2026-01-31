# Dockerfile for ClawdBot WhatsApp Service
FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY 02-whatsapp-bot/package*.json ./
RUN npm install --production

# Copy application code
COPY 02-whatsapp-bot/ ./

# Copy environment file
COPY .env ./

# Expose webhook port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the bot
CMD ["npm", "start"]
