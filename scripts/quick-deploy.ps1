# Quick Deploy Script for ClawdBot v2.1
# Deploys to existing EC2 instance at 16.171.150.151

param(
    [string]$InstanceIP = "16.171.150.151",
    [string]$KeyPath = "$HOME\.ssh\clawd-bot-key.pem"
)

Write-Host ""
Write-Host "ClawdBot v2.1 Quick Deploy" -ForegroundColor Cyan
Write-Host "==========================" -ForegroundColor Cyan
Write-Host ""

# Check SSH key exists
if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH key not found at: $KeyPath" -ForegroundColor Red
    exit 1
}

# Step 1: Create tarball (excluding unnecessary files)
Write-Host "[1/4] Creating deployment package..." -ForegroundColor Yellow
$projectRoot = Split-Path -Parent $PSScriptRoot
$tarball = "$env:TEMP\clawd-bot.tar.gz"

Push-Location $projectRoot
tar -czvf $tarball --exclude='node_modules' --exclude='.git' --exclude='deploy-package' --exclude='*.log' .
Pop-Location

if (-not (Test-Path $tarball)) {
    Write-Host "Failed to create tarball" -ForegroundColor Red
    exit 1
}
Write-Host "   Package created: $tarball" -ForegroundColor Green

# Step 2: Push SSH key using EC2 Instance Connect (fixes permission issues)
Write-Host "[2/4] Setting up SSH access..." -ForegroundColor Yellow

$pubKeyPath = "$KeyPath.pub"
if (-not (Test-Path $pubKeyPath)) {
    # Generate public key from private key
    ssh-keygen -y -f $KeyPath > $pubKeyPath
}

# Get instance ID
$instanceId = "i-009f070a76a0d91c1"
$awsRegion = "eu-north-1"

try {
    $pubKey = Get-Content $pubKeyPath -Raw
    & "C:\Program Files\Amazon\AWSCLIV2\aws.exe" ec2-instance-connect send-ssh-public-key `
        --instance-id $instanceId `
        --instance-os-user ubuntu `
        --ssh-public-key "$pubKey" `
        --region $awsRegion
    Write-Host "   SSH key pushed via EC2 Instance Connect" -ForegroundColor Green
} catch {
    Write-Host "   Warning: Could not push SSH key, trying direct SSH..." -ForegroundColor Yellow
}

# Step 3: Upload tarball
Write-Host "[3/4] Uploading to EC2..." -ForegroundColor Yellow
scp -i $KeyPath -o StrictHostKeyChecking=no -o ConnectTimeout=10 $tarball "ubuntu@${InstanceIP}:/tmp/"

if ($LASTEXITCODE -ne 0) {
    Write-Host "   SCP failed. Retrying with EC2 Instance Connect..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    scp -i $KeyPath -o StrictHostKeyChecking=no $tarball "ubuntu@${InstanceIP}:/tmp/"
}

Write-Host "   Upload complete" -ForegroundColor Green

# Step 4: Extract and restart
Write-Host "[4/4] Deploying and restarting..." -ForegroundColor Yellow

$deployCommands = @"
cd /opt/clawd-bot && \
sudo tar -xzf /tmp/clawd-bot.tar.gz && \
cd 02-whatsapp-bot && \
npm install --production && \
pm2 restart clawd-bot || pm2 start index.js --name clawd-bot && \
pm2 save && \
echo 'Deploy complete!'
"@

ssh -i $KeyPath -o StrictHostKeyChecking=no "ubuntu@${InstanceIP}" $deployCommands

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "ClawdBot v2.1 is now running at:" -ForegroundColor White
Write-Host "   http://${InstanceIP}:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test commands:" -ForegroundColor Yellow
Write-Host "   curl http://${InstanceIP}:3000/health"
Write-Host "   Send 'status' or 'help' via WhatsApp"
Write-Host ""

# Cleanup
Remove-Item $tarball -ErrorAction SilentlyContinue
