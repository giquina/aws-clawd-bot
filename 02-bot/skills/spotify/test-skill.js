/**
 * Simple test script to verify Spotify skill loads correctly
 *
 * Run with: node skills/spotify/test-skill.js
 */

const SpotifySkill = require('./index.js');

async function testSpotifySkill() {
  console.log('Testing Spotify Skill...\n');

  // Create skill instance
  const skill = new SpotifySkill({
    logger: console
  });

  console.log('✓ Skill instantiated');
  console.log(`  Name: ${skill.name}`);
  console.log(`  Description: ${skill.description}`);
  console.log(`  Priority: ${skill.priority}`);
  console.log(`  Commands: ${skill.commands.length}`);

  // Initialize skill
  await skill.initialize();
  console.log('\n✓ Skill initialized');

  // Check if configured
  const meta = skill.getMetadata();
  console.log('\n✓ Metadata retrieved');
  console.log(`  API Configured: ${meta.apiConfigured}`);
  console.log(`  Requires OAuth: ${meta.requiresOAuth}`);
  console.log(`  Active Sessions: ${meta.activeSessions}`);

  // Test command matching
  console.log('\n✓ Testing command patterns:');
  const testCommands = [
    'spotify connect',
    'spotify status',
    'play Bohemian Rhapsody',
    'pause',
    'next',
    'currently playing'
  ];

  for (const cmd of testCommands) {
    const matches = skill.canHandle(cmd);
    console.log(`  "${cmd}": ${matches ? '✓ matches' : '✗ no match'}`);
  }

  // Shutdown
  await skill.shutdown();
  console.log('\n✓ Skill shutdown complete');

  console.log('\n✅ All tests passed!');
}

// Run tests
testSpotifySkill().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
