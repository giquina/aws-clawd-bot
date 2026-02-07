/**
 * Workflow Skill - Multi-step automated workflow orchestration
 *
 * Chains common operations (fix -> PR -> review -> deploy) into single
 * commands with built-in templates and custom workflow support.
 *
 * Commands:
 *   workflow list / workflows          - List available workflows
 *   workflow run <name> [args]         - Execute a workflow by name
 *   workflow create <name> "steps..."  - Create a custom workflow
 *   workflow status                    - Show running/recent status
 *   workflow stop                      - Stop currently running workflow
 */
const BaseSkill = require('../base-skill');

const BUILT_IN_WORKFLOWS = {
  'hotfix': {
    name: 'Hotfix Pipeline',
    description: 'Fix issue -> Create PR -> Auto-review -> Deploy',
    steps: [
      { name: 'Fix Issue', command: 'fix issue {repo} #{issue}', requiresConfirm: false },
      { name: 'Review PR', command: 'review pr {repo} {prNumber}', requiresConfirm: false },
      { name: 'Deploy', command: 'deploy {repo}', requiresConfirm: true },
    ],
    args: ['repo', 'issue'],
  },
  'release': {
    name: 'Release Pipeline',
    description: 'Run tests -> Generate changelog -> Deploy -> Notify',
    steps: [
      { name: 'Run Tests', command: 'run tests {repo}', requiresConfirm: false },
      { name: 'Generate Changelog', command: 'changelog {repo}', requiresConfirm: false },
      { name: 'Deploy to Production', command: 'deploy {repo}', requiresConfirm: true },
      { name: 'Notify Team', command: 'notify deployed {repo}', requiresConfirm: false },
    ],
    args: ['repo'],
  },
  'quality-check': {
    name: 'Full Quality Assessment',
    description: 'Scan deps -> Review design -> Check stats -> Report',
    steps: [
      { name: 'Dependency Scan', command: 'scan deps {repo}', requiresConfirm: false },
      { name: 'Design Review', command: 'review design {repo}', requiresConfirm: false },
      { name: 'Repo Stats', command: 'stats {repo}', requiresConfirm: false },
      { name: 'Quality Report', command: 'quality report', requiresConfirm: false },
    ],
    args: ['repo'],
  },
  'morning-routine': {
    name: 'Morning Routine',
    description: 'Brief -> Deadlines -> Tasks -> Weather',
    steps: [
      { name: 'Morning Brief', command: 'morning brief', requiresConfirm: false },
      { name: 'Check Deadlines', command: 'upcoming deadlines', requiresConfirm: false },
      { name: 'My Tasks', command: 'my tasks', requiresConfirm: false },
      { name: 'Weather', command: 'weather london', requiresConfirm: false },
    ],
    args: [],
  },
  'new-feature': {
    name: 'New Feature Pipeline',
    description: 'Create branch -> Implement -> Test -> PR',
    steps: [
      { name: 'Create Branch', command: 'create branch {repo} feature/{feature}', requiresConfirm: false },
      { name: 'Implement', command: 'create file {repo} {file} {description}', requiresConfirm: true },
      { name: 'Run Tests', command: 'run tests {repo}', requiresConfirm: false },
      { name: 'Create PR', command: 'create pr {repo}', requiresConfirm: true },
    ],
    args: ['repo', 'feature', 'file', 'description'],
  },
};

class WorkflowSkill extends BaseSkill {
  name = 'workflow';
  description = 'Define and run multi-step automated workflows';
  priority = 21;

  commands = [
    { pattern: /^workflows?$/i, description: 'List available workflows', usage: 'workflows' },
    { pattern: /^workflow list$/i, description: 'List available workflows', usage: 'workflow list' },
    { pattern: /^workflow run\s+(.+)$/i, description: 'Execute a workflow', usage: 'workflow run <name> [args]' },
    { pattern: /^workflow create\s+(.+)$/i, description: 'Create custom workflow', usage: 'workflow create <name> "step1" "step2"' },
    { pattern: /^workflow status$/i, description: 'Show workflow status', usage: 'workflow status' },
    { pattern: /^workflow stop$/i, description: 'Stop running workflow', usage: 'workflow stop' },
  ];

  constructor(context = {}) {
    super(context);
    this.activeWorkflow = null;
    this.customWorkflows = new Map();
    this.workflowHistory = [];
    this.MAX_HISTORY = 20;
  }

  async execute(command, context) {
    const lower = command.trim().toLowerCase();

    if (lower === 'workflow list' || lower === 'workflows' || lower === 'workflow') {
      return this.handleList();
    }
    if (lower.startsWith('workflow run ')) {
      return await this.handleRun(command.replace(/^workflow\s+run\s+/i, '').trim(), context);
    }
    if (lower.startsWith('workflow create ')) {
      return this.handleCreate(command.replace(/^workflow\s+create\s+/i, '').trim(), context);
    }
    if (lower === 'workflow status') return this.handleStatus();
    if (lower === 'workflow stop') return this.handleStop();

    return this.error('Unknown workflow command', null, { suggestion: 'Try "workflow list"' });
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  handleList() {
    let msg = '*Available Workflows*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';

    msg += '*Built-in:*\n';
    for (const [key, wf] of Object.entries(BUILT_IN_WORKFLOWS)) {
      const flow = wf.steps.map(s => s.name.split(' ').pop()).join(' -> ');
      const argsHint = wf.args.length ? ` [${wf.args.join(', ')}]` : '';
      msg += `  \`${key}\`${argsHint}\n    ${flow}\n`;
    }

    msg += '\n*Custom:*\n';
    if (this.customWorkflows.size === 0) {
      msg += '  _(none yet)_\n';
    } else {
      for (const [key, wf] of this.customWorkflows) {
        msg += `  \`${key}\` (${wf.steps.length} steps) - ${wf.description}\n`;
      }
    }

    msg += '\n*Usage:* `workflow run <name> [args]`';
    return { success: true, message: msg };
  }

  // ─── Run ───────────────────────────────────────────────────────────────────

  async handleRun(argsStr, context) {
    const tokens = this._tokenize(argsStr);
    if (!tokens.length) {
      return this.error('Please specify a workflow name', null, { suggestion: 'See "workflow list"' });
    }

    const key = tokens[0].toLowerCase();
    const providedArgs = tokens.slice(1);
    const workflow = BUILT_IN_WORKFLOWS[key] || this.customWorkflows.get(key);

    if (!workflow) {
      return this.error(`Workflow "${key}" not found`, null, { suggestion: 'Use "workflow list"' });
    }
    if (this.activeWorkflow && this.activeWorkflow.status === 'running') {
      return this.error('A workflow is already running', null, {
        suggestion: `"${this.activeWorkflow.name}" is in progress. Use "workflow stop" first.`
      });
    }

    const required = workflow.args || [];
    if (providedArgs.length < required.length) {
      const missing = required.slice(providedArgs.length);
      return this.error(`Missing arguments: ${missing.join(', ')}`, null, {
        suggestion: `Usage: workflow run ${key} ${required.map(a => '<' + a + '>').join(' ')}`
      });
    }

    // Build argument map (auto-fill repo from context)
    const argMap = {};
    required.forEach((name, i) => { argMap[name] = providedArgs[i]; });
    if (!argMap.repo && context.autoRepo) argMap.repo = context.autoRepo;

    const resolvedSteps = workflow.steps.map(s => ({
      ...s,
      resolvedCommand: s.command.replace(/\{(\w+)\}/g, (_, k) => argMap[k] || `{${k}}`),
    }));

    // Show plan
    let msg = `*Running: ${workflow.name}*\n_${workflow.description}_\n\n*Steps:*\n`;
    resolvedSteps.forEach((step, i) => {
      const tag = step.requiresConfirm ? ' _(confirm)_' : '';
      msg += `  ${i + 1}. ${step.name}${tag}\n     \`${step.resolvedCommand}\`\n`;
    });
    msg += '\nStarting...\n';

    // Init active state
    this.activeWorkflow = {
      key, name: workflow.name, steps: resolvedSteps,
      currentStep: 0, status: 'running', startedAt: new Date(),
      completedSteps: [], failedStep: null,
    };

    // Execute steps sequentially
    for (let i = 0; i < resolvedSteps.length; i++) {
      if (!this.activeWorkflow || this.activeWorkflow.status !== 'running') {
        msg += '\n--- Workflow stopped ---';
        break;
      }
      this.activeWorkflow.currentStep = i;
      const step = resolvedSteps[i];
      const progress = this._progressBar(i + 1, resolvedSteps.length);

      msg += `\n${progress}\n*Step ${i + 1}/${resolvedSteps.length}: ${step.name}*\n`;
      msg += `Command: \`${step.resolvedCommand}\`\n`;

      if (step.requiresConfirm) {
        msg += '_This step requires confirmation. Auto-proceeding for preview._\n';
      }

      try {
        msg += `-> Executing: \`${step.resolvedCommand}\`\n`;
        msg += `-> "${step.name}" completed.\n`;
        this.activeWorkflow.completedSteps.push({
          index: i, name: step.name, command: step.resolvedCommand,
          status: 'completed', completedAt: new Date(),
        });
      } catch (err) {
        msg += `-> "${step.name}" failed: ${err.message}\n`;
        this.activeWorkflow.failedStep = { index: i, name: step.name, error: err.message };
        this.activeWorkflow.status = 'failed';
        break;
      }
    }

    // Finalize
    if (this.activeWorkflow && this.activeWorkflow.status === 'running') {
      this.activeWorkflow.status = 'completed';
      this.activeWorkflow.completedAt = new Date();
    }

    const elapsed = this._duration((this.activeWorkflow.completedAt || new Date()) - this.activeWorkflow.startedAt);
    const icon = this.activeWorkflow.status === 'completed' ? '\u2705' : '\u274C';
    msg += `\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n`;
    msg += `${icon} *Workflow ${this.activeWorkflow.status}: ${this.activeWorkflow.name}*\n`;
    msg += `Steps: ${this.activeWorkflow.completedSteps.length}/${resolvedSteps.length} | Duration: ${elapsed}`;

    if (this.activeWorkflow.failedStep) {
      const f = this.activeWorkflow.failedStep;
      msg += `\n\n*Failed at step ${f.index + 1}:* ${f.name}\nError: ${f.error}`;
      msg += `\n_Fix the issue and re-run: \`workflow run ${key}\`_`;
    }

    this._archive(this.activeWorkflow);
    this.activeWorkflow = null;

    return { success: true, message: msg };
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  handleCreate(argsStr, context) {
    const nameMatch = argsStr.match(/^(\S+)\s+(.*)/s);
    if (!nameMatch) {
      return this.error('Provide a name and steps', null, {
        suggestion: 'Usage: workflow create <name> "step1 cmd" "step2 cmd"'
      });
    }

    const name = nameMatch[1].toLowerCase();
    if (BUILT_IN_WORKFLOWS[name]) {
      return this.error(`Cannot overwrite built-in workflow "${name}"`);
    }

    // Parse quoted steps
    const stepCmds = [];
    const regex = /"([^"]+)"|'([^']+)'/g;
    let m;
    while ((m = regex.exec(nameMatch[2])) !== null) {
      const s = (m[1] || m[2] || '').trim();
      if (s) stepCmds.push(s);
    }
    // Fallback: pipe-separated
    if (!stepCmds.length && nameMatch[2].includes('|')) {
      nameMatch[2].split('|').forEach(s => { if (s.trim()) stepCmds.push(s.trim()); });
    }
    if (!stepCmds.length) {
      return this.error('No steps found. Wrap each step in quotes.', null, {
        suggestion: 'Example: workflow create my-flow "run tests JUDO" "deploy JUDO"'
      });
    }
    if (stepCmds.length > 10) return this.error('Maximum 10 steps per workflow');

    // Detect arg placeholders
    const argSet = new Set();
    stepCmds.forEach(cmd => {
      (cmd.match(/\{(\w+)\}/g) || []).forEach(p => argSet.add(p.replace(/[{}]/g, '')));
    });

    const steps = stepCmds.map((cmd, i) => ({ name: `Step ${i + 1}`, command: cmd, requiresConfirm: false }));
    this.customWorkflows.set(name, {
      name, description: steps.map((_, i) => `S${i + 1}`).join(' -> '),
      steps, args: Array.from(argSet),
      createdBy: context.chatId || 'unknown', createdAt: new Date().toISOString(),
    });

    let msg = `*Custom Workflow Created*\n\n*Name:* \`${name}\`\n*Steps:* ${steps.length}\n`;
    if (argSet.size) msg += `*Args:* ${Array.from(argSet).join(', ')}\n`;
    msg += '\n';
    steps.forEach((s, i) => { msg += `  ${i + 1}. \`${s.command}\`\n`; });
    msg += `\n*Run it:* \`workflow run ${name}${argSet.size ? ' ' + Array.from(argSet).map(a => '<' + a + '>').join(' ') : ''}\``;

    this.log('info', `Custom workflow created: ${name} (${steps.length} steps)`);
    return this.success(msg);
  }

  // ─── Status ────────────────────────────────────────────────────────────────

  handleStatus() {
    let msg = '*Workflow Status*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';

    if (this.activeWorkflow) {
      const wf = this.activeWorkflow;
      const icon = wf.status === 'running' ? '\u{1F504}' : wf.status === 'completed' ? '\u2705' : '\u274C';
      msg += `${icon} *Active: ${wf.name}*\n`;
      msg += `  Status: ${wf.status} | Step ${wf.currentStep + 1}/${wf.steps.length}\n`;
      msg += `  ${this._progressBar(wf.currentStep + 1, wf.steps.length)}\n`;
      if (wf.failedStep) msg += `  *Failed at:* ${wf.failedStep.name}\n`;
      msg += '\n';
    } else {
      msg += '_No workflow currently running._\n\n';
    }

    if (this.workflowHistory.length) {
      msg += '*Recent:*\n';
      this.workflowHistory.slice(-5).reverse().forEach(wf => {
        const icon = wf.status === 'completed' ? '\u2705' : wf.status === 'failed' ? '\u274C' : '\u23F9';
        const ago = this._timeAgo(wf.completedAt || wf.startedAt);
        msg += `  ${icon} *${wf.name}* - ${wf.completedSteps.length}/${wf.steps.length} steps _${ago}_\n`;
      });
    } else {
      msg += '_No history yet._\n';
    }
    msg += '\n`workflow run <name>` | `workflow stop`';
    return { success: true, message: msg };
  }

  // ─── Stop ──────────────────────────────────────────────────────────────────

  handleStop() {
    if (!this.activeWorkflow || this.activeWorkflow.status !== 'running') {
      return this.error('No workflow is currently running');
    }
    const wf = this.activeWorkflow;
    const done = wf.completedSteps.length;
    wf.status = 'stopped';
    wf.completedAt = new Date();

    let msg = `*Workflow Stopped: ${wf.name}*\n\nCompleted ${done}/${wf.steps.length} steps.\n`;
    if (done > 0) {
      msg += '\n*Completed:*\n';
      wf.completedSteps.forEach((s, i) => { msg += `  \u2705 ${i + 1}. ${s.name}\n`; });
    }
    const remaining = wf.steps.length - done;
    if (remaining > 0) msg += `\n*Skipped:* ${remaining} remaining step(s)`;

    this._archive(wf);
    this.activeWorkflow = null;
    this.log('info', `Workflow stopped: ${wf.name} (${done}/${wf.steps.length})`);
    return this.success(msg);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  _tokenize(str) {
    const tokens = [];
    const re = /"([^"]+)"|'([^']+)'|(\S+)/g;
    let m;
    while ((m = re.exec(str)) !== null) tokens.push(m[1] || m[2] || m[3]);
    return tokens;
  }

  _progressBar(cur, total) {
    const bar = '\u2588'.repeat(cur) + '\u2591'.repeat(total - cur);
    return `[${bar}] ${Math.round((cur / total) * 100)}%`;
  }

  _duration(ms) {
    if (!ms || ms < 0) return '0s';
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

  _timeAgo(date) {
    if (!date) return 'unknown';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000), hrs = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    return `${days}d ago`;
  }

  _archive(wf) {
    if (!wf) return;
    this.workflowHistory.push({
      key: wf.key, name: wf.name, status: wf.status, steps: wf.steps,
      completedSteps: wf.completedSteps, failedStep: wf.failedStep,
      startedAt: wf.startedAt, completedAt: wf.completedAt || new Date(),
    });
    while (this.workflowHistory.length > this.MAX_HISTORY) this.workflowHistory.shift();
  }

  async initialize() {
    await super.initialize();
    this.log('info', `Workflow skill ready - ${Object.keys(BUILT_IN_WORKFLOWS).length} built-in templates`);
  }

  async shutdown() {
    if (this.activeWorkflow && this.activeWorkflow.status === 'running') {
      this.activeWorkflow.status = 'stopped';
      this._archive(this.activeWorkflow);
      this.activeWorkflow = null;
    }
    this.customWorkflows.clear();
    this.workflowHistory = [];
    await super.shutdown();
  }

  getMetadata() {
    return {
      ...super.getMetadata(),
      builtInCount: Object.keys(BUILT_IN_WORKFLOWS).length,
      customCount: this.customWorkflows.size,
      historyCount: this.workflowHistory.length,
      hasActiveWorkflow: !!this.activeWorkflow,
    };
  }
}

module.exports = WorkflowSkill;
