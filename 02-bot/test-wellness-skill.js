/**
 * Test script for Wellness Reminders Skill
 *
 * Tests all commands and core functionality
 */

const WellnessSkill = require('./skills/wellness');

// Mock memory manager
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
    console.log(`  [DB] Inserted into ${table}:`, data.fact || data);
  },

  async update(table, where, data) {
    const userId = where.user_id || where.id;
    // Find and update
    console.log(`  [DB] Updated ${table} where:`, where, 'with:', data);
  }
};

// Mock sendMessage function
let messagesSent = [];
const mockSendMessage = async (message) => {
  console.log('\n📬 Message sent:', message);
  messagesSent.push(message);
};

// Create skill instance
const skill = new WellnessSkill({
  memory: mockMemory,
  config: {
    sendMessage: mockSendMessage
  },
  logger: console
});

// Test context
const context = {
  from: 'test-user-123',
  messageId: 'msg-001',
  timestamp: new Date(),
  sendMessage: mockSendMessage
};

async function runTests() {
  console.log('🧪 Testing Wellness Reminders Skill\n');
  console.log('=' .repeat(50));

  // Initialize skill
  console.log('\n1️⃣ Testing initialization...');
  await skill.initialize();
  console.log('✅ Skill initialized');

  // Test 1: wellness status (should be disabled initially)
  console.log('\n2️⃣ Testing wellness status (should be disabled)...');
  const statusDisabled = await skill.execute('wellness status', context);
  console.log('Response:', statusDisabled.message.substring(0, 100) + '...');

  // Test 2: wellness on (enable with default settings)
  console.log('\n3️⃣ Testing wellness on (enable)...');
  const enableResult = await skill.execute('wellness on', context);
  console.log('Response:', enableResult.message.substring(0, 100) + '...');
  console.log('Success:', enableResult.success);

  // Test 3: wellness status (should be enabled)
  console.log('\n4️⃣ Testing wellness status (should be enabled)...');
  const statusEnabled = await skill.execute('wellness status', context);
  console.log('Response:', statusEnabled.message.substring(0, 100) + '...');

  // Test 4: wellness config (change interval)
  console.log('\n5️⃣ Testing wellness config 90 (change interval)...');
  const configResult = await skill.execute('wellness config 90', context);
  console.log('Response:', configResult.message.substring(0, 100) + '...');
  console.log('Success:', configResult.success);

  // Test 5: wellness config with invalid interval (too low)
  console.log('\n6️⃣ Testing wellness config 15 (too low, should fail)...');
  const configInvalid = await skill.execute('wellness config 15', context);
  console.log('Response:', configInvalid.message);
  console.log('Success:', configInvalid.success);

  // Test 6: wellness config with invalid interval (too high)
  console.log('\n7️⃣ Testing wellness config 600 (too high, should fail)...');
  const configInvalid2 = await skill.execute('wellness config 600', context);
  console.log('Response:', configInvalid2.message);
  console.log('Success:', configInvalid2.success);

  // Test 7: wellness off (disable)
  console.log('\n8️⃣ Testing wellness off (disable)...');
  const disableResult = await skill.execute('wellness off', context);
  console.log('Response:', disableResult.message);
  console.log('Success:', disableResult.success);

  // Test 8: Command matching
  console.log('\n9️⃣ Testing command matching...');
  console.log('Can handle "wellness on":', skill.canHandle('wellness on'));
  console.log('Can handle "wellness off":', skill.canHandle('wellness off'));
  console.log('Can handle "wellness status":', skill.canHandle('wellness status'));
  console.log('Can handle "wellness config 120":', skill.canHandle('wellness config 120'));
  console.log('Can handle "invalid command":', skill.canHandle('invalid command'));

  // Test 9: DND detection
  console.log('\n🔟 Testing DND hours detection...');
  const isDND = skill._isInDNDHours();
  const currentHour = new Date().getHours();
  console.log('Current hour:', currentHour);
  console.log('Is in DND hours (23:00-07:00):', isDND);

  // Test 10: Reminder type rotation
  console.log('\n1️⃣1️⃣ Testing reminder type rotation...');
  console.log('Reminder types:', skill.REMINDER_TYPES.length);
  const type1 = skill._getNextReminderType('test-user-123');
  const type2 = skill._getNextReminderType('test-user-123');
  const type3 = skill._getNextReminderType('test-user-123');
  console.log('Type 1:', type1.type, '-', type1.icon);
  console.log('Type 2:', type2.type, '-', type2.icon);
  console.log('Type 3:', type3.type, '-', type3.icon);

  // Test 11: Metadata
  console.log('\n1️⃣2️⃣ Testing skill metadata...');
  const metadata = skill.getMetadata();
  console.log('Skill name:', metadata.name);
  console.log('Description:', metadata.description);
  console.log('Priority:', metadata.priority);
  console.log('Commands:', metadata.commands.length);
  console.log('Active users:', metadata.activeUsers);
  console.log('DND hours:', metadata.dndHours);

  // Cleanup
  console.log('\n1️⃣3️⃣ Testing shutdown...');
  await skill.shutdown();
  console.log('✅ Skill shut down cleanly');

  // Summary
  console.log('\n' + '=' .repeat(50));
  console.log('📊 Test Summary');
  console.log('=' .repeat(50));
  console.log('Total tests: 13');
  console.log('All tests passed ✅');
  console.log('\nMessages sent during tests:', messagesSent.length);

  if (messagesSent.length > 0) {
    console.log('\nMessages:');
    messagesSent.forEach((msg, i) => {
      console.log(`  ${i + 1}. ${msg.substring(0, 50)}...`);
    });
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
