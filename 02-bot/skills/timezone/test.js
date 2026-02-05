/**
 * Timezone Skill Test Suite
 *
 * Tests for the timezone skill including:
 * - Command pattern matching
 * - Timezone lookup and formatting
 * - Error handling
 * - Edge cases
 */

const TimezoneSkill = require('./index.js');

// Mock parseCommand from BaseSkill
function setupSkill() {
  const skill = new TimezoneSkill();
  skill.parseCommand = (cmd) => ({
    raw: cmd,
    args: cmd.match(/\s+(.+)$/) ? cmd.match(/\s+(.+)$/)[1].split(/\s+/) : []
  });
  return skill;
}

async function runTests() {
  console.log('🧪 Timezone Skill Test Suite\n');
  console.log('═'.repeat(50));

  let passed = 0;
  let failed = 0;

  const tests = [
    {
      name: 'Command: time in London',
      command: 'time in London',
      expectSuccess: true
    },
    {
      name: 'Command: timezone New York',
      command: 'timezone New York',
      expectSuccess: true
    },
    {
      name: 'Command: time in Tokyo',
      command: 'time in Tokyo',
      expectSuccess: true
    },
    {
      name: 'Command: timezone Dubai',
      command: 'timezone Dubai',
      expectSuccess: true
    },
    {
      name: 'Command: time in Sydney',
      command: 'time in Sydney',
      expectSuccess: true
    },
    {
      name: 'Command: time in Mexico City',
      command: 'time in Mexico City',
      expectSuccess: true
    },
    {
      name: 'Command: timezone Paris',
      command: 'timezone Paris',
      expectSuccess: true
    },
    {
      name: 'Error: missing city name',
      command: 'time in',
      expectSuccess: false
    },
    {
      name: 'Error: invalid city',
      command: 'time in Atlantis',
      expectSuccess: false
    },
    {
      name: 'Case insensitivity: LONDON',
      command: 'time in LONDON',
      expectSuccess: true
    },
    {
      name: 'Case insensitivity: ToKyO',
      command: 'timezone ToKyO',
      expectSuccess: true
    }
  ];

  for (const test of tests) {
    const skill = setupSkill();
    const result = await skill.execute(test.command, {});

    const testPassed = result.success === test.expectSuccess;
    const status = testPassed ? '✓ PASS' : '✗ FAIL';
    const icon = testPassed ? '✅' : '❌';

    console.log(`\n${icon} ${status}: ${test.name}`);
    console.log(`   Command: "${test.command}"`);
    console.log(`   Result: ${result.success ? 'SUCCESS' : 'ERROR'}`);

    if (!testPassed) {
      console.log(`   Expected: ${test.expectSuccess}`);
      console.log(`   Got: ${result.success}`);
      failed++;
    } else {
      passed++;
    }

    // Show message preview (truncated)
    const msgPreview = result.message.substring(0, 60).replace(/\n/g, ' ');
    console.log(`   Message: ${msgPreview}...`);
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);

  if (failed === 0) {
    console.log('✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
