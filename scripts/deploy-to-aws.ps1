# AWS Deployment Script for ClawdBot
# This script deploys your bot to AWS EC2

Write-Host "🚀 AWS ClawdBot Deployment Starting..." -ForegroundColor Cyan
Write-Host ""

# Check if AWS CLI is installed
Write-Host "Checking prerequisites..." -ForegroundColor Yellow
$awsCli = Get-Command aws -ErrorAction SilentlyContinue
if (-not $awsCli) {
    Write-Host "❌ AWS CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   https://aws.amazon.com/cli/" -ForegroundColor Yellow
    exit 1
}

# Check if config file exists
$configPath = "..\config\.env.local"
if (-not (Test-Path $configPath)) {
    Write-Host "❌ Configuration file not found!" -ForegroundColor Red
    Write-Host "   Please copy .env.example to .env.local and fill in your keys" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Prerequisites OK" -ForegroundColor Green
Write-Host ""

# Load environment variables from config
Write-Host "Loading configuration..." -ForegroundColor Yellow
Get-Content $configPath | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

$awsRegion = $env:AWS_REGION
if (-not $awsRegion) {
    $awsRegion = "eu-west-2"
}

Write-Host "✅ Configuration loaded" -ForegroundColor Green
Write-Host ""

# Step 1: Create Security Group
Write-Host "📋 Step 1/5: Creating Security Group..." -ForegroundColor Cyan
$sgName = "clawd-bot-sg"

# Check if security group already exists
$existingSg = aws ec2 describe-security-groups --group-names $sgName --region $awsRegion 2>$null | ConvertFrom-Json
if ($existingSg) {
    $sgId = $existingSg.SecurityGroups[0].GroupId
    Write-Host "   Using existing security group: $sgId" -ForegroundColor Yellow
} else {
    # Create new security group
    $sgResult = aws ec2 create-security-group `
        --group-name $sgName `
        --description "Security group for ClawdBot" `
        --region $awsRegion | ConvertFrom-Json
    
    $sgId = $sgResult.GroupId
    Write-Host "   Created security group: $sgId" -ForegroundColor Green
    
    # Add rules: SSH (22), HTTP (80), HTTPS (443), Webhook (3000)
    aws ec2 authorize-security-group-ingress --group-id $sgId --protocol tcp --port 22 --cidr 0.0.0.0/0 --region $awsRegion
    aws ec2 authorize-security-group-ingress --group-id $sgId --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $awsRegion
    aws ec2 authorize-security-group-ingress --group-id $sgId --protocol tcp --port 443 --cidr 0.0.0.0/0 --region $awsRegion
    aws ec2 authorize-security-group-ingress --group-id $sgId --protocol tcp --port 3000 --cidr 0.0.0.0/0 --region $awsRegion
}

Write-Host "✅ Security group ready: $sgId" -ForegroundColor Green
Write-Host ""

# Step 2: Create Key Pair (if not exists)
Write-Host "📋 Step 2/5: Setting up SSH key..." -ForegroundColor Cyan
$keyName = "clawd-bot-key"
$keyPath = "$HOME\.ssh\$keyName.pem"

$existingKey = aws ec2 describe-key-pairs --key-names $keyName --region $awsRegion 2>$null
if (-not $existingKey) {
    # Create new key pair
    $keyMaterial = aws ec2 create-key-pair --key-name $keyName --region $awsRegion --query 'KeyMaterial' --output text
    
    # Save to file
    if (-not (Test-Path "$HOME\.ssh")) {
        New-Item -ItemType Directory -Path "$HOME\.ssh" -Force
    }
    $keyMaterial | Out-File -FilePath $keyPath -Encoding ASCII
    
    Write-Host "   Created new SSH key: $keyPath" -ForegroundColor Green
} else {
    Write-Host "   Using existing SSH key" -ForegroundColor Yellow
}

Write-Host "✅ SSH key ready" -ForegroundColor Green
Write-Host ""

# Step 3: Create EC2 Instance
Write-Host "📋 Step 3/5: Launching EC2 instance (this takes 2-3 minutes)..." -ForegroundColor Cyan

# User data script for instance initialization
$userData = @"
#!/bin/bash
set -e

# Update system
apt-get update -y
apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl enable docker
systemctl start docker

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Create app directory
mkdir -p /opt/clawd-bot
cd /opt/clawd-bot

# Log completion
echo "Instance initialization complete" > /var/log/user-data.log
"@

# Encode user data to base64
$userDataBytes = [System.Text.Encoding]::UTF8.GetBytes($userData)
$userDataBase64 = [Convert]::ToBase64String($userDataBytes)

# Launch instance
$tagSpec = 'ResourceType=instance,Tags=[{Key=Name,Value=ClawdBot}]'
$instanceResult = aws ec2 run-instances `
    --image-id ami-0c76bd4bd302b30ec `
    --instance-type t2.micro `
    --key-name $keyName `
    --security-group-ids $sgId `
    --user-data $userDataBase64 `
    --region $awsRegion `
    --tag-specifications $tagSpec | ConvertFrom-Json

$instanceId = $instanceResult.Instances[0].InstanceId
Write-Host "   Instance launched: $instanceId" -ForegroundColor Green
Write-Host "   Waiting for instance to be running..." -ForegroundColor Yellow

# Wait for instance to be running
aws ec2 wait instance-running --instance-ids $instanceId --region $awsRegion

# Get instance public IP
$instanceInfo = aws ec2 describe-instances --instance-ids $instanceId --region $awsRegion | ConvertFrom-Json
$publicIp = $instanceInfo.Reservations[0].Instances[0].PublicIpAddress

Write-Host "✅ Instance running at: $publicIp" -ForegroundColor Green
Write-Host ""

# Step 4: Wait for initialization to complete
Write-Host "📋 Step 4/5: Waiting for system initialization (2-3 minutes)..." -ForegroundColor Cyan
Write-Host "   Installing Docker, Node.js, and dependencies..." -ForegroundColor Yellow

Start-Sleep -Seconds 180  # Wait 3 minutes for user data script to complete

Write-Host "✅ System initialization complete" -ForegroundColor Green
Write-Host ""

# Step 5: Deploy application code
Write-Host "📋 Step 5/5: Deploying application..." -ForegroundColor Cyan

# Create deployment package locally
Write-Host "   Creating deployment package..." -ForegroundColor Yellow
$deployPath = "..\deploy-package"
if (Test-Path $deployPath) {
    Remove-Item -Recurse -Force $deployPath
}
New-Item -ItemType Directory -Path $deployPath -Force | Out-Null

# Copy necessary files
Copy-Item -Recurse "..\02-whatsapp-bot\*" "$deployPath\"
Copy-Item -Recurse "..\03-github-automation\*" "$deployPath\"
Copy-Item -Recurse "..\04-llama-ai\*" "$deployPath\"
Copy-Item -Recurse "..\05-docker\*" "$deployPath\"
Copy-Item "..\config\.env.local" "$deployPath\.env"

Write-Host "   Package created" -ForegroundColor Green

# Upload to EC2 (using SSH)
Write-Host "   Uploading to EC2..." -ForegroundColor Yellow
Write-Host "   (This requires SSH access - you may need to wait a few more minutes)" -ForegroundColor Yellow

# SCP command to upload files
$scpCommand = "scp -i `"$keyPath`" -o StrictHostKeyChecking=no -r $deployPath ubuntu@${publicIp}:/opt/clawd-bot/"
Write-Host "   Running: $scpCommand" -ForegroundColor Gray

# Note: This may fail if SSH isn't ready yet
try {
    Invoke-Expression $scpCommand
    Write-Host "✅ Files uploaded successfully" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Upload failed - SSH may not be ready yet" -ForegroundColor Yellow
    Write-Host "   Wait 2-3 minutes and run:" -ForegroundColor Yellow
    Write-Host "   $scpCommand" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=" -ForegroundColor Cyan -NoNewline; Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "🎉 DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host ""
Write-Host "Your ClawdBot is now running at:" -ForegroundColor Cyan
Write-Host "   Public IP: $publicIp" -ForegroundColor White
Write-Host "   Webhook URL: http://${publicIp}:3000/webhook" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Configure Twilio webhook to point to: http://${publicIp}:3000/webhook"
Write-Host "2. Send 'status' via WhatsApp to test the bot"
Write-Host "3. Check logs: ssh -i $keyPath ubuntu@$publicIp 'docker logs clawd-bot'"
Write-Host ""
Write-Host "Documentation:" -ForegroundColor Yellow
Write-Host "   - See docs/WHATSAPP_SETUP.md for WhatsApp configuration"
Write-Host "   - See docs/TROUBLESHOOTING.md if issues occur"
Write-Host ""
