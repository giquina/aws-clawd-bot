/**
 * Test script for Image Generation Skill
 *
 * Tests:
 * 1. Skill initialization
 * 2. Command pattern matching
 * 3. Approval flow
 * 4. Error handling
 *
 * Usage:
 *   node 02-bot/skills/image-gen/test.js
 */

const ImageGenSkill = require('./index');

// Mock context
const mockContext = {
  memory: null,
  ai: null,
  config: {},
  logger: console
};

// Mock environment variables
process.env.REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || 'test_token';

async function runTests() {
  console.log('🧪 Testing Image Generation Skill...\n');

  const skill = new ImageGenSkill(mockContext);

  // Test 1: Initialization
  console.log('Test 1: Initialization');
  try {
    await skill.initialize();
    console.log('✅ Skill initialized successfully\n');
  } catch (error) {
    console.error('❌ Initialization failed:', error.message);
    return;
  }

  // Test 2: Command pattern matching
  console.log('Test 2: Command Pattern Matching');
  const testCommands = [
    'generate image a sunset',
    'generate logo modern tech',
    'create image mountain landscape',
    'make image futuristic city',
    'generate image',
    'analyze image', // Should NOT match
    'hello' // Should NOT match
  ];

  for (const cmd of testCommands) {
    const canHandle = skill.canHandle(cmd);
    console.log(`  "${cmd}" -> ${canHandle ? '✅ Match' : '❌ No match'}`);
  }
  console.log();

  // Test 3: Approval flow
  console.log('Test 3: Approval Flow');
  try {
    const result = await skill.execute('generate image a beautiful sunset over mountains', {
      userId: 'test_user',
      chatId: 'test_chat',
      fromNumber: '+1234567890',
      platform: 'telegram',
      messageId: 'test_msg',
      timestamp: new Date()
    });

    console.log('  Result:', JSON.stringify(result, null, 2));

    if (result.needsApproval) {
      console.log('✅ Approval flow triggered correctly');
      console.log('  Action:', result.approvalData?.action || 'generate-image');
      console.log('  Prompt:', result.approvalData?.prompt);
    } else {
      console.log('❌ Approval flow not triggered');
    }
  } catch (error) {
    console.error('❌ Approval flow test failed:', error.message);
  }
  console.log();

  // Test 4: Logo optimization
  console.log('Test 4: Logo Optimization');
  try {
    const result = await skill.execute('generate logo modern tech startup', {
      userId: 'test_user',
      chatId: 'test_chat',
      fromNumber: '+1234567890',
      platform: 'telegram',
      messageId: 'test_msg',
      timestamp: new Date()
    });

    if (result.approvalData?.prompt.includes('professional logo design')) {
      console.log('✅ Logo prompt optimized correctly');
      console.log('  Optimized prompt:', result.approvalData.prompt);
    } else {
      console.log('❌ Logo prompt not optimized');
    }
  } catch (error) {
    console.error('❌ Logo optimization test failed:', error.message);
  }
  console.log();

  // Test 5: Error handling - Missing prompt
  console.log('Test 5: Error Handling - Missing Prompt');
  try {
    const result = await skill.execute('generate image', {
      userId: 'test_user',
      chatId: 'test_chat',
      fromNumber: '+1234567890',
      platform: 'telegram',
      messageId: 'test_msg',
      timestamp: new Date()
    });

    if (!result.success) {
      console.log('✅ Error handling works correctly');
      console.log('  Error message:', result.message);
    } else {
      console.log('❌ Error not detected');
    }
  } catch (error) {
    console.error('❌ Error handling test failed:', error.message);
  }
  console.log();

  // Test 6: Error handling - No API token
  console.log('Test 6: Error Handling - No API Token');
  const originalToken = process.env.REPLICATE_API_TOKEN;
  delete process.env.REPLICATE_API_TOKEN;

  try {
    const result = await skill.execute('generate image test', {
      userId: 'test_user',
      chatId: 'test_chat',
      fromNumber: '+1234567890',
      platform: 'telegram',
      messageId: 'test_msg',
      timestamp: new Date()
    });

    if (!result.success && result.message.includes('not configured')) {
      console.log('✅ API token check works correctly');
      console.log('  Error message:', result.message);
    } else {
      console.log('❌ API token check failed');
    }
  } catch (error) {
    console.error('❌ API token test failed:', error.message);
  }

  process.env.REPLICATE_API_TOKEN = originalToken;
  console.log();

  // Test 7: Metadata
  console.log('Test 7: Skill Metadata');
  const metadata = skill.getMetadata();
  console.log('  Name:', metadata.name);
  console.log('  Description:', metadata.description);
  console.log('  Priority:', metadata.priority);
  console.log('  Commands:', metadata.commands.length);
  console.log('✅ Metadata retrieved successfully\n');

  // Test 8: Shutdown
  console.log('Test 8: Shutdown');
  try {
    await skill.shutdown();
    console.log('✅ Skill shut down successfully\n');
  } catch (error) {
    console.error('❌ Shutdown failed:', error.message);
  }

  console.log('🎉 All tests completed!\n');
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
