#!/usr/bin/env node
/**
 * ClawdBot MCP Server
 *
 * Exposes ClawdBot capabilities via Model Context Protocol (MCP)
 * for use with Claude Code App, Claude Desktop, and other MCP clients.
 *
 * Usage:
 *   node mcp-server/index.js
 *
 * Environment:
 *   CLAWDBOT_URL - Base URL of ClawdBot API (default: http://localhost:3000)
 *   CLAWDBOT_API_KEY - API key for authentication
 */

const readline = require('readline');

// Configuration
const CLAWDBOT_URL = process.env.CLAWDBOT_URL || 'http://16.171.150.151:3000';
const CLAWDBOT_API_KEY = process.env.CLAWDBOT_API_KEY || 'dev-key-change-me';

// Tool definitions
const tools = [
    {
        name: 'clawdbot_status',
        description: 'Get ClawdBot status including uptime, features, and statistics',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'clawdbot_message',
        description: 'Send a message to ClawdBot and get a response. Works just like sending a WhatsApp message.',
        inputSchema: {
            type: 'object',
            properties: {
                message: {
                    type: 'string',
                    description: 'The message to send to ClawdBot'
                }
            },
            required: ['message']
        }
    },
    {
        name: 'clawdbot_projects',
        description: 'List all GitHub projects/repos that ClawdBot can access',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'clawdbot_project_status',
        description: 'Get project status including TODO.md tasks for a specific repo',
        inputSchema: {
            type: 'object',
            properties: {
                repo: {
                    type: 'string',
                    description: 'Repository name (e.g., "aws-clawd-bot", "judo-website")'
                }
            },
            required: ['repo']
        }
    },
    {
        name: 'clawdbot_deploy',
        description: 'Trigger deployment for a project (requires confirmation in WhatsApp)',
        inputSchema: {
            type: 'object',
            properties: {
                repo: {
                    type: 'string',
                    description: 'Repository name to deploy'
                }
            },
            required: ['repo']
        }
    },
    {
        name: 'clawdbot_command',
        description: 'Run a whitelisted command on a project (tests, build, logs, restart)',
        inputSchema: {
            type: 'object',
            properties: {
                repo: {
                    type: 'string',
                    description: 'Repository name'
                },
                command: {
                    type: 'string',
                    description: 'Command to run (tests, build, logs, restart, status)'
                }
            },
            required: ['repo', 'command']
        }
    },
    {
        name: 'clawdbot_memory',
        description: 'Get conversation memory and saved facts from ClawdBot',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of messages to retrieve (default: 20)'
                }
            },
            required: []
        }
    },
    {
        name: 'clawdbot_whatsapp',
        description: 'Send a WhatsApp message directly through ClawdBot',
        inputSchema: {
            type: 'object',
            properties: {
                message: {
                    type: 'string',
                    description: 'Message to send via WhatsApp'
                }
            },
            required: ['message']
        }
    },
    {
        name: 'clawdbot_skills',
        description: 'List all available ClawdBot skills and their commands',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    }
];

// API helper
async function callApi(endpoint, method = 'GET', body = null) {
    const url = `${CLAWDBOT_URL}${endpoint}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': CLAWDBOT_API_KEY
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);
        return await response.json();
    } catch (error) {
        return { error: error.message };
    }
}

// Tool handlers
async function handleTool(name, args) {
    switch (name) {
        case 'clawdbot_status':
            return await callApi('/api/status');

        case 'clawdbot_message':
            return await callApi('/api/message', 'POST', { message: args.message });

        case 'clawdbot_projects':
            return await callApi('/api/projects');

        case 'clawdbot_project_status':
            return await callApi(`/api/project/${encodeURIComponent(args.repo)}/status`);

        case 'clawdbot_deploy':
            return await callApi(`/api/project/${encodeURIComponent(args.repo)}/deploy`, 'POST');

        case 'clawdbot_command':
            return await callApi(`/api/project/${encodeURIComponent(args.repo)}/command`, 'POST', {
                command: args.command
            });

        case 'clawdbot_memory':
            const limit = args.limit || 20;
            return await callApi(`/api/memory?limit=${limit}`);

        case 'clawdbot_whatsapp':
            return await callApi('/api/whatsapp/send', 'POST', { message: args.message });

        case 'clawdbot_skills':
            return await callApi('/api/skills');

        default:
            return { error: `Unknown tool: ${name}` };
    }
}

// MCP Protocol Implementation
class MCPServer {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });
    }

    send(response) {
        console.log(JSON.stringify(response));
    }

    async handleRequest(request) {
        const { method, id, params } = request;

        switch (method) {
            case 'initialize':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        protocolVersion: '2024-11-05',
                        capabilities: {
                            tools: {}
                        },
                        serverInfo: {
                            name: 'clawdbot-mcp',
                            version: '1.0.0'
                        }
                    }
                };

            case 'initialized':
                // No response needed for notification
                return null;

            case 'tools/list':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        tools
                    }
                };

            case 'tools/call':
                try {
                    const result = await handleTool(params.name, params.arguments || {});
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2)
                                }
                            ]
                        }
                    };
                } catch (error) {
                    return {
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -32000,
                            message: error.message
                        }
                    };
                }

            case 'ping':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {}
                };

            default:
                return {
                    jsonrpc: '2.0',
                    id,
                    error: {
                        code: -32601,
                        message: `Method not found: ${method}`
                    }
                };
        }
    }

    start() {
        // Log to stderr for debugging (stdout is for MCP protocol)
        console.error('[ClawdBot MCP] Server starting...');
        console.error(`[ClawdBot MCP] Connecting to: ${CLAWDBOT_URL}`);

        this.rl.on('line', async (line) => {
            try {
                const request = JSON.parse(line);
                const response = await this.handleRequest(request);

                if (response) {
                    this.send(response);
                }
            } catch (error) {
                console.error('[ClawdBot MCP] Parse error:', error.message);
            }
        });

        this.rl.on('close', () => {
            console.error('[ClawdBot MCP] Server shutting down');
            process.exit(0);
        });
    }
}

// Start the server
const server = new MCPServer();
server.start();
