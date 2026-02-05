# ClawdBot Telegram Communication & MCP Issues - Analysis & Solutions

**Date:** 2026-02-05
**Status:** In Progress

---

## Executive Summary

Your ClawdBot has two main issues affecting user experience:

1. **MCP Server Error**: The "clawdbot" MCP server shows disconnection errors in Claude Code interface
2. **Telegram Communication**: Messages don't clearly indicate when bot is waiting for approval vs. actively working

This document provides diagnosis and actionable fixes for both issues.

---

## Issue 1: MCP Server Disconnection Error

### What's Happening

The Claude Code interface shows:
```
MCP clawdbot: Server disconnected. For troubleshooting guidance, please visit our debugging documentation
```

### Root Cause Analysis

**The "clawdbot" MCP server DOES NOT EXIST in your ClawdBot project.**

Looking at your codebase:
- ✅ ClawdBot is a **Telegram/WhatsApp bot** that runs as an Express server on AWS EC2
- ✅ It has a REST API at `/api/*` endpoints
- ❌ It does NOT have an MCP (Model Context Protocol) server implementation
- ❌ There is NO `.mcp.json` file or MCP server entry point in the project

### Why The Error Appears

You likely have a stale/broken MCP server configuration in Claude Code that references "clawdbot" as an MCP server. This could be from:
1. A previous experiment or test
2. Manual configuration that points to a non-existent server
3. A plugin that tried to register ClawdBot as an MCP server

### Solution: Remove Stale MCP Configuration

**Option A: Via Claude Code CLI (Recommended)**
```bash
# Check MCP servers currently registered
claude mcp list

# Remove the clawdbot entry if it exists
claude mcp remove clawdbot
```

**Option B: Manual Configuration Edit**

The MCP server configuration is likely in one of these files:
- `C:\Users\Owner\.claude\settings.json`
- `C:\Users\Owner\.claude\mcp-servers.json`
- `C:\Giquina-Projects\aws-clawd-bot\.claude\settings.json`

**Action:** Search for "clawdbot" in these files and remove the entry.

**Option C: If You WANT ClawdBot as an MCP Server**

If you want Claude Code to access ClawdBot's API as an MCP server (this is OPTIONAL), you would need to:

1. **Create MCP server wrapper** at `02-bot/mcp-server.js`:
```javascript
#!/usr/bin/env node
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const axios = require('axios');

const CLAWDBOT_API = process.env.CLAWDBOT_API_URL || 'http://16.171.150.151:3000';
const API_KEY = process.env.CLAWDBOT_API_KEY;

const server = new Server({
  name: 'clawdbot',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {}
  }
});

// Define tools that wrap ClawdBot API
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'clawdbot_status',
      description: 'Get ClawdBot status',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'clawdbot_message',
      description: 'Send message to ClawdBot and get response',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message to send' },
          chatId: { type: 'string', description: 'Telegram chat ID (optional)' }
        },
        required: ['message']
      }
    }
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'clawdbot_status') {
      const response = await axios.get(`${CLAWDBOT_API}/api/status`, {
        headers: { 'X-API-Key': API_KEY }
      });
      return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
    }

    if (name === 'clawdbot_message') {
      const response = await axios.post(`${CLAWDBOT_API}/api/message`, {
        message: args.message,
        chatId: args.chatId || process.env.TELEGRAM_HQ_CHAT_ID
      }, {
        headers: { 'X-API-Key': API_KEY }
      });
      return { content: [{ type: 'text', text: response.data.reply }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport);
```

2. **Add to Claude Code MCP config** (`~/.claude/mcp-servers.json` or project settings):
```json
{
  "mcpServers": {
    "clawdbot": {
      "command": "node",
      "args": ["C:/Giquina-Projects/aws-clawd-bot/02-bot/mcp-server.js"],
      "env": {
        "CLAWDBOT_API_URL": "http://16.171.150.151:3000",
        "CLAWDBOT_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

3. **Install MCP SDK**:
```bash
cd 02-bot
npm install @modelcontextprotocol/sdk
```

**My Recommendation:** Unless you have a specific need to control ClawdBot FROM Claude Code (which seems circular), just remove the stale config and ignore the error.

---

## Issue 2: Telegram Communication - Unclear Status Messages

### Problem Statement

From your message:
> "when no tasks have actually been executed and is waiting for me to confirm or approve it should let me know so i dont assume it has started work but it hasnt"

**Current Behavior:**
- Bot proposes an action
- Waits for "yes"/"no" confirmation
- User is unsure if bot is working or waiting

**From Telegram screenshots:**
- Bot says "Analyzing plan and determining file operations..."
- Bot says "Target: judo-app | 7 file operation(s)"
- Then shows "Execution failed: Not Found"
- User gets confused: Did it fail mid-execution or before starting?

### Root Cause

Looking at `lib/confirmation-manager.js`, the confirmation system is well-designed BUT the **message formatting doesn't make it clear when approval is needed**.

Current confirmation messages (line 279-314):
```javascript
return `Confirm ${action}? Reply "yes" to proceed or "no" to cancel.`;
```

This is too subtle! Users skim messages and miss the question.

### Solution: Enhanced Telegram Status Messages

**Three improvements needed:**

#### 1. **Visual Status Indicators**

Add emojis and formatting to make status UNMISTAKABLE:

| Status | Prefix | Example |
|--------|--------|---------|
| Waiting for Approval | ⚠️ **APPROVAL NEEDED** | ⚠️ **APPROVAL NEEDED**<br>Deploy JUDO to production?<br><br>Reply "yes" to proceed or "no" to cancel |
| Working | ⏳ **WORKING...** | ⏳ **WORKING...**<br>Deploying JUDO to production |
| Completed | ✅ **COMPLETE** | ✅ **COMPLETE**<br>JUDO deployed successfully |
| Failed | ❌ **FAILED** | ❌ **FAILED**<br>Deployment error: Not Found |
| Info/Status | ℹ️ | ℹ️ Analyzing project structure... |

#### 2. **Explicit State Messages**

Before ANY long-running operation, send a "Starting work" message:

```
⏳ WORKING ON YOUR REQUEST

I'm now executing the following:
• Analyze judo-app structure
• Generate bottom navigation code
• Create Git branch
• Test changes

This may take 2-5 minutes. I'll update you on progress.
```

#### 3. **Progress Updates During Execution**

For operations taking >30 seconds, send interim updates:

```
⏳ Progress Update

✅ Analyzed judo-app structure
✅ Generated code for BottomNavigation.js
🔄 Creating Git branch...
⏸️ Pending: Tests and PR creation
```

---

## Implementation Plan

### Step 1: Update Confirmation Manager (lib/confirmation-manager.js)

**Modify `formatConfirmationRequest()` function** (line 279):

```javascript
function formatConfirmationRequest(action, params = {}) {
  const normalizedAction = (action || '').toLowerCase();
  const target = params.target || params.repo || params.project || params.name || '';

  // Build emoji-enhanced header
  let header = '⚠️ **APPROVAL NEEDED**\n\n';

  // Action-specific messages (add visual hierarchy)
  const messageTemplates = {
    'deploy': `Deploy ${target || 'this project'}? This will update the live server.`,
    'deploy-project': `Deploy ${target || 'this project'}? This will update the live server.`,
    'git pull': `Git pull for ${target || 'this project'}? This will fetch and merge remote changes.`,
    'pm2 restart': `Restart ${target || 'the application'}? This may cause brief downtime.`,
    'create-page': `Create new page "${params.pageName || target}"? This will add files to the project.`,
    'generate-image': `Generate image with prompt: "${params.prompt}"? Estimated cost: $${params.cost || '0.02'}.`,
    // ... (keep existing templates)
  };

  // Get specific or generic message
  let message;
  if (messageTemplates[normalizedAction]) {
    message = messageTemplates[normalizedAction];
  } else if (target) {
    message = `Execute ${action} for ${target}?`;
  } else {
    message = `Execute ${action}?`;
  }

  // Add footer with clear call-to-action
  const footer = '\n\n**Reply "yes" to proceed or "no" to cancel**\n⏱️ Expires in 5 minutes';

  return header + message + footer;
}
```

### Step 2: Add Status Update Helper (new file: lib/status-messenger.js)

Create a new utility for sending status updates:

```javascript
/**
 * Status Messenger
 * Sends clear, emoji-enhanced status updates to users via Telegram/WhatsApp
 */

const STATUS_TYPES = {
  APPROVAL_NEEDED: {
    emoji: '⚠️',
    prefix: '**APPROVAL NEEDED**',
    color: 'warning'
  },
  WORKING: {
    emoji: '⏳',
    prefix: '**WORKING...**',
    color: 'info'
  },
  PROGRESS: {
    emoji: '🔄',
    prefix: '**Progress Update**',
    color: 'info'
  },
  COMPLETE: {
    emoji: '✅',
    prefix: '**COMPLETE**',
    color: 'success'
  },
  FAILED: {
    emoji: '❌',
    prefix: '**FAILED**',
    color: 'error'
  },
  INFO: {
    emoji: 'ℹ️',
    prefix: '',
    color: 'neutral'
  }
};

/**
 * Format a status message with visual indicators
 * @param {string} type - Status type (APPROVAL_NEEDED, WORKING, etc.)
 * @param {string} message - Main message content
 * @param {Object} options - Additional options
 * @param {string[]} options.items - Bulleted list items
 * @param {string} options.footer - Footer text
 * @returns {string} Formatted message
 */
function formatStatusMessage(type, message, options = {}) {
  const status = STATUS_TYPES[type] || STATUS_TYPES.INFO;

  let formatted = '';

  // Header with emoji and prefix
  if (status.prefix) {
    formatted += `${status.emoji} ${status.prefix}\n\n`;
  } else {
    formatted += `${status.emoji} `;
  }

  // Main message
  formatted += message;

  // Bulleted list (if provided)
  if (options.items && options.items.length > 0) {
    formatted += '\n\n';
    formatted += options.items.map(item => `• ${item}`).join('\n');
  }

  // Footer (if provided)
  if (options.footer) {
    formatted += `\n\n${options.footer}`;
  }

  return formatted;
}

/**
 * Send a "starting work" message before long operations
 * @param {string} taskDescription - What the bot is about to do
 * @param {string[]} steps - List of steps to be executed
 * @param {string} estimatedTime - Estimated duration (e.g., "2-5 minutes")
 * @returns {string} Formatted message
 */
function startingWork(taskDescription, steps, estimatedTime) {
  return formatStatusMessage('WORKING', `I'm now ${taskDescription}`, {
    items: steps,
    footer: estimatedTime ? `⏱️ Estimated time: ${estimatedTime}` : undefined
  });
}

/**
 * Send a progress update during execution
 * @param {Object[]} tasks - Array of {description: string, status: 'done'|'current'|'pending'}
 * @returns {string} Formatted message
 */
function progressUpdate(tasks) {
  const items = tasks.map(task => {
    const emoji = task.status === 'done' ? '✅' : task.status === 'current' ? '🔄' : '⏸️';
    return `${emoji} ${task.description}`;
  });

  return formatStatusMessage('PROGRESS', 'Progress Update', { items });
}

/**
 * Send a completion message
 * @param {string} message - Success message
 * @param {Object} options - Additional options
 * @param {string} options.link - URL to result (e.g., PR link)
 * @param {string} options.nextSteps - What user should do next
 * @returns {string} Formatted message
 */
function complete(message, options = {}) {
  let formatted = formatStatusMessage('COMPLETE', message);

  if (options.link) {
    formatted += `\n\n🔗 ${options.link}`;
  }

  if (options.nextSteps) {
    formatted += `\n\n**Next steps:**\n${options.nextSteps}`;
  }

  return formatted;
}

/**
 * Send a failure message
 * @param {string} message - Error description
 * @param {string} suggestion - What user can do to fix it
 * @returns {string} Formatted message
 */
function failed(message, suggestion) {
  let formatted = formatStatusMessage('FAILED', message);

  if (suggestion) {
    formatted += `\n\n💡 **Suggestion:** ${suggestion}`;
  }

  return formatted;
}

module.exports = {
  STATUS_TYPES,
  formatStatusMessage,
  startingWork,
  progressUpdate,
  complete,
  failed
};
```

### Step 3: Integrate Status Messenger Into Voice/Plan Execution

**Update `lib/voice-flow.js`** (line ~200 where plan is proposed):

```javascript
// BEFORE execution starts
const startMessage = statusMessenger.startingWork(
  'executing your voice command',
  [
    'Transcribe voice note',
    'Understand your intent',
    'Generate implementation plan',
    'Execute changes',
    'Create GitHub PR'
  ],
  '3-10 minutes'
);
await telegramHandler.sendMessage(chatId, startMessage);

// During execution (add progress updates)
// After transcription
await telegramHandler.sendMessage(chatId,
  statusMessenger.formatStatusMessage('INFO', `Transcribed: "${transcribedText}"`)
);

// After intent classification
await telegramHandler.sendMessage(chatId,
  statusMessenger.formatStatusMessage('INFO', `Intent: ${intent.action} on ${intent.target}`)
);

// After plan generation
await telegramHandler.sendMessage(chatId,
  statusMessenger.formatStatusMessage('INFO', `Plan created. Requesting approval...`)
);
```

**Update `lib/plan-executor.js`** (line ~150 where execution happens):

```javascript
// When plan is being executed
const progressTasks = [
  { description: 'Analyze project structure', status: 'done' },
  { description: 'Generate code changes', status: 'current' },
  { description: 'Create Git branch', status: 'pending' },
  { description: 'Run tests', status: 'pending' },
  { description: 'Create PR', status: 'pending' }
];

// Send progress update every 30 seconds or after major milestones
await telegramHandler.sendMessage(chatId, statusMessenger.progressUpdate(progressTasks));
```

### Step 4: Update Main Message Handler (index.js)

**In `index.js` around line 800-900** (where messages are processed):

Add a check for pending confirmations and send clearer messages:

```javascript
// Check for pending confirmation FIRST
if (confirmationManager.hasPending(userId)) {
  const confirmationResponse = confirmationManager.isConfirmation(userMessage);

  if (confirmationResponse === 'yes') {
    const pending = confirmationManager.confirm(userId);

    // SEND "STARTING WORK" MESSAGE
    const statusMsg = statusMessenger.formatStatusMessage(
      'WORKING',
      `Starting: ${pending.action}`,
      { footer: 'I\'ll update you when complete' }
    );
    await messaging.sendMessage(platform, userId, statusMsg, { handlers });

    // NOW execute the action
    const result = await executeAction(pending);

    // Send result
    if (result.success) {
      await messaging.sendMessage(platform, userId,
        statusMessenger.complete(result.message, { link: result.prUrl }),
        { handlers }
      );
    } else {
      await messaging.sendMessage(platform, userId,
        statusMessenger.failed(result.error, result.suggestion),
        { handlers }
      );
    }
    return;
  } else if (confirmationResponse === 'no') {
    confirmationManager.cancel(userId);
    await messaging.sendMessage(platform, userId, '❌ Cancelled', { handlers });
    return;
  } else {
    // User sent something other than yes/no while confirmation is pending
    const pending = confirmationManager.getPending(userId);
    const reminderMsg = statusMessenger.formatStatusMessage(
      'APPROVAL_NEEDED',
      `Still waiting for your approval for: ${pending.action}`,
      { footer: 'Reply "yes" to proceed or "no" to cancel' }
    );
    await messaging.sendMessage(platform, userId, reminderMsg, { handlers });
    return;
  }
}
```

---

## Testing Plan

### Test Case 1: Confirmation Waiting State

**Scenario:** User asks bot to deploy JUDO via voice note

**Expected Flow:**
1. ⏳ **WORKING...** "Transcribing your voice note..."
2. ℹ️ "Transcribed: 'deploy judo to production'"
3. ℹ️ "Intent: deploy action on JUDO project"
4. ⚠️ **APPROVAL NEEDED**
   Deploy JUDO to production? This will update the live server.

   **Reply "yes" to proceed or "no" to cancel**
   ⏱️ Expires in 5 minutes

5. User replies: "yes"
6. ⏳ **WORKING...** "Starting deployment"
   • Git pull remote changes
   • Run build
   • Deploy to Vercel

   ⏱️ Estimated time: 2-5 minutes

7. 🔄 **Progress Update**
   • ✅ Git pull complete
   • ✅ Build successful
   • 🔄 Deploying to Vercel...
   • ⏸️ Pending: Smoke tests

8. ✅ **COMPLETE**
   JUDO deployed successfully

   🔗 https://judo-prod.vercel.app

   **Next steps:**
   • Verify deployment
   • Monitor logs for errors

### Test Case 2: User Sends Message While Confirmation Pending

**Scenario:** Bot waiting for approval, user sends unrelated message

**Expected:**
1. Bot has pending: "Deploy JUDO?"
2. User sends: "what's the weather?"
3. Bot replies: ⚠️ **APPROVAL NEEDED**
   Still waiting for your approval for: deploy JUDO

   **Reply "yes" to proceed or "no" to cancel**

### Test Case 3: Long-Running Task Progress

**Scenario:** Claude Code session (5-15 minutes)

**Expected:**
1. ⚠️ **APPROVAL NEEDED** (with cost estimate)
2. User: "yes"
3. ⏳ **WORKING...** (with step list + estimated time)
4. 🔄 **Progress Update** (every 60 seconds)
   - Show completed steps with ✅
   - Show current step with 🔄
   - Show pending steps with ⏸️
5. ✅ **COMPLETE** (with PR link)

---

## Deployment Steps

1. **Update confirmation-manager.js**
   - Modify `formatConfirmationRequest()` function
   - Add visual indicators
   - Test locally

2. **Create status-messenger.js**
   - Implement all formatting functions
   - Add unit tests

3. **Update voice-flow.js**
   - Add "starting work" message
   - Add progress updates
   - Test with voice notes

4. **Update index.js message handler**
   - Add clearer confirmation reminders
   - Send status messages before/after execution

5. **Deploy to EC2**
   ```bash
   ./deploy.sh full
   ```

6. **Test via Telegram**
   - Send voice note: "deploy judo"
   - Verify all status messages appear correctly
   - Confirm no ambiguity about bot state

---

## Quick Reference: Status Message Examples

```javascript
const statusMessenger = require('./lib/status-messenger');

// Waiting for approval
confirmationManager.formatConfirmationRequest('deploy', { target: 'JUDO' });
// ⚠️ **APPROVAL NEEDED**
// Deploy JUDO? This will update the live server.
// **Reply "yes" to proceed or "no" to cancel**
// ⏱️ Expires in 5 minutes

// Starting work
statusMessenger.startingWork('deploying JUDO', [
  'Git pull',
  'Build project',
  'Deploy to Vercel'
], '2-5 minutes');
// ⏳ **WORKING...**
// I'm now deploying JUDO
// • Git pull
// • Build project
// • Deploy to Vercel
// ⏱️ Estimated time: 2-5 minutes

// Progress update
statusMessenger.progressUpdate([
  { description: 'Git pull', status: 'done' },
  { description: 'Build', status: 'current' },
  { description: 'Deploy', status: 'pending' }
]);
// 🔄 **Progress Update**
// • ✅ Git pull
// • 🔄 Build
// • ⏸️ Deploy

// Complete
statusMessenger.complete('JUDO deployed', {
  link: 'https://judo-prod.vercel.app',
  nextSteps: 'Verify deployment and monitor logs'
});
// ✅ **COMPLETE**
// JUDO deployed
// 🔗 https://judo-prod.vercel.app
// **Next steps:**
// Verify deployment and monitor logs

// Failed
statusMessenger.failed('Deployment failed: Not Found', 'Check if JUDO repo exists on GitHub');
// ❌ **FAILED**
// Deployment failed: Not Found
// 💡 **Suggestion:** Check if JUDO repo exists on GitHub
```

---

## Summary

**MCP Issue:**
- ClawdBot is NOT an MCP server (it's a REST API bot)
- Remove stale "clawdbot" MCP config from Claude Code settings
- Optionally create MCP wrapper if you want Claude Code → ClawdBot integration

**Telegram Communication Issue:**
- Current messages don't clearly indicate "waiting for approval" vs "working"
- Solution: Add visual status indicators (emojis + bold headers)
- Implement status-messenger utility for consistent formatting
- Add progress updates during long-running operations

**Next Steps:**
1. Remove MCP config error
2. Implement status-messenger.js
3. Update confirmation-manager.js
4. Add status messages to voice-flow.js and index.js
5. Deploy and test

---

**Questions?**
- Need help implementing any of these changes?
- Want me to write the code for status-messenger.js?
- Need clarification on the MCP issue?

Let me know which part you'd like to tackle first!
