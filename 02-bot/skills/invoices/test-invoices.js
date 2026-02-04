/**
 * Test script for Invoice Management Skill
 * Run: node skills/invoices/test-invoices.js
 */

const InvoicesSkill = require('./index.js');
const db = require('../../lib/database');

async function runTests() {
  console.log('\n========================================');
  console.log('Testing Invoice Management Skill');
  console.log('========================================\n');

  const skill = new InvoicesSkill();
  const testUserId = 'test-user-123';
  const testContext = {
    from: testUserId,
    chatId: 'test-chat-123',
    platform: 'telegram',
    messageId: 'test-msg-123',
    timestamp: new Date()
  };

  let testInvoiceNumber = null;

  try {
    // Test 1: Create invoice
    console.log('Test 1: Create invoice');
    const createResult = await skill.execute('invoice create "Test Client Ltd" 1500.50 GBP', testContext);
    console.log('Result:', createResult.success ? '✓ SUCCESS' : '✗ FAILED');
    if (createResult.data) {
      testInvoiceNumber = createResult.data.invoiceNumber;
      console.log('Invoice Number:', testInvoiceNumber);
    }
    console.log('Message:', createResult.message);
    console.log();

    // Test 2: List invoices
    console.log('Test 2: List invoices');
    const listResult = await skill.execute('invoice list', testContext);
    console.log('Result:', listResult.success ? '✓ SUCCESS' : '✗ FAILED');
    console.log('Message:', listResult.message);
    console.log();

    // Test 3: Get invoice status
    if (testInvoiceNumber) {
      console.log('Test 3: Get invoice status');
      const statusResult = await skill.execute(`invoice status ${testInvoiceNumber}`, testContext);
      console.log('Result:', statusResult.success ? '✓ SUCCESS' : '✗ FAILED');
      console.log('Message:', statusResult.message);
      console.log();

      // Test 4: Send invoice (generate PDF)
      console.log('Test 4: Send invoice');
      const sendResult = await skill.execute(`invoice send ${testInvoiceNumber}`, testContext);
      console.log('Result:', sendResult.success ? '✓ SUCCESS' : '✗ FAILED');
      console.log('Message:', sendResult.message);
      console.log();

      // Test 5: List sent invoices
      console.log('Test 5: List sent invoices');
      const listSentResult = await skill.execute('invoice list sent', testContext);
      console.log('Result:', listSentResult.success ? '✓ SUCCESS' : '✗ FAILED');
      console.log('Message:', listSentResult.message);
      console.log();

      // Test 6: Mark as paid
      console.log('Test 6: Mark invoice as paid');
      const paidResult = await skill.execute(`invoice paid ${testInvoiceNumber}`, testContext);
      console.log('Result:', paidResult.success ? '✓ SUCCESS' : '✗ FAILED');
      console.log('Message:', paidResult.message);
      console.log();

      // Test 7: List paid invoices
      console.log('Test 7: List paid invoices');
      const listPaidResult = await skill.execute('invoice list paid', testContext);
      console.log('Result:', listPaidResult.success ? '✓ SUCCESS' : '✗ FAILED');
      console.log('Message:', listPaidResult.message);
      console.log();

      // Cleanup: Delete test invoice
      console.log('Cleanup: Delete test invoice');
      const deleteResult = await skill.execute(`invoice delete ${testInvoiceNumber}`, testContext);
      console.log('Result:', deleteResult.success ? '✓ SUCCESS' : '✗ FAILED');
      console.log('Message:', deleteResult.message);
      console.log();
    }

    console.log('========================================');
    console.log('All tests completed!');
    console.log('========================================\n');

  } catch (error) {
    console.error('Test error:', error);
    process.exit(1);
  }

  process.exit(0);
}

runTests();
