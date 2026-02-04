/**
 * Command Whitelist Utility for Remote Exec Skill
 *
 * Provides security controls for remote command execution on EC2.
 * Only whitelisted commands can be executed, with project-scoped paths.
 *
 * @module lib/command-whitelist
 */

/**
 * Known project repositories and their paths on EC2
 */
const KNOWN_PROJECTS = {
  'aws-clawd-bot': '/opt/clawd-bot',
  'clawd-bot': '/opt/clawd-bot',
  'judo': '/opt/projects/JUDO',
  'lusotown': '/opt/projects/LusoTown',
  'armora': '/opt/projects/armora',
  'gqcars-manager': '/opt/projects/gqcars-manager',
  'gq-cars-driver-app': '/opt/projects/gq-cars-driver-app',
  'giquina-accountancy-direct-filing': '/opt/projects/giquina-accountancy-direct-filing',
  'giquina-accountancy': '/opt/projects/giquina-accountancy-direct-filing',
  'giquina-website': '/opt/projects/giquina-website',
  'gq-cars': '/opt/projects/gq-cars',
  'giquina-portal': '/opt/projects/giquina-portal',
  'moltbook': '/opt/projects/moltbook',
};

/**
 * Allowed commands with their configurations
 * Each command has:
 *   - pattern: RegExp to match the command
 *   - timeout: max execution time in ms
 *   - requiresConfirmation: whether user must confirm before execution
 *   - description: human-readable description
 */
const ALLOWED_COMMANDS = {
  // NPM commands
  'npm test': {
    pattern: /^npm\s+test$/i,
    timeout: 60000,
    requiresConfirmation: false,
    description: 'Run test suite'
  },
  'npm run test': {
    pattern: /^npm\s+run\s+test$/i,
    timeout: 60000,
    requiresConfirmation: false,
    description: 'Run test suite'
  },
  'npm install': {
    pattern: /^npm\s+install$/i,
    timeout: 120000,
    requiresConfirmation: true,
    description: 'Install dependencies'
  },
  'npm ci': {
    pattern: /^npm\s+ci$/i,
    timeout: 120000,
    requiresConfirmation: false,
    description: 'Clean install dependencies'
  },
  'npm run build': {
    pattern: /^npm\s+run\s+build$/i,
    timeout: 120000,
    requiresConfirmation: false,
    description: 'Build the project'
  },
  'npm run lint': {
    pattern: /^npm\s+run\s+lint$/i,
    timeout: 30000,
    requiresConfirmation: false,
    description: 'Run linter'
  },
  'npm run dev': {
    pattern: /^npm\s+run\s+dev$/i,
    timeout: 10000,
    requiresConfirmation: true,
    description: 'Start dev server (will timeout)'
  },
  'npm start': {
    pattern: /^npm\s+start$/i,
    timeout: 10000,
    requiresConfirmation: true,
    description: 'Start application (will timeout)'
  },

  // Claude Code CLI
  'claude-code': {
    pattern: /^claude-code\s+--task\s+".+"\s+--repo\s+\S+$/i,
    timeout: 1800000,  // 30 minutes
    requiresConfirmation: true,
    description: 'Run Claude Code autonomous session'
  },
  'claude-code status': {
    pattern: /^claude-code\s+--status\s+\S+$/i,
    timeout: 5000,
    requiresConfirmation: false,
    description: 'Check Claude Code session status'
  },
  'claude-code cancel': {
    pattern: /^claude-code\s+--cancel\s+\S+$/i,
    timeout: 5000,
    requiresConfirmation: false,
    description: 'Cancel Claude Code session'
  },

  // PM2 commands
  'pm2 restart': {
    pattern: /^pm2\s+restart\s+[\w-]+$/i,
    timeout: 30000,
    requiresConfirmation: true,
    description: 'Restart PM2 process'
  },
  'pm2 stop': {
    pattern: /^pm2\s+stop\s+[\w-]+$/i,
    timeout: 10000,
    requiresConfirmation: true,
    description: 'Stop PM2 process'
  },
  'pm2 start': {
    pattern: /^pm2\s+start\s+[\w-]+$/i,
    timeout: 30000,
    requiresConfirmation: true,
    description: 'Start PM2 process'
  },
  'pm2 logs': {
    pattern: /^pm2\s+logs\s+[\w-]+(\s+--lines\s+\d+)?$/i,
    timeout: 10000,
    requiresConfirmation: false,
    description: 'View PM2 logs'
  },
  'pm2 status': {
    pattern: /^pm2\s+(status|list|ls)$/i,
    timeout: 5000,
    requiresConfirmation: false,
    description: 'View PM2 status'
  },

  // Git commands (read-only)
  'git status': {
    pattern: /^git\s+status$/i,
    timeout: 10000,
    requiresConfirmation: false,
    description: 'View git status'
  },
  'git log': {
    pattern: /^git\s+log\s+(-\d+|--oneline)?(\s+-\d+)?$/i,
    timeout: 10000,
    requiresConfirmation: false,
    description: 'View git log'
  },
  'git branch': {
    pattern: /^git\s+branch(\s+-a)?$/i,
    timeout: 5000,
    requiresConfirmation: false,
    description: 'List branches'
  },
  'git pull': {
    pattern: /^git\s+pull$/i,
    timeout: 60000,
    requiresConfirmation: true,
    description: 'Pull latest changes'
  },

  // Deploy script
  'deploy': {
    pattern: /^\.\/deploy\.sh$/i,
    timeout: 180000,
    requiresConfirmation: true,
    description: 'Run deploy script'
  },
  'bash deploy': {
    pattern: /^bash\s+deploy\.sh$/i,
    timeout: 180000,
    requiresConfirmation: true,
    description: 'Run deploy script'
  },

  // System info (safe)
  'pwd': {
    pattern: /^pwd$/i,
    timeout: 5000,
    requiresConfirmation: false,
    description: 'Print working directory'
  },
  'ls': {
    pattern: /^ls(\s+-la?)?$/i,
    timeout: 5000,
    requiresConfirmation: false,
    description: 'List directory contents'
  },
  'df': {
    pattern: /^df\s+-h$/i,
    timeout: 5000,
    requiresConfirmation: false,
    description: 'Show disk space'
  },
  'free': {
    pattern: /^free\s+-h$/i,
    timeout: 5000,
    requiresConfirmation: false,
    description: 'Show memory usage'
  },
  'uptime': {
    pattern: /^uptime$/i,
    timeout: 5000,
    requiresConfirmation: false,
    description: 'Show system uptime'
  },

  // Health checks
  'curl health': {
    pattern: /^curl\s+(-s\s+)?localhost:\d+\/health$/i,
    timeout: 10000,
    requiresConfirmation: false,
    description: 'Health check endpoint'
  },

  // Vercel deploy
  'vercel deploy': {
    pattern: /^vercel\s+--prod(\s+--token\s+\S+)?$/i,
    timeout: 180000,
    requiresConfirmation: true,
    description: 'Deploy to Vercel production'
  },
  'vercel preview': {
    pattern: /^vercel(\s+--token\s+\S+)?$/i,
    timeout: 180000,
    requiresConfirmation: false,
    description: 'Deploy Vercel preview'
  },

  // Docker commands
  'docker ps': {
    pattern: /^docker\s+ps(\s+-a)?(\s+--format\s+".+")?$/i,
    timeout: 10000,
    requiresConfirmation: false,
    description: 'List Docker containers'
  },
  'docker logs': {
    pattern: /^docker\s+logs(\s+--tail\s+\d+)?\s+[\w-]+$/i,
    timeout: 30000,
    requiresConfirmation: false,
    description: 'View container logs'
  },
  'docker stats': {
    pattern: /^docker\s+stats(\s+--no-stream)?(\s+--format\s+".+")?$/i,
    timeout: 15000,
    requiresConfirmation: false,
    description: 'Show container resource usage'
  },
  'docker restart': {
    pattern: /^docker\s+restart\s+[\w-]+$/i,
    timeout: 30000,
    requiresConfirmation: true,
    description: 'Restart a Docker container'
  },
  'docker inspect': {
    pattern: /^docker\s+inspect\s+[\w-]+$/i,
    timeout: 10000,
    requiresConfirmation: false,
    description: 'Inspect container details'
  }
};

/**
 * Dangerous patterns that are NEVER allowed
 */
const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,
  /rm\s+-r/i,
  /rm\s+\*/i,
  /:\(\)\s*\{\s*:\|:/i,  // Fork bomb
  />\s*\/dev\/sd/i,      // Disk overwrite
  /dd\s+if=/i,           // Direct disk write
  /mkfs/i,               // Format disk
  /chmod\s+-R\s+777/i,   // Dangerous permissions
  /wget.*\|.*sh/i,       // Curl pipe to shell
  /curl.*\|.*sh/i,       // Wget pipe to shell
  /eval\s*\(/i,          // Eval
  /\$\(.*\)/i,           // Command substitution
  /`.*`/i,               // Backtick execution
  /;\s*rm/i,             // Chained rm
  /&&\s*rm/i,            // Chained rm
  /\|\s*rm/i,            // Piped rm
  /sudo\s+su/i,          // Privilege escalation
  /passwd/i,             // Password change
  /useradd/i,            // User management
  /userdel/i,
  /groupadd/i,
  /chown\s+-R/i,         // Recursive ownership
  /iptables/i,           // Firewall
  /systemctl\s+stop/i,   // System services
  /service.*stop/i,
  /shutdown/i,
  /reboot/i,
  /init\s+\d/i,
  />\s*\/etc\//i,        // Write to /etc
  />\s*\/var\//i,        // Write to /var
  /\.\.\//i              // Path traversal
];

/**
 * Check if a command is allowed
 * @param {string} command - The command to check
 * @param {string} repoName - The repository/project name
 * @returns {{allowed: boolean, config?: object, reason?: string}}
 */
function isCommandAllowed(command, repoName) {
  // Trim and normalize
  const normalizedCommand = command.trim();

  // Check for dangerous patterns first
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(normalizedCommand)) {
      return {
        allowed: false,
        reason: 'Command contains dangerous patterns and is blocked for security'
      };
    }
  }

  // Check if project is known
  if (!KNOWN_PROJECTS[repoName]) {
    return {
      allowed: false,
      reason: `Unknown project: ${repoName}. Known projects: ${Object.keys(KNOWN_PROJECTS).join(', ')}`
    };
  }

  // Check against whitelist
  for (const [name, config] of Object.entries(ALLOWED_COMMANDS)) {
    if (config.pattern.test(normalizedCommand)) {
      return {
        allowed: true,
        config: {
          name,
          ...config
        }
      };
    }
  }

  return {
    allowed: false,
    reason: `Command not in whitelist. Allowed commands: ${getAllowedCommands().join(', ')}`
  };
}

/**
 * Get list of all allowed command names
 * @returns {string[]}
 */
function getAllowedCommands() {
  return Object.keys(ALLOWED_COMMANDS);
}

/**
 * Get detailed list of allowed commands with descriptions
 * @returns {Array<{name: string, description: string, requiresConfirmation: boolean}>}
 */
function getAllowedCommandsDetailed() {
  return Object.entries(ALLOWED_COMMANDS).map(([name, config]) => ({
    name,
    description: config.description,
    requiresConfirmation: config.requiresConfirmation,
    timeout: config.timeout
  }));
}

/**
 * Check if a command requires user confirmation
 * @param {string} command - The command to check
 * @returns {boolean}
 */
function requiresConfirmation(command) {
  const normalizedCommand = command.trim();

  for (const config of Object.values(ALLOWED_COMMANDS)) {
    if (config.pattern.test(normalizedCommand)) {
      return config.requiresConfirmation;
    }
  }

  // Unknown commands require confirmation by default
  return true;
}

/**
 * Get the timeout for a command
 * @param {string} command - The command
 * @returns {number} - Timeout in milliseconds
 */
function getCommandTimeout(command) {
  const normalizedCommand = command.trim();

  for (const config of Object.values(ALLOWED_COMMANDS)) {
    if (config.pattern.test(normalizedCommand)) {
      return config.timeout;
    }
  }

  // Default timeout
  return 30000;
}

/**
 * Get the safe execution path for a repository
 * @param {string} repoName - The repository name
 * @returns {{path: string, valid: boolean, error?: string}}
 */
function getProjectPath(repoName) {
  const normalizedName = repoName.toLowerCase().trim();

  if (KNOWN_PROJECTS[normalizedName]) {
    return {
      path: KNOWN_PROJECTS[normalizedName],
      valid: true
    };
  }

  // Check for partial matches
  for (const [name, path] of Object.entries(KNOWN_PROJECTS)) {
    if (name.includes(normalizedName) || normalizedName.includes(name)) {
      return {
        path,
        valid: true,
        matched: name
      };
    }
  }

  return {
    path: null,
    valid: false,
    error: `Unknown project: ${repoName}`,
    knownProjects: Object.keys(KNOWN_PROJECTS)
  };
}

/**
 * Add a new project to the known projects list (runtime only)
 * @param {string} name - Project name
 * @param {string} path - Project path
 */
function addProject(name, path) {
  KNOWN_PROJECTS[name.toLowerCase()] = path;
}

/**
 * Sanitize command arguments to prevent injection
 * @param {string} arg - The argument to sanitize
 * @returns {string}
 */
function sanitizeArgument(arg) {
  // Remove any shell metacharacters
  return arg
    .replace(/[;&|`$(){}[\]<>]/g, '')
    .replace(/\.\./g, '')
    .trim();
}

/**
 * Build a safe command string
 * @param {string} baseCommand - The base command (e.g., 'npm')
 * @param {string[]} args - Command arguments
 * @returns {string}
 */
function buildSafeCommand(baseCommand, args = []) {
  const safeArgs = args.map(sanitizeArgument).filter(a => a);
  return [baseCommand, ...safeArgs].join(' ');
}

module.exports = {
  isCommandAllowed,
  getAllowedCommands,
  getAllowedCommandsDetailed,
  requiresConfirmation,
  getCommandTimeout,
  getProjectPath,
  addProject,
  sanitizeArgument,
  buildSafeCommand,
  KNOWN_PROJECTS,
  ALLOWED_COMMANDS,
  DANGEROUS_PATTERNS
};
