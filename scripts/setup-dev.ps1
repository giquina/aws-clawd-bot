# ClawdBot Dev Environment Setup Script (Windows PowerShell)
# Run this on any new Windows computer to get full access

Write-Host "ClawdBot Dev Environment Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Check for AWS CLI
$awsInstalled = Get-Command aws -ErrorAction SilentlyContinue
if (-not $awsInstalled) {
    Write-Host "`nAWS CLI not found. Installing..." -ForegroundColor Yellow
    Write-Host "Option 1: Run 'winget install Amazon.AWSCLI'" -ForegroundColor White
    Write-Host "Option 2: Download from https://aws.amazon.com/cli/" -ForegroundColor White

    $install = Read-Host "Install via winget now? (y/n)"
    if ($install -eq 'y') {
        winget install Amazon.AWSCLI
        Write-Host "Please restart your terminal after installation." -ForegroundColor Yellow
        exit
    }
} else {
    Write-Host "AWS CLI found!" -ForegroundColor Green
}

# Configure AWS credentials
Write-Host "`nConfiguring AWS credentials..." -ForegroundColor Cyan
Write-Host "You'll need your AWS Access Key and Secret Key" -ForegroundColor White
Write-Host "Get them from: https://console.aws.amazon.com/iam/home#/security_credentials" -ForegroundColor Gray

aws configure set region eu-north-1
aws configure

# Test AWS connection
Write-Host "`nTesting AWS connection..." -ForegroundColor Cyan
$result = aws sts get-caller-identity 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "AWS credentials configured successfully!" -ForegroundColor Green
} else {
    Write-Host "AWS configuration failed. Check your credentials." -ForegroundColor Red
    exit
}

# Check for Session Manager plugin
Write-Host "`nChecking for Session Manager plugin..." -ForegroundColor Cyan
$ssmPlugin = Get-Command session-manager-plugin -ErrorAction SilentlyContinue
if (-not $ssmPlugin) {
    Write-Host "Session Manager plugin not installed." -ForegroundColor Yellow
    Write-Host "Download from: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html" -ForegroundColor White
    Write-Host "`nAfter installing, you can connect with:" -ForegroundColor Gray
    Write-Host "aws ssm start-session --target i-009f070a76a0d91c1 --region eu-north-1" -ForegroundColor White
}

# EC2 Instance Details
Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "EC2 Instance Details" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Instance ID: i-009f070a76a0d91c1" -ForegroundColor White
Write-Host "IP Address:  16.171.150.151" -ForegroundColor White
Write-Host "Region:      eu-north-1" -ForegroundColor White
Write-Host "User:        ubuntu" -ForegroundColor White
Write-Host "App Path:    /opt/clawd-bot/" -ForegroundColor White

# Test server health
Write-Host "`nTesting ClawdBot server..." -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Uri "http://16.171.150.151:3000/health" -TimeoutSec 5
    Write-Host "Server Status: $($health.status)" -ForegroundColor Green
    Write-Host "Uptime: $([math]::Round($health.uptime / 3600, 2)) hours" -ForegroundColor White
} catch {
    Write-Host "Server unreachable or error occurred" -ForegroundColor Red
}

# Quick Commands Reference
Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "Quick Commands" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "`nConnect via SSM (no SSH key needed):" -ForegroundColor Yellow
Write-Host "aws ssm start-session --target i-009f070a76a0d91c1 --region eu-north-1" -ForegroundColor White

Write-Host "`nConnect via SSH (needs key):" -ForegroundColor Yellow
Write-Host "ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151" -ForegroundColor White

Write-Host "`nView logs:" -ForegroundColor Yellow
Write-Host "pm2 logs clawd-bot --lines 50" -ForegroundColor White

Write-Host "`nRestart bot:" -ForegroundColor Yellow
Write-Host "pm2 restart clawd-bot" -ForegroundColor White

Write-Host "`n================================" -ForegroundColor Green
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
