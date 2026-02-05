/**
 * Test script for Monitoring skill
 *
 * Run: node scripts/test-monitoring-skill.js
 */

const path = require('path');
const dotenv = require('dotenv');

// Load environment from 02-bot directory
dotenv.config({ path: path.join(__dirname, '../02-bot/config/.env.local') });

// Load the Monitoring skill
const MonitoringSkill = require('../02-bot/skills/monitoring');

// Create a mock context
const mockContext = {
  memory: null,
  ai: null,
  config: {},
  logger: {
    info: (...args) => console.log('[INFO]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    debug: (...args) => console.log('[DEBUG]', ...args),
    log: (...args) => console.log('[LOG]', ...args)
  }
};

async function testMonitoring() {
  console.log('========================================');
  console.log('Testing Monitoring Skill');
  console.log('========================================\n');

  const skill = new MonitoringSkill(mockContext);
  await skill.initialize();

  console.log('Skill initialized:', skill.name);
  console.log('System info available:', skill.systemInfoAvailable);
  console.log('\n');

  // Test 1: Server health
  console.log('--- Test 1: Server Health ---');
  try {
    const result = await skill.execute('server health', {});
    console.log('Success:', result.success);
    console.log('Message:\n', result.message);
  } catch (error) {
    console.error('Error:', error.message);
  }
  console.log('\n');

  // Test 2: System info
  console.log('--- Test 2: System Info ---');
  try {
    const result = await skill.execute('system info', {});
    console.log('Success:', result.success);
    console.log('Message:\n', result.message);
  } catch (error) {
    console.error('Error:', error.message);
  }
  console.log('\n');

  // Test 3: PM2 status (may fail if PM2 not installed)
  console.log('--- Test 3: PM2 Status ---');
  try {
    const result = await skill.execute('pm2 status', {});
    console.log('Success:', result.success);
    console.log('Message:\n', result.message);
  } catch (error) {
    console.error('Error:', error.message);
  }
  console.log('\n');

  // Test 4: API metrics
  console.log('--- Test 4: API Metrics ---');
  try {
    const result = await skill.execute('api metrics', {});
    console.log('Success:', result.success);
    console.log('Message:\n', result.message);
  } catch (error) {
    console.error('Error:', error.message);
  }
  console.log('\n');

  // Test 5: Can handle
  console.log('--- Test 5: Command Pattern Matching ---');
  const testCommands = [
    'server health',
    'SERVER HEALTH',
    'api metrics',
    'logs clawd-bot',
    'pm2 status',
    'pm2 restart clawd-bot',
    'system info',
    'invalid command'
  ];

  for (const cmd of testCommands) {
    const canHandle = skill.canHandle(cmd);
    console.log(`  "${cmd}" -> ${canHandle ? '✓' : '✗'}`);
  }
  console.log('\n');

  // Test 6: Get metadata
  console.log('--- Test 6: Skill Metadata ---');
  const metadata = skill.getMetadata();
  console.log('Name:', metadata.name);
  console.log('Description:', metadata.description);
  console.log('Priority:', metadata.priority);
  console.log('Commands:', metadata.commands.length);
  console.log('Data Type:', metadata.dataType);
  console.log('Cache Size:', metadata.cacheSize);
  console.log('\n');

  // Shutdown
  await skill.shutdown();
  console.log('========================================');
  console.log('All tests completed!');
  console.log('========================================');
}

// Run tests
testMonitoring().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
