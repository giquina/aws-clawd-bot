/**
 * Project Creator Skill for ClawdBot
 *
 * Creates new GitHub repositories with full project scaffolding.
 * Uses Claude AI to generate project plans based on user descriptions.
 *
 * Commands:
 *   create new project <name>      - Create a new project with default template
 *   new project <name>             - Same as above
 *   create new repo <name>         - Create a new repository
 *   new repo <name>                - Same as above
 *   create app for <description>   - Create project from description (AI generates plan)
 *   new app for <description>      - Same as above
 *   approve / yes                  - Approve pending project plan
 *   reject / no                    - Reject pending project plan
 */

const BaseSkill = require('../base-skill');
const { Octokit } = require('@octokit/rest');
const Anthropic = require('@anthropic-ai/sdk');

class ProjectCreatorSkill extends BaseSkill {
  name = 'project-creator';
  description = 'Create new GitHub repositories with full project scaffolding';
  priority = 22;

  commands = [
    {
      pattern: /^(?:create\s+)?new\s+project\s+(.+)$/i,
      description: 'Create a new project with specified name',
      usage: 'create new project <name>'
    },
    {
      pattern: /^(?:create\s+)?new\s+repo\s+(.+)$/i,
      description: 'Create a new repository with specified name',
      usage: 'create new repo <name>'
    },
    {
      pattern: /^(?:create\s+)?(?:new\s+)?app\s+for\s+(.+)$/i,
      description: 'Create app from description (AI generates plan)',
      usage: 'create app for <description>'
    },
    {
      pattern: /^(?:let's|lets|i want to|can we|shall we|help me)\s+(?:build|create|make|start|scaffold)\s+(.+)$/i,
      description: 'Conversational project creation', usage: "let's build <description>"
    },
    {
      pattern: /^(?:i need|we need)\s+(?:a|an|to build|to create|to make)\s+(.+)$/i,
      description: 'Need-based project creation', usage: 'i need a <description>'
    },
    {
      pattern: /^(?:approve|yes)$/i,
      description: 'Approve pending project plan',
      usage: 'approve'
    },
    {
      pattern: /^(?:reject|no|cancel)$/i,
      description: 'Reject pending project plan',
      usage: 'reject'
    }
  ];

  // In-memory storage for pending plans (keyed by user phone number)
  pendingPlans = new Map();

  // Template definitions
  templates = {
    react: {
      name: 'React + Vite + Tailwind',
      files: this.getReactTemplate()
    },
    nextjs: {
      name: 'Next.js 14 + App Router',
      files: this.getNextJsTemplate()
    },
    express: {
      name: 'Express.js API',
      files: this.getExpressTemplate()
    },
    node: {
      name: 'Basic Node.js',
      files: this.getNodeTemplate()
    },
    python: {
      name: 'Python Project',
      files: this.getPythonTemplate()
    }
  };

  constructor(context = {}) {
    super(context);
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });
    this.username = process.env.GITHUB_USERNAME;
    this.anthropic = null;
  }

  /**
   * Initialize Anthropic client
   */
  initAnthropicClient() {
    if (!this.anthropic && process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }
    return this.anthropic;
  }

  /**
   * Execute the matched command
   */
  async execute(command, context) {
    const { raw } = this.parseCommand(command);
    const normalized = raw.toLowerCase().trim();
    const userId = context.from || 'default';

    try {
      // Clean up expired plans
      this.cleanupExpiredPlans();

      // Handle approve/reject commands
      if (/^(?:approve|yes)$/i.test(normalized)) {
        return await this.handleApprove(userId);
      }

      if (/^(?:reject|no|cancel)$/i.test(normalized)) {
        return await this.handleReject(userId);
      }

      // Handle conversational "let's build / i want to create" patterns
      const conversationalMatch = raw.match(/^(?:let's|lets|i want to|can we|shall we|help me)\s+(?:build|create|make|start|scaffold)\s+(.+)$/i);
      if (conversationalMatch) {
        return await this.handleConversationalCreate(conversationalMatch[1], context);
      }

      // Handle need-based "i need a / we need to build" patterns
      const needMatch = raw.match(/^(?:i need|we need)\s+(?:a|an|to build|to create|to make)\s+(.+)$/i);
      if (needMatch) {
        return await this.handleConversationalCreate(needMatch[1], context);
      }

      // Handle "create app for <description>" - AI-powered plan generation
      const appMatch = raw.match(/^(?:create\s+)?(?:new\s+)?app\s+for\s+(.+)$/i);
      if (appMatch) {
        return await this.handleCreateAppFor(appMatch[1], userId);
      }

      // Handle "create new project <name>" or "new project <name>"
      const projectMatch = raw.match(/^(?:create\s+)?new\s+project\s+(.+)$/i);
      if (projectMatch) {
        return await this.handleCreateProject(projectMatch[1], userId);
      }

      // Handle "create new repo <name>" or "new repo <name>"
      const repoMatch = raw.match(/^(?:create\s+)?new\s+repo\s+(.+)$/i);
      if (repoMatch) {
        return await this.handleCreateRepo(repoMatch[1], userId);
      }

      return this.error('Command not recognized. Try "create new project <name>" or "new app for <description>"');

    } catch (err) {
      this.log('error', 'Project creator command failed', err);
      return this.error(`Something went wrong: ${err.message}`);
    }
  }

  /**
   * Handle "create new project <name>" - create with default template
   */
  async handleCreateProject(nameInput, userId) {
    const repoName = this.toKebabCase(nameInput);

    // Generate a plan using the node template as default
    const plan = {
      repoName,
      description: `Project: ${nameInput}`,
      template: 'node',
      techStack: ['Node.js', 'npm'],
      folderStructure: ['src/', 'tests/', 'docs/'],
      initialFiles: ['README.md', 'package.json', '.gitignore'],
      hasCI: true,
      createdAt: Date.now(),
      expires: Date.now() + 30 * 60 * 1000 // 30 minutes
    };

    // Store pending plan
    this.pendingPlans.set(userId, plan);

    return this.success(this.formatPlanMessage(plan));
  }

  /**
   * Handle "create new repo <name>" - minimal repo creation
   */
  async handleCreateRepo(nameInput, userId) {
    const repoName = this.toKebabCase(nameInput);

    const plan = {
      repoName,
      description: `Repository: ${nameInput}`,
      template: 'minimal',
      techStack: [],
      folderStructure: [],
      initialFiles: ['README.md', '.gitignore'],
      hasCI: false,
      createdAt: Date.now(),
      expires: Date.now() + 30 * 60 * 1000
    };

    this.pendingPlans.set(userId, plan);

    return this.success(this.formatPlanMessage(plan));
  }

  /**
   * Handle conversational project creation (let's build / i need)
   * Asks clarifying questions before generating a full plan
   */
  async handleConversationalCreate(description, context) {
    // Start a designing session if conversation-session is available
    try {
      const conversationSession = require('../../lib/conversation-session');
      conversationSession.startSession(context.chatId, 'designing', {
        description,
        projectName: description.split(/\s+/).slice(0, 3).join('-').toLowerCase(),
      });
    } catch (e) { /* ignore */ }

    // Use AI to ask clarifying questions instead of immediately planning
    const response = `Got it — you want to build: *${description}*\n\n` +
      `Before I set this up, quick questions:\n` +
      `1. Scope — MVP/weekend project, or full production app?\n` +
      `2. Tech — any preferences? (React, Next.js, plain HTML, etc.)\n` +
      `3. Must-haves — any specific features right away?\n\n` +
      `Or just say "go ahead" and I'll pick sensible defaults.`;

    return this.success(response);
  }

  /**
   * Handle "create app for <description>" - AI-powered plan generation
   */
  async handleCreateAppFor(description, userId) {
    this.log('info', `Generating plan for: ${description}`);

    const client = this.initAnthropicClient();
    if (!client) {
      return this.error('AI service not configured. Please set ANTHROPIC_API_KEY.');
    }

    try {
      const plan = await this.generatePlanWithAI(description);
      plan.createdAt = Date.now();
      plan.expires = Date.now() + 30 * 60 * 1000;

      this.pendingPlans.set(userId, plan);

      return this.success(this.formatPlanMessage(plan));
    } catch (err) {
      this.log('error', 'AI plan generation failed', err);
      return this.error(`Failed to generate plan: ${err.message}`);
    }
  }

  /**
   * Generate project plan using Claude AI
   */
  async generatePlanWithAI(description) {
    // Inject quality standards into project planning
    let qualityContext = '';
    try {
      const dqf = require('../../lib/design-quality-framework');
      qualityContext = dqf.getQualityPromptInjection({ taskType: 'planning' });
    } catch (e) { /* framework not available */ }

    const systemPrompt = `You are a premium project architect. Generate a project plan that meets high quality standards.

Available templates:
- react: React + Vite + Tailwind (modern frontend with component architecture, accessibility, responsive design)
- nextjs: Next.js 14 + App Router (full-stack with SSR, Server Components, SEO-optimized)
- express: Express.js API (REST API with security middleware, structured routing, error handling)
- node: Basic Node.js (scripts, CLI tools, libraries with proper testing and linting)
- python: Python (scripts, data processing, APIs with type hints and testing)

QUALITY REQUIREMENTS:
- Include TypeScript configuration when applicable
- Include ESLint + Prettier for code quality
- Include testing framework (Jest/Vitest for JS, pytest for Python)
- Include CI/CD pipeline (GitHub Actions)
- Follow accessibility and responsive design standards for frontend projects
- Include security best practices (helmet, CORS, input validation for APIs)
${qualityContext ? `\n${qualityContext}` : ''}

Respond with a JSON object ONLY (no markdown, no explanation):
{
  "repoName": "kebab-case-name",
  "description": "Brief description (max 100 chars)",
  "template": "one of: react, nextjs, express, node, python",
  "techStack": ["array", "of", "technologies"],
  "folderStructure": ["src/", "tests/", "etc/"],
  "initialFiles": ["README.md", "package.json", ".gitignore"],
  "hasCI": true
}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Create a project plan for: ${description}`
      }]
    });

    const responseText = response.content[0].text.trim();

    // Parse JSON response
    try {
      const plan = JSON.parse(responseText);

      // Validate required fields
      if (!plan.repoName) {
        plan.repoName = this.toKebabCase(description.slice(0, 30));
      }
      if (!plan.template || !this.templates[plan.template]) {
        plan.template = 'node';
      }
      if (!Array.isArray(plan.techStack)) {
        plan.techStack = [];
      }
      if (!Array.isArray(plan.folderStructure)) {
        plan.folderStructure = [];
      }
      if (!Array.isArray(plan.initialFiles)) {
        plan.initialFiles = ['README.md', '.gitignore'];
      }

      return plan;
    } catch (parseErr) {
      this.log('warn', 'Failed to parse AI response as JSON', responseText);
      // Fallback to basic plan
      return {
        repoName: this.toKebabCase(description.slice(0, 30)),
        description: description.slice(0, 100),
        template: 'node',
        techStack: ['Node.js'],
        folderStructure: ['src/'],
        initialFiles: ['README.md', 'package.json', '.gitignore'],
        hasCI: true
      };
    }
  }

  /**
   * Format plan for WhatsApp display
   */
  formatPlanMessage(plan) {
    const templateName = this.templates[plan.template]?.name || plan.template;

    let msg = `*Project Plan*\n`;
    msg += `---\n\n`;
    msg += `*Repo:* \`${plan.repoName}\`\n`;
    msg += `*Template:* ${templateName}\n`;

    if (plan.description) {
      msg += `*Description:* ${plan.description}\n`;
    }

    if (plan.techStack && plan.techStack.length > 0) {
      msg += `*Tech Stack:* ${plan.techStack.join(', ')}\n`;
    }

    if (plan.folderStructure && plan.folderStructure.length > 0) {
      msg += `\n*Folder Structure:*\n`;
      plan.folderStructure.forEach(folder => {
        msg += `  - ${folder}\n`;
      });
    }

    if (plan.initialFiles && plan.initialFiles.length > 0) {
      msg += `\n*Initial Files:*\n`;
      plan.initialFiles.forEach(file => {
        msg += `  - ${file}\n`;
      });
    }

    if (plan.hasCI) {
      msg += `\n*GitHub Actions:* Yes (CI workflow included)\n`;
    }

    msg += `\n---\n`;
    msg += `Reply *approve* or *yes* to create this repo\n`;
    msg += `Reply *reject* or *no* to cancel\n`;
    msg += `\n_Plan expires in 30 minutes_`;

    return msg;
  }

  /**
   * Handle approve command
   */
  async handleApprove(userId) {
    const plan = this.pendingPlans.get(userId);

    if (!plan) {
      return this.error('No pending project plan. Say "create new project <name>" first.');
    }

    if (Date.now() > plan.expires) {
      this.pendingPlans.delete(userId);
      return this.error('Plan expired. Please create a new one.');
    }

    this.log('info', `Creating repo: ${plan.repoName}`);

    try {
      // Step 1: Create the repository
      await this.octokit.repos.createForAuthenticatedUser({
        name: plan.repoName,
        description: plan.description || `Created by ClawdBot`,
        private: false,
        auto_init: true
      });

      this.log('info', `Repo created: ${plan.repoName}`);

      // Step 2: Create files based on template
      const files = this.getFilesForTemplate(plan);

      for (const file of files) {
        try {
          await this.createFile(plan.repoName, file.path, file.content, file.message || 'Initial commit');
          this.log('info', `Created file: ${file.path}`);
        } catch (fileErr) {
          this.log('warn', `Failed to create ${file.path}:`, fileErr.message);
        }
      }

      // Clear the pending plan
      this.pendingPlans.delete(userId);

      const repoUrl = `https://github.com/${this.username}/${plan.repoName}`;

      return this.success(
        `*Project Created!*\n\n` +
        `Repository: ${plan.repoName}\n` +
        `Template: ${this.templates[plan.template]?.name || plan.template}\n` +
        `Files created: ${files.length}\n\n` +
        `${repoUrl}\n\n` +
        `Clone it:\n` +
        `\`git clone ${repoUrl}.git\``
      );

    } catch (err) {
      this.log('error', 'Failed to create repository', err);

      // Check for common errors
      if (err.status === 422) {
        return this.error(`Repository "${plan.repoName}" already exists. Choose a different name.`);
      }

      return this.error(`Failed to create repo: ${err.message}`);
    }
  }

  /**
   * Handle reject command
   */
  async handleReject(userId) {
    const plan = this.pendingPlans.get(userId);

    if (!plan) {
      return this.error('No pending project plan to cancel.');
    }

    this.pendingPlans.delete(userId);

    return this.success(
      `Plan cancelled.\n\n` +
      `Say "create new project <name>" when you're ready.`
    );
  }

  /**
   * Create a file in the repository
   */
  async createFile(repoName, filePath, content, message = 'Add file') {
    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.username,
      repo: repoName,
      path: filePath,
      message,
      content: Buffer.from(content).toString('base64')
    });
  }

  /**
   * Get files to create based on template
   */
  getFilesForTemplate(plan) {
    const files = [];
    const template = plan.template || 'node';

    // README.md (always)
    files.push({
      path: 'README.md',
      content: this.generateReadme(plan),
      message: 'Add README.md'
    });

    // .gitignore (always)
    files.push({
      path: '.gitignore',
      content: this.getGitignore(template),
      message: 'Add .gitignore'
    });

    // Template-specific files
    switch (template) {
      case 'react':
        files.push(...this.getReactTemplate(plan));
        break;
      case 'nextjs':
        files.push(...this.getNextJsTemplate(plan));
        break;
      case 'express':
        files.push(...this.getExpressTemplate(plan));
        break;
      case 'node':
        files.push(...this.getNodeTemplate(plan));
        break;
      case 'python':
        files.push(...this.getPythonTemplate(plan));
        break;
      case 'minimal':
        // No additional files
        break;
      default:
        files.push(...this.getNodeTemplate(plan));
    }

    // GitHub Actions CI (if enabled)
    if (plan.hasCI) {
      files.push({
        path: '.github/workflows/ci.yml',
        content: this.getCIWorkflow(template),
        message: 'Add GitHub Actions CI workflow'
      });
    }

    return files;
  }

  /**
   * Generate README.md content
   */
  generateReadme(plan) {
    const templateName = this.templates[plan.template]?.name || plan.template;

    return `# ${plan.repoName}

${plan.description || 'A new project created with ClawdBot.'}

## Tech Stack

${plan.techStack?.map(t => `- ${t}`).join('\n') || '- Node.js'}

## Getting Started

\`\`\`bash
# Clone the repository
git clone https://github.com/${this.username}/${plan.repoName}.git
cd ${plan.repoName}

# Install dependencies
npm install

# Run development server
npm run dev
\`\`\`

## Project Structure

\`\`\`
${plan.repoName}/
${plan.folderStructure?.map(f => `├── ${f}`).join('\n') || '├── src/'}
├── README.md
└── package.json
\`\`\`

## License

MIT

---

*Created with ClawdBot using ${templateName} template*
`;
  }

  /**
   * Get .gitignore content based on template
   */
  getGitignore(template) {
    const common = `# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
build/
.next/
out/

# Environment files
.env
.env.local
.env*.local

# IDE
.idea/
.vscode/
*.swp
*.swo
.DS_Store

# Logs
logs/
*.log
npm-debug.log*

# Testing
coverage/
.nyc_output/

# Misc
*.tgz
.cache/
`;

    if (template === 'python') {
      return common + `
# Python
__pycache__/
*.py[cod]
*$py.class
.Python
venv/
.venv/
env/
.env/
*.egg-info/
.eggs/
pip-log.txt
pip-delete-this-directory.txt
.pytest_cache/
.mypy_cache/
`;
    }

    return common;
  }

  /**
   * Get GitHub Actions CI workflow
   */
  getCIWorkflow(template) {
    if (template === 'python') {
      return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt

      - name: Run tests
        run: pytest
`;
    }

    return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint --if-present

      - name: Run tests
        run: npm test --if-present

      - name: Build
        run: npm run build --if-present
`;
  }

  // ============ Template Definitions ============

  /**
   * React + Vite + Tailwind template files
   */
  getReactTemplate(plan = {}) {
    return [
      {
        path: 'package.json',
        content: JSON.stringify({
          name: plan.repoName || 'react-app',
          version: '0.1.0',
          private: true,
          type: 'module',
          scripts: {
            dev: 'vite',
            build: 'vite build',
            preview: 'vite preview',
            lint: 'eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0'
          },
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0'
          },
          devDependencies: {
            '@types/react': '^18.2.43',
            '@types/react-dom': '^18.2.17',
            '@vitejs/plugin-react': '^4.2.1',
            autoprefixer: '^10.4.16',
            eslint: '^8.55.0',
            'eslint-plugin-react': '^7.33.2',
            'eslint-plugin-react-hooks': '^4.6.0',
            'eslint-plugin-react-refresh': '^0.4.5',
            postcss: '^8.4.32',
            tailwindcss: '^3.3.6',
            vite: '^5.0.8'
          }
        }, null, 2),
        message: 'Add package.json'
      },
      {
        path: 'vite.config.js',
        content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`,
        message: 'Add Vite config'
      },
      {
        path: 'tailwind.config.js',
        content: `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
`,
        message: 'Add Tailwind config'
      },
      {
        path: 'postcss.config.js',
        content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`,
        message: 'Add PostCSS config'
      },
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${plan.repoName || 'React App'}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
        message: 'Add index.html'
      },
      {
        path: 'src/main.jsx',
        content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,
        message: 'Add main.jsx'
      },
      {
        path: 'src/App.jsx',
        content: `import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">
          ${plan.repoName || 'React App'}
        </h1>
        <p className="text-gray-600 mb-6">
          Built with React + Vite + Tailwind
        </p>
        <button
          onClick={() => setCount(c => c + 1)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors"
        >
          Count: {count}
        </button>
      </div>
    </div>
  )
}

export default App
`,
        message: 'Add App.jsx'
      },
      {
        path: 'src/index.css',
        content: `@tailwind base;
@tailwind components;
@tailwind utilities;
`,
        message: 'Add index.css with Tailwind imports'
      }
    ];
  }

  /**
   * Next.js 14 + App Router template files
   */
  getNextJsTemplate(plan = {}) {
    return [
      {
        path: 'package.json',
        content: JSON.stringify({
          name: plan.repoName || 'nextjs-app',
          version: '0.1.0',
          private: true,
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
            lint: 'next lint'
          },
          dependencies: {
            next: '14.0.4',
            react: '^18.2.0',
            'react-dom': '^18.2.0'
          },
          devDependencies: {
            '@types/node': '^20',
            '@types/react': '^18',
            '@types/react-dom': '^18',
            autoprefixer: '^10.0.1',
            eslint: '^8',
            'eslint-config-next': '14.0.4',
            postcss: '^8',
            tailwindcss: '^3.3.0'
          }
        }, null, 2),
        message: 'Add package.json'
      },
      {
        path: 'next.config.js',
        content: `/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = nextConfig
`,
        message: 'Add Next.js config'
      },
      {
        path: 'tailwind.config.js',
        content: `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
`,
        message: 'Add Tailwind config'
      },
      {
        path: 'postcss.config.js',
        content: `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`,
        message: 'Add PostCSS config'
      },
      {
        path: 'src/app/layout.js',
        content: `import './globals.css'

export const metadata = {
  title: '${plan.repoName || 'Next.js App'}',
  description: '${plan.description || 'Built with Next.js 14'}',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`,
        message: 'Add app layout'
      },
      {
        path: 'src/app/page.js',
        content: `export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">
          ${plan.repoName || 'Next.js App'}
        </h1>
        <p className="text-gray-600">
          Built with Next.js 14 + App Router + Tailwind
        </p>
      </div>
    </main>
  )
}
`,
        message: 'Add home page'
      },
      {
        path: 'src/app/globals.css',
        content: `@tailwind base;
@tailwind components;
@tailwind utilities;
`,
        message: 'Add global CSS'
      }
    ];
  }

  /**
   * Express.js API template files
   */
  getExpressTemplate(plan = {}) {
    return [
      {
        path: 'package.json',
        content: JSON.stringify({
          name: plan.repoName || 'express-api',
          version: '1.0.0',
          description: plan.description || 'Express.js REST API',
          main: 'src/index.js',
          scripts: {
            start: 'node src/index.js',
            dev: 'nodemon src/index.js',
            test: 'jest',
            lint: 'eslint src/'
          },
          dependencies: {
            express: '^4.18.2',
            cors: '^2.8.5',
            dotenv: '^16.3.1',
            helmet: '^7.1.0'
          },
          devDependencies: {
            eslint: '^8.55.0',
            jest: '^29.7.0',
            nodemon: '^3.0.2',
            supertest: '^6.3.3'
          }
        }, null, 2),
        message: 'Add package.json'
      },
      {
        path: 'src/index.js',
        content: `require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to ${plan.repoName || 'Express API'}',
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});

module.exports = app;
`,
        message: 'Add Express server'
      },
      {
        path: 'src/routes/index.js',
        content: `const express = require('express');
const router = express.Router();

// Add your routes here
router.get('/example', (req, res) => {
  res.json({ message: 'Example route' });
});

module.exports = router;
`,
        message: 'Add routes'
      },
      {
        path: '.env.example',
        content: `# Server
PORT=3000
NODE_ENV=development

# Database (if needed)
# DATABASE_URL=

# API Keys (if needed)
# API_KEY=
`,
        message: 'Add .env.example'
      }
    ];
  }

  /**
   * Basic Node.js template files
   */
  getNodeTemplate(plan = {}) {
    return [
      {
        path: 'package.json',
        content: JSON.stringify({
          name: plan.repoName || 'node-project',
          version: '1.0.0',
          description: plan.description || 'Node.js project',
          main: 'src/index.js',
          scripts: {
            start: 'node src/index.js',
            dev: 'nodemon src/index.js',
            test: 'jest',
            lint: 'eslint src/'
          },
          dependencies: {
            dotenv: '^16.3.1'
          },
          devDependencies: {
            eslint: '^8.55.0',
            jest: '^29.7.0',
            nodemon: '^3.0.2'
          }
        }, null, 2),
        message: 'Add package.json'
      },
      {
        path: 'src/index.js',
        content: `require('dotenv').config();

/**
 * ${plan.repoName || 'Node.js Project'}
 * ${plan.description || 'Main entry point'}
 */

function main() {
  console.log('Hello from ${plan.repoName || 'Node.js'}!');

  // Your code here
}

main();
`,
        message: 'Add main entry point'
      },
      {
        path: '.env.example',
        content: `# Environment variables
NODE_ENV=development
`,
        message: 'Add .env.example'
      }
    ];
  }

  /**
   * Python template files
   */
  getPythonTemplate(plan = {}) {
    return [
      {
        path: 'requirements.txt',
        content: `# Core dependencies
python-dotenv>=1.0.0

# Testing
pytest>=7.4.0
pytest-cov>=4.1.0

# Linting
flake8>=6.1.0
black>=23.12.0
`,
        message: 'Add requirements.txt'
      },
      {
        path: 'src/__init__.py',
        content: `"""${plan.repoName || 'Python Project'}

${plan.description || 'A Python project'}
"""

__version__ = "0.1.0"
`,
        message: 'Add __init__.py'
      },
      {
        path: 'src/main.py',
        content: `#!/usr/bin/env python3
"""
${plan.repoName || 'Python Project'} - Main Entry Point
${plan.description || ''}
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def main():
    """Main function."""
    print(f"Hello from ${plan.repoName || 'Python'}!")

    # Your code here


if __name__ == "__main__":
    main()
`,
        message: 'Add main.py'
      },
      {
        path: 'tests/__init__.py',
        content: `"""Tests for ${plan.repoName || 'project'}."""
`,
        message: 'Add tests __init__.py'
      },
      {
        path: 'tests/test_main.py',
        content: `"""Tests for main module."""

import pytest


def test_example():
    """Example test."""
    assert True


def test_import():
    """Test that the package can be imported."""
    from src import __version__
    assert __version__ == "0.1.0"
`,
        message: 'Add test_main.py'
      },
      {
        path: '.env.example',
        content: `# Environment variables
PYTHONPATH=src
`,
        message: 'Add .env.example'
      },
      {
        path: 'pyproject.toml',
        content: `[project]
name = "${plan.repoName || 'python-project'}"
version = "0.1.0"
description = "${plan.description || 'A Python project'}"
requires-python = ">=3.9"

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = "test_*.py"

[tool.black]
line-length = 88
target-version = ['py39', 'py310', 'py311']

[tool.flake8]
max-line-length = 88
extend-ignore = "E203"
`,
        message: 'Add pyproject.toml'
      }
    ];
  }

  // ============ Utility Methods ============

  /**
   * Convert string to kebab-case for repo names
   */
  toKebabCase(str) {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-')          // Replace spaces with dashes
      .replace(/-+/g, '-')           // Replace multiple dashes with single
      .replace(/^-|-$/g, '');        // Remove leading/trailing dashes
  }

  /**
   * Clean up expired pending plans
   */
  cleanupExpiredPlans() {
    const now = Date.now();
    for (const [userId, plan] of this.pendingPlans) {
      if (now > plan.expires) {
        this.pendingPlans.delete(userId);
        this.log('info', `Cleaned up expired plan for user: ${userId}`);
      }
    }
  }
}

module.exports = ProjectCreatorSkill;
