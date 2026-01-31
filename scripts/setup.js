#!/usr/bin/env node
/**
 * ClawdBot Interactive Setup Script
 * Helps users configure their environment variables
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Helper functions for colored output
const log = {
  info: (msg) => console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[OK]${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  title: (msg) => console.log(`\n${colors.bright}${colors.magenta}${msg}${colors.reset}\n`),
  hint: (msg) => console.log(`${colors.dim}  ${msg}${colors.reset}`)
};

// Paths
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const ENV_FILE = path.join(CONFIG_DIR, '.env.local');
const ENV_EXAMPLE = path.join(CONFIG_DIR, '.env.example');

// Configuration schema with validation rules
const configSchema = [
  {
    key: 'ANTHROPIC_API_KEY',
    prompt: 'Enter your Anthropic API Key',
    hint: 'Get it from: https://console.anthropic.com/',
    required: true,
    validate: (val) => {
      if (!val) return 'API key is required';
      if (!val.startsWith('sk-ant-')) return 'Anthropic API keys start with "sk-ant-"';
      if (val.length < 40) return 'API key seems too short';
      return null;
    },
    mask: true
  },
  {
    key: 'TWILIO_ACCOUNT_SID',
    prompt: 'Enter your Twilio Account SID',
    hint: 'Get it from: https://console.twilio.com',
    required: true,
    validate: (val) => {
      if (!val) return 'Account SID is required';
      if (!val.startsWith('AC')) return 'Twilio Account SID must start with "AC"';
      if (val.length !== 34) return 'Twilio Account SID should be 34 characters';
      return null;
    }
  },
  {
    key: 'TWILIO_AUTH_TOKEN',
    prompt: 'Enter your Twilio Auth Token',
    hint: 'Found on same page as Account SID',
    required: true,
    validate: (val) => {
      if (!val) return 'Auth token is required';
      if (val.length !== 32) return 'Twilio Auth Token should be 32 characters';
      return null;
    },
    mask: true
  },
  {
    key: 'TWILIO_WHATSAPP_NUMBER',
    prompt: 'Enter your Twilio WhatsApp Number',
    hint: 'Format: +14155238886 (Twilio sandbox number)',
    required: true,
    default: '+14155238886',
    validate: (val) => {
      if (!val) return 'WhatsApp number is required';
      if (!val.match(/^\+\d{10,15}$/)) return 'Phone number must be in format +1234567890';
      return null;
    }
  },
  {
    key: 'YOUR_WHATSAPP',
    prompt: 'Enter YOUR WhatsApp Number (bot will only respond to this)',
    hint: 'Include country code, e.g., +447700123456',
    required: true,
    validate: (val) => {
      if (!val) return 'Your WhatsApp number is required';
      if (!val.match(/^\+\d{10,15}$/)) return 'Phone number must be in format +1234567890';
      return null;
    }
  },
  {
    key: 'GITHUB_TOKEN',
    prompt: 'Enter your GitHub Personal Access Token',
    hint: 'Create at: https://github.com/settings/tokens (scopes: repo, workflow)',
    required: true,
    validate: (val) => {
      if (!val) return 'GitHub token is required';
      if (!val.startsWith('ghp_') && !val.startsWith('github_pat_')) {
        return 'GitHub tokens start with "ghp_" or "github_pat_"';
      }
      return null;
    },
    mask: true
  },
  {
    key: 'GITHUB_USERNAME',
    prompt: 'Enter your GitHub Username',
    hint: 'Your GitHub account username',
    required: true,
    validate: (val) => {
      if (!val) return 'GitHub username is required';
      if (!val.match(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/)) {
        return 'Invalid GitHub username format';
      }
      return null;
    }
  },
  {
    key: 'REPOS_TO_MONITOR',
    prompt: 'Enter repositories to monitor',
    hint: 'Comma-separated list, e.g., repo1,repo2,repo3',
    required: false,
    default: '',
    validate: (val) => {
      if (val && val.includes(' ')) {
        return 'Separate repos with commas only, no spaces';
      }
      return null;
    }
  }
];

// Optional configuration
const optionalSchema = [
  {
    key: 'BRAVE_API_KEY',
    prompt: 'Enter Brave Search API Key (optional - for research)',
    hint: 'Get free key at: https://brave.com/search/api/',
    required: false,
    mask: true
  },
  {
    key: 'OPENWEATHER_API_KEY',
    prompt: 'Enter OpenWeatherMap API Key (optional - for morning brief)',
    hint: 'Get free key at: https://openweathermap.org/api',
    required: false,
    mask: true
  }
];

class SetupWizard {
  constructor() {
    this.rl = null;
    this.config = {};
  }

  async run() {
    this.printBanner();

    // Check prerequisites
    await this.checkPrerequisites();

    // Initialize config from existing .env or example
    await this.initializeConfig();

    // Create readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      // Collect required configuration
      log.title('REQUIRED CONFIGURATION');
      for (const field of configSchema) {
        await this.promptField(field);
      }

      // Ask about optional configuration
      const setupOptional = await this.askYesNo(
        '\nWould you like to configure optional features (Brave Search, Weather)?'
      );

      if (setupOptional) {
        log.title('OPTIONAL CONFIGURATION');
        log.hint('Press Enter to skip any optional field\n');
        for (const field of optionalSchema) {
          await this.promptField(field);
        }
      }

      // Write configuration to .env file
      await this.writeEnvFile();

      // Test connections
      log.title('TESTING CONNECTIONS');
      await this.testConnections();

      // Print success message and next steps
      this.printNextSteps();

    } finally {
      this.rl.close();
    }
  }

  printBanner() {
    console.log(`
${colors.cyan}${colors.bright}
   _____ _                     _ ____        _
  / ____| |                   | |  _ \\      | |
 | |    | | __ ___      _____| | |_) | ___ | |_
 | |    | |/ _\` \\ \\ /\\ / / _  | |  _ < / _ \\| __|
 | |____| | (_| |\\ V  V / (_| | | |_) | (_) | |_
  \\_____|_|\\__,_| \\_/\\_/ \\__,_|_|____/ \\___/ \\__|
${colors.reset}
${colors.dim}  WhatsApp-controlled AI Coding Assistant${colors.reset}
${colors.dim}  Interactive Setup Wizard${colors.reset}
`);
  }

  async checkPrerequisites() {
    log.title('CHECKING PREREQUISITES');

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    if (majorVersion >= 18) {
      log.success(`Node.js ${nodeVersion} detected`);
    } else {
      log.error(`Node.js 18+ required, found ${nodeVersion}`);
      process.exit(1);
    }

    // Check if config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      log.info('Creating config directory...');
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      log.success('Config directory created');
    }

    // Check if .env.example exists
    if (!fs.existsSync(ENV_EXAMPLE)) {
      log.warn('.env.example not found, will create .env from scratch');
    } else {
      log.success('.env.example template found');
    }
  }

  async initializeConfig() {
    // If .env.local already exists, load existing values as defaults
    if (fs.existsSync(ENV_FILE)) {
      log.info('Found existing .env.local, loading current values as defaults');
      const content = fs.readFileSync(ENV_FILE, 'utf8');
      this.parseEnvFile(content);
    } else if (fs.existsSync(ENV_EXAMPLE)) {
      log.info('Copying template from .env.example');
      const content = fs.readFileSync(ENV_EXAMPLE, 'utf8');
      this.parseEnvFile(content);
    }
  }

  parseEnvFile(content) {
    const lines = content.split('\n');
    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || !line.includes('=')) continue;
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      // Only store if it's not a placeholder value
      if (value && !value.includes('your_') && !value.includes('_here')) {
        this.config[key.trim()] = value;
      }
    }
  }

  async promptField(field) {
    const currentValue = this.config[field.key];
    const defaultValue = currentValue || field.default || '';

    let promptText = `${colors.bright}${field.prompt}${colors.reset}`;
    if (defaultValue && !field.mask) {
      promptText += ` ${colors.dim}[${defaultValue}]${colors.reset}`;
    } else if (currentValue && field.mask) {
      promptText += ` ${colors.dim}[****configured****]${colors.reset}`;
    }
    promptText += ': ';

    if (field.hint) {
      log.hint(field.hint);
    }

    let value;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      value = await this.question(promptText);

      // Use default if empty
      if (!value && defaultValue) {
        value = defaultValue;
      }

      // Skip optional fields if empty
      if (!value && !field.required) {
        console.log();
        return;
      }

      // Validate
      if (field.validate) {
        const error = field.validate(value);
        if (error) {
          log.error(error);
          attempts++;
          if (attempts < maxAttempts) {
            log.warn(`Please try again (${maxAttempts - attempts} attempts remaining)`);
          }
          continue;
        }
      }

      break;
    }

    if (attempts >= maxAttempts) {
      log.error(`Too many failed attempts for ${field.key}`);
      if (field.required) {
        process.exit(1);
      }
      return;
    }

    this.config[field.key] = value;
    log.success(`${field.key} configured`);
    console.log();
  }

  question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  async askYesNo(prompt) {
    const answer = await this.question(`${prompt} ${colors.dim}(y/N)${colors.reset}: `);
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  async writeEnvFile() {
    log.title('WRITING CONFIGURATION');

    // Read the example file to preserve comments and structure
    let template = '';
    if (fs.existsSync(ENV_EXAMPLE)) {
      template = fs.readFileSync(ENV_EXAMPLE, 'utf8');
    }

    // Replace placeholders with actual values
    let output = template;
    for (const [key, value] of Object.entries(this.config)) {
      // Replace the line containing this key
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (output.match(regex)) {
        output = output.replace(regex, `${key}=${value}`);
      } else {
        // Add to end if not in template
        output += `\n${key}=${value}`;
      }
    }

    // Write the file
    fs.writeFileSync(ENV_FILE, output);
    log.success(`Configuration written to ${ENV_FILE}`);
  }

  async testConnections() {
    // Test GitHub API
    if (this.config.GITHUB_TOKEN) {
      process.stdout.write('Testing GitHub connection... ');
      try {
        const result = await this.testGitHubConnection();
        if (result.success) {
          log.success(`Connected as ${result.username}`);
        } else {
          log.warn(result.error);
        }
      } catch (error) {
        log.error(`Failed: ${error.message}`);
      }
    }

    // Test Anthropic API (just validate key format)
    if (this.config.ANTHROPIC_API_KEY) {
      process.stdout.write('Validating Anthropic API key... ');
      if (this.config.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
        log.success('Key format valid');
      } else {
        log.warn('Key format may be incorrect');
      }
    }

    // Test Twilio credentials format
    if (this.config.TWILIO_ACCOUNT_SID && this.config.TWILIO_AUTH_TOKEN) {
      process.stdout.write('Validating Twilio credentials... ');
      if (this.config.TWILIO_ACCOUNT_SID.startsWith('AC') &&
          this.config.TWILIO_ACCOUNT_SID.length === 34 &&
          this.config.TWILIO_AUTH_TOKEN.length === 32) {
        log.success('Credentials format valid');
      } else {
        log.warn('Credentials format may be incorrect');
      }
    }
  }

  testGitHubConnection() {
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: '/user',
        method: 'GET',
        headers: {
          'Authorization': `token ${this.config.GITHUB_TOKEN}`,
          'User-Agent': 'ClawdBot-Setup',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const user = JSON.parse(data);
              resolve({ success: true, username: user.login });
            } catch {
              resolve({ success: false, error: 'Invalid response' });
            }
          } else if (res.statusCode === 401) {
            resolve({ success: false, error: 'Invalid token or insufficient permissions' });
          } else {
            resolve({ success: false, error: `HTTP ${res.statusCode}` });
          }
        });
      });

      req.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      req.setTimeout(10000, () => {
        req.destroy();
        resolve({ success: false, error: 'Connection timeout' });
      });

      req.end();
    });
  }

  printNextSteps() {
    console.log(`
${colors.green}${colors.bright}
========================================
  SETUP COMPLETE!
========================================
${colors.reset}

${colors.cyan}Next Steps:${colors.reset}

1. ${colors.bright}Install dependencies:${colors.reset}
   cd 02-whatsapp-bot && npm install

2. ${colors.bright}Start the bot locally:${colors.reset}
   npm run dev

3. ${colors.bright}Configure Twilio Webhook:${colors.reset}
   - Go to: https://console.twilio.com
   - Set webhook URL to: https://YOUR_SERVER/webhook
   - Use ngrok for local testing: npx ngrok http 3000

4. ${colors.bright}Test via WhatsApp:${colors.reset}
   - Send "join <sandbox-keyword>" to your Twilio number
   - Then send "status" to test the bot

${colors.dim}Configuration saved to: ${ENV_FILE}${colors.reset}

${colors.yellow}Need help? Check the docs:${colors.reset}
  - README.md for overview
  - docs/setup-guide.md for detailed setup
  - docs/troubleshooting.md for common issues

`);
  }
}

// Run the setup wizard
const wizard = new SetupWizard();
wizard.run().catch((error) => {
  log.error(`Setup failed: ${error.message}`);
  process.exit(1);
});
