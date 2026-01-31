# GitHub Repos to Monitor
GITHUB_USERNAME=giquina
REPOS_TO_MONITOR=armora,gqcars-manager,JUDO

# Llama Model Settings
LLAMA_MODEL=llama-3.2-1b
LLAMA_CONTEXT_SIZE=2048
```

**What do these mean?**
- **AWS keys**: Let us create servers on your AWS account
- **Twilio**: Routes WhatsApp messages to our bot
- **GitHub token**: Lets bot read/write code
- **Repos to monitor**: Which projects the bot watches

---

## Phase 3: AWS Deployment (15 minutes)

**1. Install AWS CLI (if not already installed)**

Download from: https://aws.amazon.com/cli/

Or use PowerShell:
```powershell
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi
```

Verify installation:
```powershell
aws --version
```

**2. Configure AWS CLI**
```powershell
aws configure
```

Enter when prompted:
- AWS Access Key ID: [from AWS console]
- AWS Secret Access Key: [from AWS console]  
- Default region: `eu-west-2` (London)
- Default output format: `json`

**3. Run the Deployment Script**
```powershell
cd C:\Giquina-Projects\aws-clawd-bot\scripts
.\deploy-to-aws.ps1
```

**What happens?**
- Creates an EC2 instance (tiny server)
- Installs Docker
- Downloads Llama AI model
- Starts the bot services
- Sets up auto-restart on reboot

This takes 10-15 minutes. You'll see progress messages.

---

## Phase 4: WhatsApp Connection (10 minutes)

**1. Get Twilio WhatsApp Sandbox**

- Go to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
- Send the join code from your phone to `+1 415 523 8886`
- Example: "join [your-code]"

**2. Configure Webhook**

After deployment completes, you'll get a URL like:
```
http://ec2-xx-xx-xx-xx.eu-west-2.compute.amazonaws.com:3000
```

In Twilio dashboard:
- Go to: https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox
- Set "When a message comes in" to:
  ```
  http://your-ec2-url:3000/webhook
  ```
- Save

**3. Test Your Bot**

Send a WhatsApp message to `+1 415 523 8886`:
```
status
```

You should get back:
```
✅ ClawdBot is online!
Connected repos: 3
Uptime: 2 minutes
```

---

## Phase 5: Verification (5 minutes)

**Test Each Component:**

**1. Test AI Response**
```
WhatsApp: hello
Bot: Hi! I'm your AI coding assistant. How can I help?
```

**2. Test GitHub Connection**
```
WhatsApp: list repos
Bot: Connected repos:
1. giquina/armora
2. giquina/gqcars-manager  
3. giquina/JUDO
```

**3. Test Code Analysis**
```
WhatsApp: analyze JUDO
Bot: 🔍 Analyzing JUDO...
```

