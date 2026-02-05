/**
 * Simple test to verify monitoring skill loads correctly
 *
 * Run: node scripts/test-monitoring-load.js
 */

const path = require('path');
const dotenv = require('dotenv');

// Load environment
dotenv.config({ path: path.join(__dirname, '../02-bot/config/.env.local') });

async function testLoad() {
  console.log('========================================');
  console.log('Testing Monitoring Skill Load');
  console.log('========================================\n');

  try {
    // Load the monitoring skill directly
    const MonitoringSkill = require('../02-bot/skills/monitoring');

    console.log('✅ Monitoring skill module loaded\n');

    // Create an instance
    const skill = new MonitoringSkill({
      memory: null,
      ai: null,
      config: {},
      logger: console
    });

    console.log('✅ Monitoring skill instance created\n');

    // Initialize
    await skill.initialize();
    console.log('✅ Monitoring skill initialized\n');

    // Get metadata
    const metadata = skill.getMetadata();
    console.log('Skill Metadata:');
    console.log('  Name:', metadata.name);
    console.log('  Description:', metadata.description);
    console.log('  Priority:', metadata.priority);
    console.log('  Commands:', metadata.commands.length);
    console.log('  Data Type:', metadata.dataType);
    console.log('\n');

    // Test canHandle
    console.log('Command Pattern Tests:');
    const commands = [
      'server health',
      'api metrics',
      'system info',
      'pm2 status',
      'logs clawd-bot',
      'invalid command'
    ];

    for (const cmd of commands) {
      const canHandle = skill.canHandle(cmd);
      console.log(`  ${canHandle ? '✅' : '❌'} "${cmd}"`);
    }

    console.log('\n');

    // Shutdown
    await skill.shutdown();
    console.log('✅ Monitoring skill shut down\n');

    console.log('========================================');
    console.log('PASS: Monitoring skill loaded successfully!');
    console.log('========================================');

  } catch (error) {
    console.error('❌ FAIL:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testLoad();
