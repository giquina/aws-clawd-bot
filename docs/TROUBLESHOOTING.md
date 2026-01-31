 clawd-bot-sg
```

Should show port 3000 open to 0.0.0.0/0

**Test webhook URL directly:**
```bash
curl http://YOUR_EC2_IP:3000/health
```

Should return: `{"status":"online",...}`

**Update Twilio webhook:**
1. Go to: https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox
2. Set webhook to: `http://YOUR_EC2_IP:3000/webhook`
3. Save and test

---

## 3. Llama AI Not Working

**Symptoms:**
- Bot responds with "trouble connecting to my AI brain"
- Long delays before responses

**Solutions:**

**Check Llama container:**
```bash
docker logs clawd-llama --tail 50
```

**Restart Llama:**
```bash
docker restart clawd-llama
```

**Re-download model (if corrupted):**
```bash
docker exec -it clawd-llama ollama pull llama3.2:1b
```

**Test Llama directly:**
```bash
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2:1b",
  "prompt": "Hello, how are you?",
  "stream": false
}'
```

---

## 4. GitHub Commands Failing

**Symptoms:**
- "Failed to fetch repository list"
- "Check your GitHub token"

**Solutions:**

**Verify token has correct permissions:**
- Go to: https://github.com/settings/tokens
- Check token has: `repo`, `workflow`, `admin:org`

**Test token manually:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.github.com/user/repos
```

Should list your repos, not 401 error

**Update token in .env:**
```bash
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@YOUR_EC2_IP
cd /opt/clawd-bot
nano .env
# Update GITHUB_TOKEN
docker-compose restart
```

---

## 5. AWS Free Tier Exceeded

**Symptoms:**
- Getting charged unexpectedly
- AWS sends billing alerts

**Solutions:**

**Check current usage:**
```bash
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost
```

**Common causes:**
- Left instance running beyond 750 hours/month
- Using t2.small instead of t2.micro
- Excessive data transfer

**Fix:**
1. Stop instance when not needed:
   ```bash
   aws ec2 stop-instances --instance-ids i-XXXXXXXX
   ```

2. Downgrade to t2.micro:
   ```bash
   aws ec2 modify-instance-attribute \
     --instance-id i-XXXXXXXX \
     --instance-type t2.micro
   ```

---

## 6. Docker Issues

**Symptoms:**
- "docker: command not found"
- "Cannot connect to Docker daemon"

**Solutions:**

**Check Docker status:**
```bash
sudo systemctl status docker
```

**Restart Docker:**
```bash
sudo systemctl restart docker
```

**Re-install Docker:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

---

## 7. SSH Connection Failed

**Symptoms:**
- "Permission denied (publickey)"
- "Connection refused"

**Solutions:**

**Check key permissions:**
```bash
chmod 400 ~/.ssh/clawd-bot-key.pem
```

**Verify instance is running:**
```bash
aws ec2 describe-instances --instance-ids i-XXXXXXXX
```

**Try alternative SSH:**
```bash
ssh -i ~/.ssh/clawd-bot-key.pem -v ubuntu@YOUR_EC2_IP
```

The `-v` flag shows detailed connection info

---

## 8. Out of Memory

**Symptoms:**
- Bot crashes randomly
- "JavaScript heap out of memory"

**Solutions:**

**Check memory usage:**
```bash
docker stats
```

If clawd-bot uses >400MB, you have a leak

**Increase Node.js memory:**
Edit `package.json` in whatsapp-bot:
```json
"scripts": {
  "start": "node --max-old-space-size=512 index.js"
}
```

**Upgrade to t2.small (costs money after 12 months):**
```bash
aws ec2 modify-instance-attribute \
  --instance-id i-XXXXXXXX \
  --instance-type t2.small
```

---

## 9. Bot Commands Not Working

**Symptoms:**
- "status" works but other commands don't
- Getting generic AI responses instead of actions

**Solutions:**

**Check command format:**
```
✅ Correct: "list repos"
✅ Correct: "analyze JUDO"
❌ Wrong: "List repos"  (capital L)
❌ Wrong: "analyze judo" (lowercase repo name)
```

Commands are case-sensitive!

**Check repo names in .env:**
```bash
cat .env | grep REPOS_TO_MONITOR
```

Must match exactly: `armora`, not `Armora`

---

## 10. General Debugging Steps

**Always try these first:**

1. **Check bot health:**
   ```bash
   curl http://YOUR_EC2_IP:3000/health
   ```

2. **View live logs:**
   ```bash
   docker logs -f clawd-bot
   ```

3. **Restart everything:**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

4. **Check disk space:**
   ```bash
   df -h
   ```

5. **Check system resources:**
   ```bash
   htop
   ```

---

## Emergency Commands

**Nuclear option (rebuild from scratch):**
```bash
cd /opt/clawd-bot
docker-compose down -v  # Delete everything
docker system prune -a  # Clean Docker
docker-compose up -d    # Rebuild
```

**View all logs at once:**
```bash
docker-compose logs -f
```

**Get into container shell:**
```bash
docker exec -it clawd-bot bash
```

---

## Still Stuck?

1. Check AWS CloudWatch logs
2. Review Twilio logs at console.twilio.com
3. Test each component individually
4. Try deploying to fresh EC2 instance

**Common causes of "works locally but not on AWS":**
- Firewall/security group blocking ports
- Environment variables not set
- Docker not running on boot
- Instance type too small (use t2.micro minimum)

