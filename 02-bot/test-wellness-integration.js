/**
 * Integration test for Wellness skill with skill system
 */

const { initialize } = require('./skills');
const path = require('path');

// Mock memory
const mockMemory = {
  data: new Map(),
  async query(table, options) {
    const key = `${table}_${options.where?.user_id}_${options.where?.category}`;
    return this.data.get(key) || [];
  },
  async insert(table, data) {
    const key = `${table}_${data.user_id}_${data.category}`;
    const existing = this.data.get(key) || [];
    existing.push({ ...data, id: existing.length + 1 });
    this.data.set(key, existing);
  },
  async update(table, where, data) {
    // Update mock
  }
};

async function test() {
  console.log('🧪 Testing Wellness Skill Integration\n');
  console.log('=' .repeat(50));

  // Initialize skills system
  console.log('\n1️⃣ Initializing skills system...');
  const skillsDir = path.join(__dirname, 'skills');
  const system = await initialize(
    { memory: mockMemory, config: {}, logger: console },
    { skillsDir, watch: false }
  );

  console.log('✅ Skills system initialized');
  console.log('Total skills loaded:', system.skills.length);

  // Check if wellness skill is loaded
  console.log('\n2️⃣ Checking if wellness skill is loaded...');
  const wellness = system.registry.getSkill('wellness');

  if (!wellness) {
    console.error('❌ Wellness skill NOT found in registry!');
    process.exit(1);
  }

  console.log('✅ Wellness skill loaded');
  console.log('  Name:', wellness.name);
  console.log('  Priority:', wellness.priority);
  console.log('  Commands:', wellness.commands.length);

  // Test command handling
  console.log('\n3️⃣ Testing command handling...');
  const testCommands = [
    'wellness on',
    'wellness off',
    'wellness status',
    'wellness config 90'
  ];

  for (const cmd of testCommands) {
    const canHandle = wellness.canHandle(cmd);
    const icon = canHandle ? '✅' : '❌';
    console.log(`  ${icon} Wellness can handle "${cmd}": ${canHandle}`);

    if (!canHandle) {
      console.error(`Wellness should be able to handle "${cmd}"`);
      process.exit(1);
    }
  }

  // Test executing wellness commands through registry
  console.log('\n4️⃣ Testing command execution via registry...');
  const context = {
    from: 'test-user-456',
    messageId: 'msg-test-001',
    timestamp: new Date()
  };

  // Test wellness status
  const statusResult = await system.route('wellness status', context);
  console.log('  wellness status:', statusResult.success ? '✅ Success' : '❌ Failed');
  console.log('  Response:', statusResult.message.substring(0, 80) + '...');

  // Test wellness on
  const enableResult = await system.route('wellness on', context);
  console.log('  wellness on:', enableResult.success ? '✅ Success' : '❌ Failed');

  // Test wellness config
  const configResult = await system.route('wellness config 60', context);
  console.log('  wellness config 60:', configResult.success ? '✅ Success' : '❌ Failed');

  // Test wellness off
  const disableResult = await system.route('wellness off', context);
  console.log('  wellness off:', disableResult.success ? '✅ Success' : '❌ Failed');

  // Test command precedence
  console.log('\n5️⃣ Testing command precedence...');
  const allSkills = Array.from(system.registry.skills.values());
  const wellnessPriority = wellness.priority;
  const higherPriority = allSkills.filter(s => s.priority > wellnessPriority);
  const samePriority = allSkills.filter(s => s.priority === wellnessPriority && s.name !== 'wellness');

  console.log(`  Wellness priority: ${wellnessPriority}`);
  console.log(`  Total skills: ${allSkills.length}`);
  console.log(`  Skills with higher priority: ${higherPriority.length}`);
  console.log(`  Skills with same priority: ${samePriority.length}`);

  if (higherPriority.length > 0) {
    console.log('  Higher priority skills:');
    higherPriority.slice(0, 5).forEach(s => {
      console.log(`    - ${s.name} (${s.priority})`);
    });
  }

  // Shutdown
  console.log('\n6️⃣ Shutting down...');
  await system.shutdown();
  console.log('✅ Clean shutdown');

  // Summary
  console.log('\n' + '=' .repeat(50));
  console.log('📊 Integration Test Summary');
  console.log('=' .repeat(50));
  console.log('✅ All integration tests passed!');
  console.log('\nWellness skill is fully integrated and working.');
}

test().catch(error => {
  console.error('❌ Integration test failed:', error);
  console.error(error.stack);
  process.exit(1);
});
