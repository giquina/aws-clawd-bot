# AWS Deployment Guide

Complete guide to deploying ClawdBot on AWS.

---

## Understanding AWS Free Tier

**What you get FREE for 12 months:**
- ✅ 750 hours/month of t2.micro EC2 (enough for 24/7)
- ✅ 30 GB storage (EBS)
- ✅ 15 GB bandwidth out
- ✅ Public IPv4 address

**After 12 months:**
- t2.micro: ~£10/month
- 30 GB storage: ~£2/month
- **Total: ~£12-15/month**

---

## Prerequisites

Before starting, you need:
1. ✅ AWS account (create at aws.amazon.com)
2. ✅ Credit/debit card (for verification only)
3. ✅ Filled out `.env.local` config file

---

## Deployment Methods

### Method 1: Automated Script (Recommended)
Uses PowerShell script to do everything automatically.

**Pros:**
- Fastest (15 minutes)
- Handles all AWS setup
- Less room for error

**Cons:**
- Requires AWS CLI installed
- Windows only (for now)

### Method 2: Manual Setup
Create EC2 instance through AWS console.

**Pros:**
- Works on any OS
- See exactly what's being created
- Good for learning

**Cons:**
- Takes 30-40 minutes
- More steps to follow
- Easy to miss things

---

## Method 1: Automated Deployment

### Step 1: Install AWS CLI

**Check if already installed:**
```powershell
aws --version
```

If not installed:
```powershell
# Download and install
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi

# Or download manually from:
# https://aws.amazon.com/cli/
```

### Step 2: Configure AWS Credentials

```powershell
aws configure
```

Enter when prompted:
```
AWS Access Key ID: (from AWS Console → Security Credentials)
AWS Secret Access Key: (from AWS Console → Security Credentials)
Default region name: eu-west-2
Default output format: json
```

**Get your keys:**
1. Go to: https://console.aws.amazon.com/iam/home#/security_credentials
2. Click "Create access key"
3. Select "Command Line Interface (CLI)"
4. Copy both keys

### Step 3: Run Deployment Script

```powershell
cd C:\Giquina-Projects\aws-clawd-bot\scripts
.\deploy-to-aws.ps1
```

**What it does:**
1. Creates security group (firewall rules)
2. Generates SSH key pair
3. Launches t2.micro EC2 instance
4. Installs Docker and dependencies
5. Uploads bot code
6. Starts services

**Expected output:**
```
🚀 AWS ClawdBot Deployment Starting...

✅ Prerequisites OK
✅ Configuration loaded
📋 Step 1/5: Creating Security Group...
   Created security group: sg-xxxxx
📋 Step 2/5: Setting up SSH key...
   Created new SSH key
📋 Step 3/5: Launching EC2 instance...
   Instance launched: i-xxxxx
   Waiting for instance to be running...
   ✅ Instance running at: 54.123.456.789
📋 Step 4/5: Waiting for initialization...
   Installing Docker, Node.js...
📋 Step 5/5: Deploying application...
   Package created
   Uploading to EC2...
   ✅ Files uploaded

🎉 DEPLOYMENT COMPLETE!

Your ClawdBot is now running at:
   Public IP: 54.123.456.789
   Webhook URL: http://54.123.456.789:3000/webhook

Next Steps:
1. Configure Twilio webhook
2. Send 'status' via WhatsApp to test
```

**Save the Public IP!** You'll need it for Twilio setup.

### Step 4: Verify Deployment

**Test health endpoint:**
```powershell
curl http://YOUR_EC2_IP:3000/health
```

Should return:
```json
{"status":"online","uptime":123,"timestamp":"..."}
```

**SSH into instance:**
```powershell
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@YOUR_EC2_IP
```

**Check services:**
```bash
docker ps
```

Should show:
```
CONTAINER ID   IMAGE              STATUS         PORTS
xxxxx          clawd-bot          Up 2 minutes   0.0.0.0:3000->3000/tcp
xxxxx          ollama/ollama      Up 2 minutes   0.0.0.0:11434->11434/tcp
```

---

## Method 2: Manual Setup

### Step 1: Launch EC2 Instance

**1. Go to EC2 Dashboard:**
https://console.aws.amazon.com/ec2/

**2. Click "Launch Instance"**

**3. Configure:**
- Name: `ClawdBot`
- AMI: `Ubuntu Server 24.04 LTS (Free tier eligible)`
- Instance type: `t2.micro` (1 vCPU, 1GB RAM)
- Key pair: Create new → Name: `clawd-bot-key` → Download `.pem` file
- Security group: Create new
  - Allow SSH (22) from anywhere
  - Allow HTTP (80) from anywhere
  - Allow HTTPS (443) from anywhere
  - Allow Custom TCP (3000) from anywhere

**4. Storage:**
- 8-30 GB gp3 (Free tier: 30GB)

**5. Click "Launch Instance"**

### Step 2: Connect to Instance

**1. Wait for instance state = "running"**

**2. Get public IP** from instance details

**3. SSH connect:**

**Windows (PowerShell):**
```powershell
# Set key permissions first
icacls "clawd-bot-key.pem" /inheritance:r
icacls "clawd-bot-key.pem" /grant:r "$($env:USERNAME):(R)"

ssh -i clawd-bot-key.pem ubuntu@YOUR_EC2_IP
```

**Mac/Linux:**
```bash
chmod 400 clawd-bot-key.pem
ssh -i clawd-bot-key.pem ubuntu@YOUR_EC2_IP
```

### Step 3: Install Dependencies

**Once connected, run:**

```bash
# Update system
sudo apt-get update -y
sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo systemctl enable docker
sudo systemctl start docker

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify
docker --version
docker-compose --version
```

### Step 4: Upload Bot Code

**From your local computer:**

```powershell
# Create deployment package
cd C:\Giquina-Projects\aws-clawd-bot

# Upload files
scp -i clawd-bot-key.pem -r 02-whatsapp-bot ubuntu@YOUR_EC2_IP:/home/ubuntu/
scp -i clawd-bot-key.pem -r 03-github-automation ubuntu@YOUR_EC2_IP:/home/ubuntu/
scp -i clawd-bot-key.pem -r 04-llama-ai ubuntu@YOUR_EC2_IP:/home/ubuntu/
scp -i clawd-bot-key.pem -r 05-docker ubuntu@YOUR_EC2_IP:/home/ubuntu/
scp -i clawd-bot-key.pem config/.env.local ubuntu@YOUR_EC2_IP:/home/ubuntu/.env
```

### Step 5: Start Services

**Back on EC2 instance:**

```bash
# Create app directory
sudo mkdir -p /opt/clawd-bot
sudo mv ~/02-whatsapp-bot /opt/clawd-bot/
sudo mv ~/03-github-automation /opt/clawd-bot/
sudo mv ~/04-llama-ai /opt/clawd-bot/
sudo mv ~/05-docker/* /opt/clawd-bot/
sudo mv ~/.env /opt/clawd-bot/

# Navigate to app
cd /opt/clawd-bot

# Install Llama model
docker-compose up -d llama
sleep 30  # Wait for Ollama to start
docker exec clawd-llama ollama pull llama3.2:1b

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

---

## Post-Deployment Configuration

### Enable Auto-Restart on Reboot

```bash
# Create systemd service
sudo nano /etc/systemd/system/clawd-bot.service
```

Paste this:
```ini
[Unit]
Description=ClawdBot Service
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/clawd-bot
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down

[Install]
WantedBy=multi-user.target
```

Enable service:
```bash
sudo systemctl enable clawd-bot
sudo systemctl start clawd-bot
```

### Set Up CloudWatch Monitoring (Optional)

**1. Install CloudWatch agent:**
```bash
wget https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb
```

**2. Configure metrics:**
```bash
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
```

Select:
- Monitor this instance: Yes
- Collect metrics: Yes (CPU, memory, disk)
- Send to CloudWatch: Yes

---

## Cost Monitoring

### Set Up Billing Alerts

**1. Go to AWS Billing Console:**
https://console.aws.amazon.com/billing/

**2. Create alert:**
- Billing → Budgets → Create budget
- Budget type: Cost budget
- Period: Monthly
- Amount: £1 (to catch any accidental charges)
- Email notification

**3. Check usage:**
```bash
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost
```

### Staying in Free Tier

**Monitor these limits:**
- EC2 hours: 750/month (OK for 24/7)
- Data transfer: 15 GB/month
- EBS storage: 30 GB

**To check current usage:**
```bash
aws ec2 describe-instance-status --instance-ids i-XXXXXX
```

---

## Maintenance Tasks

### Weekly

**Check bot health:**
```bash
curl http://YOUR_EC2_IP:3000/health
```

**View logs for errors:**
```bash
ssh -i clawd-bot-key.pem ubuntu@YOUR_EC2_IP
docker logs clawd-bot --tail 100 | grep -i error
```

### Monthly

**Update packages:**
```bash
ssh -i clawd-bot-key.pem ubuntu@YOUR_EC2_IP
sudo apt-get update && sudo apt-get upgrade -y
docker-compose pull
docker-compose up -d
```

**Check disk space:**
```bash
df -h
docker system df
```

**Clean up old Docker images:**
```bash
docker system prune -a -f
```

---

## Scaling Up (If Needed)

### Upgrade Instance Type

**If bot is slow or running out of memory:**

```bash
# Stop instance
aws ec2 stop-instances --instance-ids i-XXXXXX

# Change to t2.small (2 vCPU, 2GB RAM)
aws ec2 modify-instance-attribute \
  --instance-id i-XXXXXX \
  --instance-type t2.small

# Start instance
aws ec2 start-instances --instance-ids i-XXXXXX
```

**Cost:** ~£15/month after Free Tier

### Add More Storage

**If running out of disk space:**

```bash
# Create snapshot first
aws ec2 create-snapshot --volume-id vol-XXXXXX

# Modify volume size
aws ec2 modify-volume \
  --volume-id vol-XXXXXX \
  --size 50
```

**Cost:** ~£3/month for 50GB

---

## Backup Strategy

### Automated Backups

**Create daily snapshots:**

```bash
# Add to crontab
crontab -e

# Add this line (runs at 2 AM daily)
0 2 * * * aws ec2 create-snapshot --volume-id vol-XXXXXX --description "ClawdBot backup $(date +\%Y-\%m-\%d)"
```

### Manual Backup

**Export configuration:**
```bash
cd /opt/clawd-bot
docker-compose down
tar -czf clawd-bot-backup.tar.gz .
scp clawd-bot-backup.tar.gz ubuntu@YOUR_LOCAL_IP:~/backups/
```

---

## Destroying Everything (When Done)

**To completely remove and stop all charges:**

```bash
# Stop bot
ssh -i clawd-bot-key.pem ubuntu@YOUR_EC2_IP
cd /opt/clawd-bot
docker-compose down -v

# From local machine
aws ec2 terminate-instances --instance-ids i-XXXXXX
aws ec2 delete-security-group --group-id sg-XXXXXX
aws ec2 delete-key-pair --key-name clawd-bot-key
```

**Verify no charges:**
- Go to: https://console.aws.amazon.com/billing/
- Check "Free Tier" usage
- Should show 0 hours if properly terminated

---

## Common Deployment Issues

### "AWS CLI not found"
Install from: https://aws.amazon.com/cli/

### "Insufficient permissions"
Your IAM user needs: EC2FullAccess policy

### "Key pair already exists"
Delete old key: `aws ec2 delete-key-pair --key-name clawd-bot-key`

### "Instance launch failed"
Check Free Tier limits haven't been exceeded

### "Can't SSH to instance"
- Wait 2-3 minutes after launch
- Check security group allows port 22
- Verify key permissions: `chmod 400 key.pem`

---

## Next Steps

1. ✅ Deploy to AWS
2. → Set up WhatsApp (see WHATSAPP_SETUP.md)
3. → Test all commands
4. → Monitor costs
5. → Customize bot behavior

**Your bot is now running 24/7! 🚀**

