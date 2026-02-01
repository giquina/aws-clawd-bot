// hooks/index.js
// Central hook registry for message preprocessing

const errorAlerter = require('./error-alerter');
const smartRouter = require('./smart-router');

// Initialize all hooks
function initializeHooks() {
  errorAlerter.initialize();
  smartRouter.initialize();
  console.log('[Hooks] All hooks initialized');
}

// Pre-process a message through all hooks
async function preprocess(message, context = {}) {
  let processed = message;

  // Skip smart routing for voice messages - let voice skill handle them
  if (context.mediaContentType && context.mediaContentType.startsWith('audio/')) {
    console.log('[Hooks] Skipping SmartRouter for voice message');
    return processed; // Return original (empty) message
  }

  // Run through smart router (natural language -> command)
  processed = await smartRouter.route(processed);

  // Add more preprocessing hooks here as needed
  // processed = await anotherHook.process(processed, context);

  return processed;
}

module.exports = {
  errorAlerter,
  smartRouter,
  initializeHooks,
  preprocess
};
