# Open HTTPS Port (443) in AWS Security Group
# Run this script to enable HTTPS access to your ClawdBot server

param(
    [string]$Region = "eu-north-1",
    [string]$SecurityGroupId = "sg-020f8777970e10d21"
)

Write-Host "Opening HTTPS port (443) in security group..." -ForegroundColor Cyan

# Check if AWS CLI is installed
$awsCli = Get-Command aws -ErrorAction SilentlyContinue
if (-not $awsCli) {
    Write-Host "AWS CLI not found. Please install it from: https://aws.amazon.com/cli/" -ForegroundColor Red
    Write-Host ""
    Write-Host "MANUAL ALTERNATIVE:" -ForegroundColor Yellow
    Write-Host "1. Go to AWS Console: https://console.aws.amazon.com/ec2/" -ForegroundColor White
    Write-Host "2. Select region: $Region" -ForegroundColor White
    Write-Host "3. Go to Security Groups (left menu)" -ForegroundColor White
    Write-Host "4. Find security group: $SecurityGroupId" -ForegroundColor White
    Write-Host "5. Edit Inbound Rules -> Add Rule:" -ForegroundColor White
    Write-Host "   - Type: HTTPS" -ForegroundColor White
    Write-Host "   - Port: 443" -ForegroundColor White
    Write-Host "   - Source: 0.0.0.0/0 (or Anywhere-IPv4)" -ForegroundColor White
    Write-Host "6. Save rules" -ForegroundColor White
    exit 1
}

# Add HTTPS rule
try {
    aws ec2 authorize-security-group-ingress `
        --group-id $SecurityGroupId `
        --protocol tcp `
        --port 443 `
        --cidr 0.0.0.0/0 `
        --region $Region

    Write-Host "SUCCESS! HTTPS port 443 is now open." -ForegroundColor Green
    Write-Host ""
    Write-Host "Your HTTPS URL: https://13.49.238.243.nip.io" -ForegroundColor Cyan
    Write-Host "Test with: curl https://13.49.238.243.nip.io/health" -ForegroundColor White
}
catch {
    if ($_.Exception.Message -like "*already exists*") {
        Write-Host "Port 443 is already open in the security group." -ForegroundColor Yellow
    }
    else {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}
