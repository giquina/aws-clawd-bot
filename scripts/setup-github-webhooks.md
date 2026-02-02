# GitHub Webhooks Setup Guide

## Overview

ClawdBot can receive real-time notifications from GitHub for:
- Failed CI/CD runs
- New pull requests
- New issues
- Push events
- Releases

## Webhook Endpoint

```
http://16.171.150.151:3000/github-webhook
```

## Setup Instructions

### For Each Repository

1. Go to your repository on GitHub
2. Click **Settings** > **Webhooks** > **Add webhook**
3. Configure:
   - **Payload URL**: `http://16.171.150.151:3000/github-webhook`
   - **Content type**: `application/json`
   - **Secret**: (leave empty or set `GITHUB_WEBHOOK_SECRET` in .env)
   - **SSL verification**: Disable (HTTP endpoint)
   - **Which events**: Select individual events:
     - `Workflow runs` (for CI/CD alerts)
     - `Pull requests` (for PR notifications)
     - `Issues` (for issue alerts)
     - `Pushes` (for commit notifications)
     - `Releases` (for release alerts)
4. Click **Add webhook**

### Using GitHub CLI (faster)

```bash
# Install gh if not already
# https://cli.github.com/

# For each repo, run:
gh api repos/giquina/REPO_NAME/hooks --method POST \
  --field name=web \
  --field active=true \
  --field events='["workflow_run","pull_request","issues","push","release"]' \
  --field 'config[url]=http://16.171.150.151:3000/github-webhook' \
  --field 'config[content_type]=json' \
  --field 'config[insecure_ssl]=1'
```

## Repositories to Configure

Run for each of these repos:

```bash
# Core repos
gh api repos/giquina/aws-clawd-bot/hooks --method POST --field name=web --field active=true --field events='["workflow_run","pull_request","issues","push"]' --field 'config[url]=http://16.171.150.151:3000/github-webhook' --field 'config[content_type]=json' --field 'config[insecure_ssl]=1'

gh api repos/giquina/giquina-accountancy-direct-filing/hooks --method POST --field name=web --field active=true --field events='["workflow_run","pull_request","issues","push"]' --field 'config[url]=http://16.171.150.151:3000/github-webhook' --field 'config[content_type]=json' --field 'config[insecure_ssl]=1'

gh api repos/giquina/LusoTown/hooks --method POST --field name=web --field active=true --field events='["workflow_run","pull_request","issues","push"]' --field 'config[url]=http://16.171.150.151:3000/github-webhook' --field 'config[content_type]=json' --field 'config[insecure_ssl]=1'

gh api repos/giquina/JUDO/hooks --method POST --field name=web --field active=true --field events='["workflow_run","pull_request","issues","push"]' --field 'config[url]=http://16.171.150.151:3000/github-webhook' --field 'config[content_type]=json' --field 'config[insecure_ssl]=1'

gh api repos/giquina/GQCars/hooks --method POST --field name=web --field active=true --field events='["workflow_run","pull_request","issues","push"]' --field 'config[url]=http://16.171.150.151:3000/github-webhook' --field 'config[content_type]=json' --field 'config[insecure_ssl]=1'
```

## Verify Setup

After configuring, test by:

1. Making a commit to any configured repo
2. Check WhatsApp for notification
3. Or check EC2 logs: `pm2 logs clawd-bot --lines 20`

## Events Received

| GitHub Event | WhatsApp Alert |
|--------------|----------------|
| `workflow_run` (failed) | "CI failed on [branch]" |
| `pull_request` (opened) | "PR opened #42: Title" |
| `issues` (opened) | "Issue opened #10: Bug report" |
| `push` | "Push: 3 commits to main" |
| `release` | "Release published: v1.2.3" |

## Troubleshooting

### Webhook not receiving events
1. Check GitHub webhook delivery log (Settings > Webhooks > Recent Deliveries)
2. Verify EC2 security group allows inbound on port 3000
3. Check bot is running: `pm2 status clawd-bot`

### Webhook receiving but no WhatsApp message
1. Check `YOUR_WHATSAPP` is set correctly in .env
2. Check Twilio credentials are valid
3. Check logs for errors: `pm2 logs clawd-bot`
