#!/bin/bash
# ClawdBot Deploy Script
# Usage: ./deploy.sh [quick|full] [install-cc]
# quick = git pull + restart (default)
# full = git pull + npm install + restart
# install-cc = run Claude Code CLI installation after deploy

set -e

EC2_HOST="ubuntu@16.171.150.151"
EC2_KEY="~/.ssh/clawd-bot-key.pem"
INSTANCE_ID="i-009f070a76a0d91c1"
REMOTE_DIR="/opt/clawd-bot"
REGION="eu-north-1"

MODE="${1:-quick}"

echo "🚀 Deploying ClawdBot ($MODE mode)..."
echo ""

# Step 1: Push SSH key (EC2 Instance Connect keys expire quickly)
echo "🔑 Pushing SSH key..."
aws ec2-instance-connect send-ssh-public-key \
  --instance-id "$INSTANCE_ID" \
  --instance-os-user ubuntu \
  --ssh-public-key "file://$EC2_KEY.pub" \
  --region "$REGION" > /dev/null

# Step 2: SSH and deploy
echo "📦 Deploying to EC2..."

if [ "$MODE" = "full" ]; then
    ssh -i "$EC2_KEY" "$EC2_HOST" << 'DEPLOY'
cd /opt/clawd-bot
echo "📥 Pulling latest code..."
git pull origin master
echo "📦 Installing dependencies..."
cd 02-bot
npm install --production
npm rebuild better-sqlite3 2>/dev/null || true
echo "🔄 Restarting..."
pm2 restart clawd-bot
sleep 3
echo ""
echo "✅ Deploy complete!"
pm2 status clawd-bot
DEPLOY
else
    ssh -i "$EC2_KEY" "$EC2_HOST" << 'DEPLOY'
cd /opt/clawd-bot
echo "📥 Pulling latest code..."
git pull origin master
echo "🔄 Restarting..."
pm2 restart clawd-bot
sleep 3
echo ""
echo "✅ Deploy complete!"
pm2 status clawd-bot
DEPLOY
fi

# Step 3: Optional Claude Code CLI installation
if [ "$2" = "install-cc" ]; then
    echo ""
    echo "🔧 Installing Claude Code CLI..."
    ssh -i "$EC2_KEY" "$EC2_HOST" << 'INSTALL_CC'
cd /opt/clawd-bot
bash scripts/install-claude-code.sh
INSTALL_CC
fi

echo ""
echo "✅ Done! Bot is running on EC2."
