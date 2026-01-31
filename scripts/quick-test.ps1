# Quick Start Script
# Run this after deployment to verify everything works

Write-Host "🔍 ClawdBot Health Check" -ForegroundColor Cyan
Write-Host ""

# Load config
$configPath = "..\config\.env.local"
if (-not (Test-Path $configPath)) {
    Write-Host "❌ Config file not found: $configPath" -ForegroundColor Red
    exit 1
}

# Get EC2 IP from config or prompt
$ec2Ip = Read-Host "Enter your EC2 Public IP"

Write-Host ""
Write-Host "Testing bot endpoints..." -ForegroundColor Yellow

# Test health endpoint
Write-Host "  1. Health check..." -NoNewline
try {
    $response = Invoke-RestMethod -Uri "http://${ec2Ip}:3000/health" -Method Get
    if ($response.status -eq "online") {
        Write-Host " ✅" -ForegroundColor Green
    } else {
        Write-Host " ❌ Unexpected response" -ForegroundColor Red
    }
} catch {
    Write-Host " ❌ Failed to connect" -ForegroundColor Red
    Write-Host "     Make sure bot is running and security group allows port 3000"
}

Write-Host ""
Write-Host "Checking Docker containers..." -ForegroundColor Yellow

# SSH and check containers
$sshKey = "$HOME\.ssh\clawd-bot-key.pem"
if (Test-Path $sshKey) {
    Write-Host "  2. Containers running..." -NoNewline
    try {
        $containers = ssh -i $sshKey -o StrictHostKeyChecking=no ubuntu@$ec2Ip "docker ps --format '{{.Names}}'" 2>$null
        if ($containers -match "clawd-bot" -and $containers -match "clawd-llama") {
            Write-Host " ✅" -ForegroundColor Green
        } else {
            Write-Host " ⚠️  Some containers missing" -ForegroundColor Yellow
        }
    } catch {
        Write-Host " ❌ SSH failed" -ForegroundColor Red
    }
} else {
    Write-Host "  2. Containers running... ⚠️  No SSH key found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "WhatsApp Test:" -ForegroundColor Yellow
Write-Host "  Send 'status' to +1 415 523 8886 via WhatsApp"
Write-Host "  You should get a response within 10 seconds"
Write-Host ""

Write-Host "Configuration URLs:" -ForegroundColor Cyan
Write-Host "  Twilio Webhook: http://${ec2Ip}:3000/webhook" -ForegroundColor White
Write-Host "  Health Check: http://${ec2Ip}:3000/health" -ForegroundColor White
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Configure Twilio webhook (see docs/WHATSAPP_SETUP.md)"
Write-Host "  2. Test via WhatsApp"
Write-Host "  3. Check logs: ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@$ec2Ip 'docker logs clawd-bot'"
Write-Host ""
