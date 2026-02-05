/**
 * Test wellness skill integration with skill registry
 */

const registry = require('./skills/skill-registry');

async function test() {
  console.log('Testing wellness skill in registry...\n');

  // Load skills
  await registry.loadSkills({ memory: {}, logger: console });

  // Check if wellness is loaded
  const wellness = registry.getSkillByName('wellness');

  if (wellness) {
    console.log('✅ Wellness skill found in registry');
    console.log('Priority:', wellness.priority);
    console.log('Commands:', wellness.commands.length);
    console.log('Description:', wellness.description);
    console.log('\nCommands:');
    wellness.commands.forEach(cmd => {
      console.log(`  - ${cmd.usage}: ${cmd.description}`);
    });
  } else {
    console.log('❌ Wellness skill NOT found in registry');
    process.exit(1);
  }

  // Test command routing
  console.log('\n\nTesting command routing...');
  const testCommands = [
    'wellness on',
    'wellness off',
    'wellness status',
    'wellness config 120'
  ];

  for (const cmd of testCommands) {
    const handler = registry.findHandler(cmd);
    console.log(`"${cmd}" -> ${handler ? handler.name : 'NO HANDLER'}`);
  }

  console.log('\n✅ All registry tests passed');
}

test().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
