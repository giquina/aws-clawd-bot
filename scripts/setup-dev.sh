#!/bin/bash
# ClawdBot Dev Environment Setup Script (Linux/Mac)
# Run this on any new computer to get full access

echo "========================================"
echo "ClawdBot Dev Environment Setup"
echo "========================================"

# Check for AWS CLI
if ! command -v aws &> /dev/null; then
    echo ""
    echo "AWS CLI not found. Installing..."

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        echo "Installing via Homebrew..."
        brew install awscli
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        echo "Installing via apt..."
        sudo apt update && sudo apt install -y awscli
    fi
else
    echo "AWS CLI found!"
fi

# Configure AWS credentials
echo ""
echo "Configuring AWS credentials..."
echo "You'll need your AWS Access Key and Secret Key"
echo "Get them from: https://console.aws.amazon.com/iam/home#/security_credentials"

aws configure set region eu-north-1
aws configure

# Test AWS connection
echo ""
echo "Testing AWS connection..."
if aws sts get-caller-identity &> /dev/null; then
    echo "AWS credentials configured successfully!"
else
    echo "AWS configuration failed. Check your credentials."
    exit 1
fi

# Check for Session Manager plugin
echo ""
echo "Checking for Session Manager plugin..."
if ! command -v session-manager-plugin &> /dev/null; then
    echo "Session Manager plugin not installed."
    echo ""
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "Install on Mac:"
        echo "  brew install --cask session-manager-plugin"
    else
        echo "Install on Linux:"
        echo "  curl 'https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb' -o /tmp/session-manager-plugin.deb"
        echo "  sudo dpkg -i /tmp/session-manager-plugin.deb"
    fi
fi

# EC2 Instance Details
echo ""
echo "========================================"
echo "EC2 Instance Details"
echo "========================================"
echo "Instance ID: i-009f070a76a0d91c1"
echo "IP Address:  16.171.150.151"
echo "Region:      eu-north-1"
echo "User:        ubuntu"
echo "App Path:    /opt/clawd-bot/"

# Test server health
echo ""
echo "Testing ClawdBot server..."
HEALTH=$(curl -s http://16.171.150.151:3000/health 2>/dev/null)
if [ -n "$HEALTH" ]; then
    echo "Server is online!"
    echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"
else
    echo "Server unreachable"
fi

# Quick Commands Reference
echo ""
echo "========================================"
echo "Quick Commands"
echo "========================================"
echo ""
echo "Connect via SSM (no SSH key needed):"
echo "  aws ssm start-session --target i-009f070a76a0d91c1 --region eu-north-1"
echo ""
echo "Connect via SSH (needs key):"
echo "  ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151"
echo ""
echo "View logs:"
echo "  pm2 logs clawd-bot --lines 50"
echo ""
echo "Restart bot:"
echo "  pm2 restart clawd-bot"

echo ""
echo "========================================"
echo "Setup complete!"
echo "========================================"
