/**
 * Status Messenger
 * Sends clear, emoji-enhanced status updates to users via Telegram/WhatsApp
 *
 * Purpose: Make bot state UNMISTAKABLE - no confusion about whether bot is waiting or working
 * Usage: Import and use formatting functions for all user-facing status messages
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
 * @param {string} type - Status type (APPROVAL_NEEDED, WORKING, PROGRESS, COMPLETE, FAILED, INFO)
 * @param {string} message - Main message content
 * @param {Object} options - Additional options
 * @param {string[]} options.items - Bulleted list items
 * @param {string} options.footer - Footer text
 * @returns {string} Formatted message with Telegram markdown
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
 * @param {string} taskDescription - What the bot is about to do (e.g., "deploying JUDO")
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
 * @param {string} options.link - URL to result (e.g., PR link, deployment URL)
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
 * @param {string} suggestion - What user can do to fix it (optional)
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
