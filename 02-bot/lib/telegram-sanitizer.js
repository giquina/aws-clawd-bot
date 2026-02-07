/**
 * Telegram Response Sanitizer
 *
 * Strips internal system output (XML tags, agent names, task blocks, raw errors,
 * file paths, and technical jargon) from messages before they reach the user.
 *
 * Every Telegram message should feel like it's coming from a helpful human
 * teammate — not a system log, not an engineer, not an API.
 *
 * @module lib/telegram-sanitizer
 */

'use strict';

// ---------------------------------------------------------------------------
// XML / Agent Tag Stripping
// ---------------------------------------------------------------------------

/**
 * Patterns for internal XML/agent tags that must NEVER reach Telegram.
 * Matches both opening and self-closing forms.
 * @type {RegExp[]}
 */
const XML_TAG_PATTERNS = [
  // Agent system tags
  /<\/?invoke[^>]*>/gi,
  /<\/?task_description[^>]*>/gi,
  /<\/?agent_role[^>]*>/gi,
  /<\/?success_criteria[^>]*>/gi,
  /<\/?task[^>]*>/gi,
  /<\/?plan[^>]*>/gi,
  /<\/?step[^>]*>/gi,
  /<\/?thinking[^>]*>/gi,
  /<\/?search_results?[^>]*>/gi,
  /<\/?result[^>]*>/gi,
  /<\/?tool_use[^>]*>/gi,
  /<\/?tool_result[^>]*>/gi,
  /<\/?function_calls?[^>]*>/gi,
  /<\/?parameters?[^>]*>/gi,
  /<\/?system[^>]*>/gi,
  /<\/?artifact[^>]*>/gi,
  /<\/?antThinking[^>]*>/gi,
  // Catch-all for XML tags with underscores (common in agent systems)
  /<\/?[a-z_]+_[a-z_]+[^>]*>/gi,
];

/**
 * Patterns for entire blocks that should be removed.
 * These match multi-line sections of internal output.
 * @type {RegExp[]}
 */
const BLOCK_PATTERNS = [
  // Full XML element blocks (e.g. <invoke name="task">...</invoke>)
  /<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi,
  /<task_description>[\s\S]*?<\/task_description>/gi,
  /<agent_role>[\s\S]*?<\/agent_role>/gi,
  /<success_criteria>[\s\S]*?<\/success_criteria>/gi,
  /<thinking>[\s\S]*?<\/thinking>/gi,
  /<antThinking>[\s\S]*?<\/antThinking>/gi,

  // Internal planning headers that leak out
  /\*\*Plan:\*\*\s*\n([\s\S]*?)(?=\n\n|\n[A-Z]|$)/gi,

  // Agent role identifiers
  /\b(search_specialist|architecture_analyst|repo_creator|search_agent|analysis_agent|planning_agent)\b/gi,
];

// ---------------------------------------------------------------------------
// Technical Noise Patterns
// ---------------------------------------------------------------------------

/**
 * Patterns for technical noise that should be cleaned or replaced.
 * @type {Array<{pattern: RegExp, replacement: string}>}
 */
const NOISE_REPLACEMENTS = [
  // GitHub API doc links in errors
  { pattern: /\s*-?\s*https?:\/\/docs\.github\.com\S*/gi, replacement: '' },

  // Raw file paths (src/foo/bar.js, lib/whatever.ts, etc.)
  // Only strip when in progress messages, not in code discussions
  { pattern: /Generating code:\s*\S+\s*\(\d+\/\d+\)\.\.\./gi, replacement: 'Writing files...' },
  { pattern: /Committing:\s*\S+\s*\(\d+\/\d+\)\.\.\./gi, replacement: 'Saving changes...' },
  { pattern: /Creating branch:\s*clawd-\S+/gi, replacement: 'Setting up a new branch...' },

  // Stack trace fragments
  { pattern: /\bat\s+\S+\s+\([^)]+:\d+:\d+\)/g, replacement: '' },
  { pattern: /Error:\s*ENOENT[^\n]*/gi, replacement: 'A file could not be found.' },
  { pattern: /Error:\s*ECONNREFUSED[^\n]*/gi, replacement: 'Could not connect to the server.' },
  { pattern: /Error:\s*ETIMEDOUT[^\n]*/gi, replacement: 'The request took too long.' },
  { pattern: /Error:\s*ENOTFOUND[^\n]*/gi, replacement: 'Could not reach the service.' },

  // npm/node internal errors
  { pattern: /npm ERR![^\n]*/gi, replacement: '' },
  { pattern: /node:internal[^\n]*/gi, replacement: '' },

  // Execution failed with API docs
  { pattern: /Execution failed:\s*Not Found\s*/gi, replacement: 'That resource could not be found.' },

  // Multiple blank lines → single blank line
  { pattern: /\n{3,}/g, replacement: '\n\n' },
];

// ---------------------------------------------------------------------------
// Commit Message Humanization
// ---------------------------------------------------------------------------

/**
 * Map of conventional commit prefixes to human-friendly descriptions.
 * @type {Object.<string, string>}
 */
const COMMIT_PREFIX_MAP = {
  'feat': 'Added a new feature',
  'fix': 'Fixed a bug',
  'docs': 'Updated documentation',
  'style': 'Cleaned up formatting',
  'refactor': 'Reorganized the code',
  'perf': 'Improved performance',
  'test': 'Added or updated tests',
  'build': 'Updated the build setup',
  'ci': 'Updated the deployment pipeline',
  'chore': 'Maintenance update',
  'revert': 'Reverted a previous change',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sanitize an AI response before sending to Telegram.
 *
 * Strips XML tags, agent blocks, internal planning output, and technical
 * noise. Returns a clean, human-readable message.
 *
 * @param {string} text - Raw AI or system response
 * @returns {string} Cleaned text safe for Telegram
 */
function sanitizeResponse(text) {
  if (!text || typeof text !== 'string') return text || '';

  let cleaned = text;

  // 1. Remove full XML blocks first (multi-line)
  for (const pattern of BLOCK_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // 2. Remove remaining XML tags
  for (const pattern of XML_TAG_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // 3. Apply noise replacements
  for (const { pattern, replacement } of NOISE_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // 4. Clean up whitespace artifacts
  cleaned = cleaned
    .replace(/\n{3,}/g, '\n\n')    // Multiple blank lines → single
    .replace(/^\s+$/gm, '')         // Lines that are only whitespace
    .replace(/^\n+/, '')            // Leading newlines
    .replace(/\n+$/, '')            // Trailing newlines
    .trim();

  return cleaned;
}

/**
 * Sanitize an error message for the user.
 *
 * Converts raw technical errors into human-friendly explanations.
 * Never exposes stack traces, API documentation URLs, or internal details.
 *
 * @param {string|Error} error - Raw error or Error object
 * @returns {string} Human-friendly error message
 */
function sanitizeError(error) {
  const msg = error instanceof Error ? error.message : String(error || '');

  // GitHub API "Not Found" errors
  if (/not found/i.test(msg) && /github/i.test(msg)) {
    return "I couldn't find that on GitHub. It might not exist, or I might not have access to it.";
  }
  if (/Not Found/i.test(msg) && /https:\/\/docs\.github\.com/i.test(msg)) {
    return "I couldn't find that on GitHub. The repository or resource might not exist yet.";
  }

  // Authentication errors
  if (/unauthorized|403|forbidden|authentication/i.test(msg)) {
    return "I don't have permission to do that right now. This might be a configuration issue.";
  }

  // Rate limiting
  if (/rate.?limit|429|too many requests/i.test(msg)) {
    return "I've hit a rate limit. Give me a minute and try again.";
  }

  // Network errors
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(msg)) {
    return "I'm having trouble connecting to the service. It might be temporarily down.";
  }

  // Timeout
  if (/timeout|timed?\s*out/i.test(msg)) {
    return "That took too long and timed out. I'll try again if you'd like.";
  }

  // Generic — strip technical details but keep the essence
  let clean = msg
    .replace(/https?:\/\/docs\.\S+/g, '')     // Strip API doc URLs
    .replace(/\s*-\s*$/g, '')                   // Strip trailing " - "
    .replace(/Error:\s*/i, '')                   // Strip "Error: " prefix
    .replace(/\([^)]*:\d+:\d+\)/g, '')          // Strip file:line:col
    .trim();

  // If the cleaned message is still too technical, provide a generic fallback
  if (clean.length > 200 || /\{|\[|stack|trace|at\s+/i.test(clean)) {
    return "Something went wrong on my end. I'll look into it — try again in a moment.";
  }

  return clean || "Something went wrong. Try again in a moment.";
}

/**
 * Humanize a git commit message for Telegram.
 *
 * Converts developer-oriented commit messages like "feat: implement NL handlers"
 * into user-friendly summaries like "Added a new feature — implement NL handlers".
 *
 * @param {string} commitMessage - Raw git commit message (first line)
 * @param {string} [repo] - Repository name for context
 * @returns {string} Human-friendly commit description
 */
function humanizeCommit(commitMessage, repo) {
  if (!commitMessage || typeof commitMessage !== 'string') return '';

  const firstLine = commitMessage.split('\n')[0].trim();

  // Try to match conventional commit format: "type(scope): description"
  const conventionalMatch = firstLine.match(/^(\w+)(?:\([^)]*\))?:\s*(.+)$/);

  if (conventionalMatch) {
    const prefix = conventionalMatch[1].toLowerCase();
    const description = conventionalMatch[2].trim();
    const humanPrefix = COMMIT_PREFIX_MAP[prefix] || 'Made a change';

    return `${humanPrefix}: ${description}`;
  }

  // Not conventional commit format — return as-is but cleaned up
  return firstLine;
}

/**
 * Format a push event notification for Telegram in human-friendly language.
 *
 * @param {string} repo - Repository name
 * @param {string} branch - Branch name
 * @param {string} pusher - Who pushed
 * @param {Array<{message: string}>} commits - Array of commit objects
 * @returns {string} Human-friendly push notification
 */
function formatPushNotification(repo, branch, pusher, commits = []) {
  const commitCount = commits.length;
  if (commitCount === 0) return '';

  let notification = '';

  // Header
  if (branch === 'main' || branch === 'master') {
    notification = `New update pushed to *${repo}*`;
  } else {
    notification = `New update on *${repo}* (branch: ${branch})`;
  }

  // Commit summaries
  if (commitCount === 1 && commits[0]?.message) {
    const humanized = humanizeCommit(commits[0].message, repo);
    notification += `\n${humanized}`;
  } else if (commitCount > 1) {
    notification += `\n${commitCount} changes:`;
    commits.slice(0, 3).forEach(c => {
      if (c?.message) {
        const humanized = humanizeCommit(c.message, repo);
        notification += `\n  - ${humanized}`;
      }
    });
    if (commitCount > 3) {
      notification += `\n  ...and ${commitCount - 3} more`;
    }
  }

  return notification;
}

/**
 * Format a deployment error for Telegram.
 *
 * @param {string} repo - Repository that failed to deploy
 * @param {string|Error} error - The deployment error
 * @returns {string} Human-friendly deployment error message
 */
function formatDeployError(repo, error) {
  const errorMsg = sanitizeError(error);
  return `The auto-deploy for *${repo}* didn't work this time.\n\n${errorMsg}\n\nI can retry if you want — just say "deploy ${repo}".`;
}

/**
 * Humanize a progress message from plan-executor.
 *
 * Converts technical progress messages like "Generating code: src/utils/Logger.js (8/9)..."
 * into friendlier ones like "Writing files... (8 of 9 done)"
 *
 * @param {string} progressMessage - Raw progress text
 * @returns {string} Human-friendly progress message
 */
function humanizeProgress(progressMessage) {
  if (!progressMessage || typeof progressMessage !== 'string') return progressMessage || '';

  let msg = progressMessage;

  // File generation progress
  msg = msg.replace(/Generating code:\s*\S+\s*\((\d+)\/(\d+)\)\.\.\./gi, (_, current, total) => {
    return `Writing files... (${current} of ${total} done)`;
  });

  // Committing progress
  msg = msg.replace(/Committing:\s*\S+\s*\((\d+)\/(\d+)\)\.\.\./gi, (_, current, total) => {
    return `Saving changes... (${current} of ${total})`;
  });

  // Branch creation
  msg = msg.replace(/Creating branch:\s*clawd-\S+/gi, 'Setting up a new branch...');

  // Reading project structure
  msg = msg.replace(/Reading \S+ project structure\.\.\./gi, 'Checking the project files...');

  return msg;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

module.exports = {
  sanitizeResponse,
  sanitizeError,
  humanizeCommit,
  formatPushNotification,
  formatDeployError,
  humanizeProgress,
};
