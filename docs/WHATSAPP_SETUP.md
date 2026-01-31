# WhatsApp Setup Guide

How to connect your bot to WhatsApp using Twilio.

---

## Why Twilio?

WhatsApp doesn't allow bots to connect directly. You need an approved provider:
- **Twilio** (easiest, £3/month)
- **WhatsApp Business API** (free but complex setup)

We're using Twilio because it's beginner-friendly.

---

## Step 1: Create Twilio Account (5 minutes)

**1. Sign up:**
- Go to: https://www.twilio.com/try-twilio
- Enter email, create password
- Verify phone number

**2. Get free trial credit:**
- New accounts get £15 free credit
- Enough for ~5,000 messages
- No payment required initially

---

## Step 2: Enable WhatsApp Sandbox (3 minutes)

**1. Go to WhatsApp sandbox:**
https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn

**2. You'll see a screen like this:**
```
Join your sandbox by sending:
  join [code-here]
  
To: +1 415 523 8886
```

**3. On your phone:**
- Open WhatsApp
- Start chat with: `+1 415 523 8886`
- Send: `join [your-code]`

**4. You should get a reply:**
```
Congratulations! You can now use WhatsApp Sandbox.
Try sending: Hello
```

---

## Step 3: Get Your API Credentials (2 minutes)

**1. Go to Twilio Console:**
https://console.twilio.com

**2. Find these values:**
- **Account SID**: Starts with `AC...`
- **Auth Token**: Click "Show" to reveal

**3. Copy both to your `.env.local` file:**
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_NUMBER=+14155238886
```

**Note:** The WhatsApp number is always `+14155238886` for sandbox mode.

---

## Step 4: Configure Webhook (after deployment)

⚠️ **Do this AFTER deploying to AWS** (you need the EC2 IP first)

**1. Get your EC2 IP:**
After running deployment script, you'll see:
```
Your ClawdBot is now running at:
   Public IP: 54.123.456.789
   Webhook URL: http://54.123.456.789:3000/webhook
```

**2. Set up webhook:**
- Go to: https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox
- Find "When a message comes in"
- Set to: `http://YOUR_EC2_IP:3000/webhook`
- Method: `POST`
- Click **Save**

**Visual:**
```
┌─────────────────────────────────────────┐
│ When a message comes in                 │
│ [http://54.123.456.789:3000/webhook] ▼ │
│ HTTP POST                               │
└─────────────────────────────────────────┘
```

---

## Step 5: Test Your Setup (2 minutes)

**1. Send test message:**
On WhatsApp, send to `+1 415 523 8886`:
```
status
```

**2. Expected response (within 5-10 seconds):**
```
✅ ClawdBot is online!
Connected repos: 3
Uptime: 0h 5m
Memory: 45.23 MB
Ready to assist! 🤖
```

**3. If no response:**
- Check troubleshooting guide
- Verify webhook URL is correct
- Check bot logs: `docker logs clawd-bot`

---

## Understanding WhatsApp Limits

### Sandbox Mode (Free Trial)
- ✅ Perfect for testing
- ✅ Works immediately
- ❌ Only YOU can message the bot
- ❌ Expires after inactivity
- ❌ Shows "via Twilio Sandbox" in chats

### Production Mode (£3/month)
- ✅ Anyone can message your bot
- ✅ No expiration
- ✅ Your own phone number
- ❌ Requires verification (1-2 days)
- ❌ Costs £0.005 per message

**For personal use, sandbox mode is fine!**

---

## Upgrading to Production (Optional)

Only do this if you want others to use your bot.

**1. Request WhatsApp Business Account:**
- Go to: https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders
- Click "Request Access"
- Fill in business details
- Wait 1-2 days for approval

**2. Register your number:**
- Buy a Twilio number: ~£1/month
- Or use your existing number (may not work)

**3. Update webhook for production:**
- Same process as sandbox
- But use your new WhatsApp Sender number

---

## Common WhatsApp Issues

### "Message not delivered"
**Cause:** You haven't joined the sandbox
**Fix:** Send `join [code]` to +1 415 523 8886

### "No response from bot"
**Cause:** Webhook not configured
**Fix:** Check Step 4, verify webhook URL

### "Unauthorized" in logs
**Cause:** Messaging from different phone number
**Fix:** Update `YOUR_WHATSAPP` in `.env.local`

### Sandbox expired
**Cause:** No activity for 3 days
**Fix:** Rejoin by sending `join [code]` again

---

## Message Format Guidelines

**Commands (case-sensitive):**
```
status           → Bot health check
list repos       → Show all repos
analyze [repo]   → Analyze specific repo
fix bugs in [repo] → Find issues
```

**General queries:**
```
How do I set up CI/CD?
What's wrong with my code?
Create a new feature for armora
```

**Tip:** Keep messages under 300 characters for best results

---

## Security Notes

⚠️ **Your WhatsApp number is your password!**

The bot only responds to the number in `YOUR_WHATSAPP`.

**To change authorized number:**
```bash
ssh into EC2
cd /opt/clawd-bot
nano .env
# Change YOUR_WHATSAPP
docker-compose restart
```

**To add multiple numbers** (requires code change):
Edit `02-whatsapp-bot/index.js` and modify the authorization check.

---

## Cost Breakdown

### Sandbox Mode (Recommended)
- Twilio account: Free
- Messages: Free (using trial credit)
- **Total: £0/month**

### Production Mode
- Twilio number: £1/month
- Messages: £0.005 each
- Average usage: ~600 messages/month = £3
- **Total: £4/month**

---

## Monitoring Your Usage

**Check message count:**
- Go to: https://console.twilio.com/us1/monitor/logs/sms
- Filter by WhatsApp
- View sent/received messages

**Set up billing alerts:**
- Go to: https://console.twilio.com/us1/billing/notification-settings
- Set alert at £5, £10, £15
- Get email when threshold reached

---

## Alternative: WhatsApp Business API (Advanced)

If you don't want to pay Twilio:

**Pros:**
- Free messages (unlimited)
- Full control

**Cons:**
- Complex 2-3 day setup
- Need Facebook Business account
- Requires domain name
- More maintenance

**Not recommended for beginners.** Stick with Twilio sandbox mode.

---

## Next Steps

Once WhatsApp is working:
1. Try different commands
2. Test with your GitHub repos  
3. Customize bot responses (edit `ai-handler.js`)
4. Set up monitoring alerts

**Enjoy your 24/7 AI assistant! 🚀**

