/**
 * Simple test for Goals Skill
 * Run with: node test.js
 */

const GoalsSkill = require('./index.js');
const db = require('../../lib/database');

// Test user
const TEST_USER = 'test_user_123';

async function runTests() {
  console.log('🧪 Testing Goals Skill\n');

  const skill = new GoalsSkill();
  await skill.initialize();

  const context = {
    from: TEST_USER,
    messageId: 'test_msg_001',
    timestamp: new Date()
  };

  try {
    // Test 1: Create a goal with target and deadline
    console.log('Test 1: Creating goal with target and deadline');
    let result = await skill.execute('goal set Read 12 books target 12 books by 2025-12-31', context);
    console.log(result.success ? '✓ PASS' : '✗ FAIL');
    console.log(result.message);
    console.log();

    // Test 2: Create a simple goal without target
    console.log('Test 2: Creating simple goal without target');
    result = await skill.execute('goal set Launch new feature by 2025-03-15', context);
    console.log(result.success ? '✓ PASS' : '✗ FAIL');
    console.log(result.message);
    console.log();

    // Test 3: List goals
    console.log('Test 3: Listing goals');
    result = await skill.execute('goal list', context);
    console.log(result.success ? '✓ PASS' : '✗ FAIL');
    console.log(result.message);
    console.log();

    // Test 4: Update progress
    console.log('Test 4: Updating goal progress');
    result = await skill.execute('goal update 1 8', context);
    console.log(result.success ? '✓ PASS' : '✗ FAIL');
    console.log(result.message);
    console.log();

    // Test 5: View statistics
    console.log('Test 5: Viewing statistics');
    result = await skill.execute('goal stats', context);
    console.log(result.success ? '✓ PASS' : '✗ FAIL');
    console.log(result.message);
    console.log();

    // Test 6: Complete goal
    console.log('Test 6: Completing a goal');
    result = await skill.execute('goal complete 2', context);
    console.log(result.success ? '✓ PASS' : '✗ FAIL');
    console.log(result.message);
    console.log();

    // Test 7: Delete goal
    console.log('Test 7: Deleting a goal');
    result = await skill.execute('goal delete 1', context);
    console.log(result.success ? '✓ PASS' : '✗ FAIL');
    console.log(result.message);
    console.log();

    console.log('✅ All tests completed!');
  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    // Cleanup: Delete all test goals
    console.log('\n🧹 Cleaning up test data...');
    const goals = db.listGoals(TEST_USER);
    for (const goal of goals) {
      db.deleteGoal(goal.id);
    }
    console.log(`Deleted ${goals.length} test goals`);
  }
}

runTests();
