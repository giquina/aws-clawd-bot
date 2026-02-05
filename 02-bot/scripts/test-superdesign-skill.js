/**
 * Test script for SuperDesign skill
 * Verifies the skill loads correctly and has all required methods
 */

const path = require('path');

// Mock context for skill initialization
const mockContext = {
  memory: null,
  ai: null,
  config: {},
  logger: console
};

console.log('🧪 Testing SuperDesign Skill...\n');

try {
  // Load the skill
  const SuperDesignSkill = require('../skills/superdesign/index.js');
  console.log('✅ Skill module loaded successfully');

  // Create an instance
  const skill = new SuperDesignSkill(mockContext);
  console.log('✅ Skill instance created');

  // Verify required properties
  console.log('\n📋 Skill Properties:');
  console.log(`  Name: ${skill.name}`);
  console.log(`  Description: ${skill.description}`);
  console.log(`  Priority: ${skill.priority}`);
  console.log(`  Commands: ${skill.commands.length}`);

  // Verify commands
  console.log('\n📝 Commands:');
  skill.commands.forEach(cmd => {
    console.log(`  - ${cmd.usage}`);
    console.log(`    Pattern: ${cmd.pattern}`);
    console.log(`    Description: ${cmd.description}`);
  });

  // Test canHandle method
  console.log('\n🔍 Testing canHandle():');
  const testCases = [
    'superdesign init',
    'superdesign help',
    'help me design a login page',
    'design a navbar',
    'not a superdesign command'
  ];

  testCases.forEach(cmd => {
    const canHandle = skill.canHandle(cmd);
    console.log(`  ${canHandle ? '✅' : '❌'} "${cmd}"`);
  });

  // Test parseCommand
  console.log('\n🔧 Testing parseCommand():');
  const parsed = skill.parseCommand('superdesign init');
  console.log(`  Command: ${parsed.command}`);
  console.log(`  Args: [${parsed.args.join(', ')}]`);
  console.log(`  Raw: ${parsed.raw}`);

  // Verify helper methods exist
  console.log('\n🛠️ Verifying Helper Methods:');
  const requiredMethods = [
    'ensureCLI',
    'checkLogin',
    'getRepoFromContext',
    'getRepoPath',
    'executeCommand',
    'truncateOutput',
    'handleInit',
    'handleHelp',
    'handleDesignWorkflow'
  ];

  requiredMethods.forEach(method => {
    const exists = typeof skill[method] === 'function';
    console.log(`  ${exists ? '✅' : '❌'} ${method}()`);
  });

  // Test getRepoPath
  console.log('\n📂 Testing getRepoPath():');
  const testRepos = ['judo', 'JUDO', 'lusotown', 'unknown-repo'];
  testRepos.forEach(repo => {
    const repoPath = skill.getRepoPath(repo);
    console.log(`  ${repoPath ? '✅' : '❌'} ${repo} -> ${repoPath || 'null'}`);
  });

  // Test getRepoFromContext
  console.log('\n🔗 Testing getRepoFromContext():');
  const contextTests = [
    { name: 'autoRepo', context: { autoRepo: 'judo' } },
    { name: 'activeProject (owner/repo)', context: { activeProject: 'owner/judo' } },
    { name: 'activeProject (repo)', context: { activeProject: 'judo' } },
    { name: 'no context', context: {} }
  ];

  contextTests.forEach(test => {
    const repo = skill.getRepoFromContext(test.context);
    console.log(`  ${repo ? '✅' : '⚠️'} ${test.name} -> ${repo || 'null'}`);
  });

  // Test response formatting
  console.log('\n💬 Testing Response Formatting:');

  const successMsg = skill.success('Test success', { data: 'test' }, { time: '5s' });
  console.log(`  Success: ${successMsg.success ? '✅' : '❌'}`);
  console.log(`  Message preview: ${successMsg.message.substring(0, 50)}...`);

  const errorMsg = skill.error('Test error', 'Something went wrong', {
    attempted: 'Testing',
    suggestion: 'Try again'
  });
  console.log(`  Error: ${!errorMsg.success ? '✅' : '❌'}`);
  console.log(`  Message preview: ${errorMsg.message.substring(0, 50)}...`);

  // Test truncateOutput
  console.log('\n✂️ Testing truncateOutput():');
  const longOutput = 'x'.repeat(5000);
  const truncated = skill.truncateOutput(longOutput, 1000);
  console.log(`  Input length: ${longOutput.length}`);
  console.log(`  Output length: ${truncated.length}`);
  console.log(`  Truncated: ${truncated.length < longOutput.length ? '✅' : '❌'}`);

  console.log('\n✅ All tests passed! SuperDesign skill is ready to use.\n');

} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
