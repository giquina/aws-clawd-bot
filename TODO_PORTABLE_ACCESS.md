# TODO: Portable Access Setup

**Goal:** Access ClawdBot EC2 from any computer without needing to copy SSH keys manually.

**Created:** 2026-02-02
**Status:** Pending

---

## Current Problem

- SSH key (`clawd-bot-key.pem`) only exists on one computer
- Can't troubleshoot EC2 from other machines
- Need API key to use REST endpoints

---

## Tasks to Complete

### 1. Enable AWS SSM Session Manager on EC2

**Why:** Connect to EC2 without SSH keys - just need AWS credentials.

```bash
# SSH to EC2 first (from main computer)
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151

# Install/enable SSM agent
sudo snap install amazon-ssm-agent --classic
sudo systemctl enable amazon-ssm-agent
sudo systemctl start amazon-ssm-agent

# Verify it's running
sudo systemctl status amazon-ssm-agent
```

**Also need:** IAM role attached to EC2 with `AmazonSSMManagedInstanceCore` policy.

---

### 2. Create Setup Script for New Computers

Create `scripts/setup-dev.sh`:

```bash
#!/bin/bash
echo "🔧 ClawdBot Dev Environment Setup"

# Check/install AWS CLI
if ! command -v aws &> /dev/null; then
    echo "Installing AWS CLI..."
    # Windows
    winget install Amazon.AWSCLI
    # Mac: brew install awscli
    # Linux: sudo apt install awscli
fi

# Configure AWS (will prompt for keys)
echo "Configuring AWS credentials..."
aws configure set region eu-north-1
aws configure

# Test SSM connection
echo "Testing EC2 connection via SSM..."
aws ssm start-session --target i-009f070a76a0d91c1 --region eu-north-1

echo "✅ Setup complete!"
```

---

### 3. Store Secrets Securely

**Option A: Password Manager (Recommended)**
- Store in 1Password/Bitwarden:
  - `clawd-bot-key.pem` (SSH private key)
  - `CLAWDBOT_API_KEY`
  - AWS Access Key & Secret Key

**Option B: AWS Secrets Manager**
```bash
# Store secrets in AWS
aws secretsmanager create-secret --name clawd-bot/ssh-key --secret-string file://~/.ssh/clawd-bot-key.pem
aws secretsmanager create-secret --name clawd-bot/api-key --secret-string "your-api-key"

# Retrieve on new computer
aws secretsmanager get-secret-value --secret-id clawd-bot/ssh-key --query SecretString --output text > ~/.ssh/clawd-bot-key.pem
chmod 600 ~/.ssh/clawd-bot-key.pem
```

---

### 4. Update Claude Code Config

Add to `.claude/settings.json` or CLAUDE.md:
- Document how to set up new dev environment
- Include SSM connection command
- Reference setup script

---

## Quick Reference Commands

**Connect via SSM (no SSH key needed):**
```bash
aws ssm start-session --target i-009f070a76a0d91c1 --region eu-north-1
```

**Connect via SSH (needs key):**
```bash
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151
```

**Check server health:**
```bash
curl http://16.171.150.151:3000/health
```

**View logs:**
```bash
# Via SSM or SSH:
pm2 logs clawd-bot --lines 50
```

---

## EC2 Instance Details

- **Instance ID:** `i-009f070a76a0d91c1`
- **IP:** `16.171.150.151`
- **Region:** `eu-north-1`
- **User:** `ubuntu`
- **App Path:** `/opt/clawd-bot/`
- **Process Manager:** PM2 (`clawd-bot`)

---

## Also Fix Tomorrow

1. **persistentMemory: false** - SQLite not working on EC2
2. **voiceCalling: false** - Twilio Voice not configured (optional)
3. **Test Telegram** - Verify bot responds from phone

---

*This file saved for tomorrow's session.*
