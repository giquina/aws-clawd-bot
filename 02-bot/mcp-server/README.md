# ClawdBot MCP Server

MCP (Model Context Protocol) server that exposes ClawdBot capabilities to Claude Code App, Claude Desktop, and other MCP clients.

## Features

Control your 24/7 WhatsApp bot from any MCP client:

| Tool | Description |
|------|-------------|
| `clawdbot_status` | Get bot status, uptime, features |
| `clawdbot_message` | Send message & get response (like WhatsApp) |
| `clawdbot_projects` | List all GitHub repos |
| `clawdbot_project_status` | Get TODO.md tasks for a repo |
| `clawdbot_deploy` | Trigger deployment |
| `clawdbot_command` | Run whitelisted commands (tests, build, logs) |
| `clawdbot_memory` | Get conversation history & facts |
| `clawdbot_whatsapp` | Send WhatsApp message directly |
| `clawdbot_skills` | List all available skills |

## Setup

### 1. Environment Variables

Set these before running:

```bash
export CLAWDBOT_URL=http://16.171.150.151:3000
export CLAWDBOT_API_KEY=your-api-key-here
```

### 2. Claude Desktop Configuration

Add to `~/.config/claude/claude_desktop_config.json` (macOS/Linux) or
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "clawdbot": {
      "command": "node",
      "args": ["C:/Giquina-Projects/aws-clawd-bot/02-whatsapp-bot/mcp-server/index.js"],
      "env": {
        "CLAWDBOT_URL": "http://16.171.150.151:3000",
        "CLAWDBOT_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 3. Claude Code App Configuration

Add to your MCP settings in Claude Code:

```json
{
  "mcpServers": {
    "clawdbot": {
      "command": "node",
      "args": ["/path/to/mcp-server/index.js"],
      "env": {
        "CLAWDBOT_URL": "http://16.171.150.151:3000",
        "CLAWDBOT_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Usage Examples

Once configured, you can use these tools in Claude:

```
"Check ClawdBot status"
→ Uses clawdbot_status tool

"What's on my TODO for aws-clawd-bot?"
→ Uses clawdbot_project_status tool

"Deploy the judo website"
→ Uses clawdbot_deploy tool

"Run tests on aws-clawd-bot"
→ Uses clawdbot_command with command=tests

"Send me a WhatsApp reminder about the meeting"
→ Uses clawdbot_whatsapp tool
```

## Security

- Always use a secure API key (set `CLAWDBOT_API_KEY` in .env on server)
- The API key must match between server and MCP config
- Destructive commands (deploy, restart) require confirmation via WhatsApp

## Architecture

```
Claude Desktop/App
       ↓
   MCP Protocol (stdio)
       ↓
   ClawdBot MCP Server (this)
       ↓
   HTTP API (index.js /api/*)
       ↓
   ClawdBot Core (skills, memory, AI)
       ↓
   WhatsApp (Twilio) / GitHub
```

## Testing

Test the MCP server directly:

```bash
# Start the server
node mcp-server/index.js

# In another terminal, send MCP messages:
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node mcp-server/index.js
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node mcp-server/index.js
```
