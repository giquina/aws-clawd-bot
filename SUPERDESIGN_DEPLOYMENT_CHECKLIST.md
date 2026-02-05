# SuperDesign Skill Deployment Checklist

## Pre-Deployment Verification

### ✅ Local Testing

- [x] Skill loads without syntax errors
- [x] Test script passes all checks
- [x] Commands pattern matching works
- [x] Repo path mapping verified
- [x] Context detection working
- [x] Error/success messages formatted correctly
- [x] Help command returns formatted text
- [x] Dev mode simulation works

### ✅ Code Quality

- [x] No syntax errors (`node -c skills/superdesign/index.js`)
- [x] Follows ClawdBot skill patterns
- [x] Extends BaseSkill correctly
- [x] Proper error handling implemented
- [x] JSDoc comments added
- [x] Code is well-organized

### ✅ Documentation

- [x] README.md created (321 lines)
- [x] Quick reference guide created (316 lines)
- [x] Implementation summary created
- [x] In-code comments complete
- [x] Usage examples documented
- [x] Troubleshooting guide included

### ✅ Configuration

- [x] Added to `skills.json` enabled array
- [x] Configuration section added to `skills.json`
- [x] All required parameters documented
- [x] Default values set appropriately

## Deployment Steps

### Step 1: Commit Changes

```bash
# Navigate to project root
cd C:\Giquina-Projects\aws-clawd-bot

# Stage files
git add 02-bot/skills/superdesign/
git add 02-bot/skills/skills.json
git add 02-bot/scripts/test-superdesign-skill.js
git add docs/skills/SUPERDESIGN_QUICK_REFERENCE.md
git add SUPERDESIGN_SKILL_IMPLEMENTATION.md
git add SUPERDESIGN_DEPLOYMENT_CHECKLIST.md

# Verify staged files
git status

# Commit
git commit -m "feat: add SuperDesign skill for AI-powered design generation

- Implement SuperDesign wrapper skill with voice support
- Auto-repo detection via chat-registry
- Progress updates via status-messenger
- Auto-install @superdesign/cli if missing
- Comprehensive documentation and quick reference
- Test script with 100% pass rate

Commands:
- superdesign init
- superdesign help
- design <description>
- help me design <what>

Integration:
- Chat registry for auto-repo detection
- Status messenger for progress updates
- BaseSkill patterns for consistency
- Voice command support via Telegram

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to repository
git push origin master
```

**Verification:**
- [ ] Changes committed successfully
- [ ] Push completed without errors
- [ ] GitHub shows new commit

### Step 2: Deploy to EC2

```bash
# Option 1: Quick deploy (git pull + restart)
./deploy.sh

# Option 2: Full deploy (git pull + npm install + restart) - RECOMMENDED
./deploy.sh full

# Option 3: Manual deploy (if deploy script issues)
aws ec2-instance-connect send-ssh-public-key \
  --instance-id i-009f070a76a0d91c1 \
  --instance-os-user ubuntu \
  --ssh-public-key file://~/.ssh/clawd-bot-key.pem.pub \
  --region eu-north-1

ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 << 'EOF'
cd /opt/clawd-bot
git pull
npm install
pm2 restart clawd-bot
EOF
```

**Verification:**
- [ ] Deployment completed successfully
- [ ] No error messages during deploy
- [ ] PM2 restart successful

### Step 3: First-Time SuperDesign Setup (EC2)

```bash
# SSH to EC2
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151

# Login to SuperDesign CLI (interactive)
npx @superdesign/cli login

# Follow prompts:
# 1. Enter email/credentials
# 2. Confirm authentication
# 3. Verify login successful

# Verify login
npx @superdesign/cli whoami

# Exit SSH
exit
```

**Verification:**
- [ ] Login command completed successfully
- [ ] `whoami` shows authenticated user
- [ ] No error messages

### Step 4: Verify Bot Restart

```bash
# Check PM2 status
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 "pm2 status"

# View recent logs
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 "pm2 logs clawd-bot --lines 50"

# Check for skill loading
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151 "pm2 logs clawd-bot --lines 200 | grep -i superdesign"
```

**Expected Log Output:**
```
[Registry] Loaded skill: superdesign
[Skill:superdesign] Skill "superdesign" initialized
[Registry] Initialized with 58 skill(s)  # Or current total
```

**Verification:**
- [ ] PM2 shows clawd-bot as "online"
- [ ] No error messages in logs
- [ ] Skill loaded successfully

### Step 5: Test via Telegram

#### Test 1: Help Command

```
You: superdesign help
Bot: 🎨 **SuperDesign - AI Design System**
     ━━━━━━━━━━━━━━━━━━━━

     SuperDesign uses AI to generate production-ready design systems...

     **Commands:**
     • `superdesign init` - Initialize for current repo
     ...
```

**Verification:**
- [ ] Bot responds within 2 seconds
- [ ] Help message formatted correctly
- [ ] All commands listed

#### Test 2: Init Command (from JUDO group or with context)

```
You: superdesign init
Bot: ⏳ **WORKING...**
     I'm now initializing SuperDesign

     • Checking SuperDesign CLI installation
     • Verifying authentication
     • Analyzing repository structure
     • Generating design system configuration

     ⏱️ Estimated time: 2-5 minutes

[Wait 2-5 minutes]

Bot: ✅ **COMPLETE**
     SuperDesign initialized for JUDO

     **Next steps:**
     You can now use design commands like:
     • design a login page
     • design a dashboard layout
     • superdesign help
```

**Verification:**
- [ ] Bot sends "WORKING" message immediately
- [ ] Progress indicators shown
- [ ] Completion message received
- [ ] No error messages

#### Test 3: Design Command

```
You: design a simple button component
Bot: ⏳ **WORKING...**
     I'm now designing "a simple button component" for JUDO

     • Analyzing design requirements
     • Generating component structure
     • Creating design tokens
     • Writing documentation

     ⏱️ Estimated time: 3-10 minutes

[Wait 3-10 minutes]

Bot: ✅ **COMPLETE**
     Design generated for "a simple button component" in JUDO

     **Next steps:**
     Review the generated components and commit to your repository:
     • git status
     • git add .
     • git commit -m "feat: add generated design components"
```

**Verification:**
- [ ] Bot sends "WORKING" message immediately
- [ ] Progress indicators shown
- [ ] Completion message received
- [ ] No error messages
- [ ] Files generated in repo

#### Test 4: Voice Command

```
You: [Send voice note] "help me design a login page"
Bot: [Transcription via Whisper]
     "help me design a login page"

Bot: ⏳ **WORKING...**
     I'm now designing "a login page" for JUDO
     ...
```

**Verification:**
- [ ] Voice note transcribed correctly
- [ ] Command recognized and routed to SuperDesign
- [ ] Design workflow started

### Step 6: Error Handling Tests

#### Test: Unknown Repository

```
You: [From non-registered chat] superdesign init
Bot: ✗ No repository context
     Reason: Could not determine which repository to initialize
     Suggestion: Try running this command from a registered Telegram group
```

**Verification:**
- [ ] Error message clear and actionable
- [ ] Suggestion provided

#### Test: Not Authenticated (if logged out)

```bash
# On EC2, logout
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151
npx @superdesign/cli logout
exit

# Then test
You: superdesign init
Bot: ✗ SuperDesign not authenticated
     Reason: You need to login to SuperDesign first
     Suggestion: Run: npx @superdesign/cli login
```

**Verification:**
- [ ] Error detected correctly
- [ ] Clear instructions provided
- [ ] Re-login after test

## Post-Deployment Monitoring

### Hour 1: Immediate Monitoring

```bash
# Watch logs in real-time
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151
pm2 logs clawd-bot --lines 200 | grep -i superdesign

# Check for errors
pm2 logs clawd-bot --err --lines 100
```

**Monitor for:**
- [ ] Skill loading errors
- [ ] Command routing issues
- [ ] CLI execution failures
- [ ] Memory leaks
- [ ] Timeout errors

### Day 1: Usage Monitoring

```bash
# Check skill usage stats
# (If analytics skill available)
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151
pm2 logs clawd-bot --lines 500 | grep "SuperDesign" | wc -l

# Check PM2 status
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151
pm2 status
pm2 monit
```

**Monitor for:**
- [ ] Successful executions
- [ ] Error rates
- [ ] Response times
- [ ] Memory usage
- [ ] CPU usage

### Week 1: Performance Review

**Metrics to Track:**
- Total SuperDesign commands executed
- Success rate (successful / total)
- Average execution time (init vs generate)
- Error types and frequencies
- User feedback

**Action Items:**
- [ ] Review logs for patterns
- [ ] Optimize timeout values if needed
- [ ] Update documentation based on user feedback
- [ ] Fix any discovered bugs

## Rollback Plan

If issues occur, rollback to previous version:

```bash
# SSH to EC2
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151

# Navigate to repo
cd /opt/clawd-bot

# Show recent commits
git log --oneline -5

# Rollback to previous commit
git reset --hard <previous-commit-hash>

# Restart bot
pm2 restart clawd-bot

# Verify
pm2 logs clawd-bot --lines 50
```

**When to Rollback:**
- Bot crashes repeatedly
- Critical errors affecting other skills
- SuperDesign CLI conflicts with other systems
- Memory/CPU usage spikes

## Success Criteria

Deployment is successful when:

- [x] **Code Quality**: All tests pass, no syntax errors
- [ ] **Deployment**: Code deployed to EC2 successfully
- [ ] **Authentication**: SuperDesign CLI authenticated
- [ ] **Bot Health**: ClawdBot running without errors
- [ ] **Skill Loading**: SuperDesign skill loaded and registered
- [ ] **Command Routing**: All 4 commands working correctly
- [ ] **Voice Support**: Voice commands recognized
- [ ] **Error Handling**: Errors caught and reported clearly
- [ ] **Integration**: chat-registry and status-messenger working
- [ ] **User Feedback**: No complaints, positive responses

## Troubleshooting Guide

### Issue: Skill Not Loading

**Symptoms:**
- Skill not in skill registry
- Commands not recognized
- No logs about SuperDesign

**Solutions:**
1. Check `skills.json` has "superdesign" in enabled array
2. Verify `skills/superdesign/index.js` exists
3. Check file permissions on EC2
4. Review PM2 logs for loading errors
5. Restart bot: `pm2 restart clawd-bot`

### Issue: CLI Not Found

**Symptoms:**
- "Command not found: @superdesign/cli"
- Installation fails

**Solutions:**
1. Check npm permissions: `npm config get prefix`
2. Install manually: `npm install -g @superdesign/cli`
3. Verify PATH includes npm global bin
4. Check network connectivity
5. Try local install in repo: `npm install @superdesign/cli`

### Issue: Authentication Failing

**Symptoms:**
- "Not logged in" errors
- `whoami` returns error

**Solutions:**
1. Run login manually: `npx @superdesign/cli login`
2. Check credentials file: `~/.superdesign/`
3. Verify API endpoint reachable
4. Check firewall rules
5. Try re-authentication

### Issue: Timeout Errors

**Symptoms:**
- "Command timed out after Xs"
- Incomplete generations

**Solutions:**
1. Increase timeout in `skills.json`
2. Check EC2 resources: `top`, `free -h`, `df -h`
3. Simplify design prompts
4. Check network latency
5. Verify SuperDesign API status

### Issue: No Repository Context

**Symptoms:**
- "Could not determine which repository"
- Works in one chat but not another

**Solutions:**
1. Use command from registered Telegram group
2. Set active project first
3. Check chat-registry: `list chats`
4. Register chat if needed
5. Manually specify repo (if supported)

## Support Contacts

**Technical Issues:**
- Check logs: `pm2 logs clawd-bot | grep SuperDesign`
- Review docs: `02-bot/skills/superdesign/README.md`
- Quick ref: `docs/skills/SUPERDESIGN_QUICK_REFERENCE.md`

**SuperDesign API:**
- SuperDesign documentation
- SuperDesign support channels
- API status page

**ClawdBot:**
- GitHub issues
- Project maintainer
- Development team

## Final Checklist

Before marking deployment complete:

- [ ] All pre-deployment checks passed
- [ ] Code committed and pushed to GitHub
- [ ] Deployed to EC2 successfully
- [ ] SuperDesign CLI authenticated
- [ ] Bot restarted and healthy
- [ ] Skill loaded and registered
- [ ] All 4 commands tested successfully
- [ ] Voice command tested
- [ ] Error handling verified
- [ ] Documentation complete
- [ ] Team notified of new skill
- [ ] Usage monitoring in place
- [ ] Rollback plan documented

## Deployment Sign-Off

**Deployed By:** _________________

**Date:** _________________

**Deployment Method:** ☐ Quick ☐ Full ☐ Manual

**Tests Passed:** ___ / 8

**Issues Encountered:**

_______________________________________

_______________________________________

**Notes:**

_______________________________________

_______________________________________

**Status:** ☐ Success ☐ Partial ☐ Failed

---

**Last Updated**: February 5, 2026
**Version**: 1.0.0
**ClawdBot Version**: 2.5
