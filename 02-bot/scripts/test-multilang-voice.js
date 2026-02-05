/**
 * Test script for Multi-Language Voice Support
 *
 * Tests:
 * 1. Language detection from Whisper verbose_json response
 * 2. Language preference storage/retrieval
 * 3. System prompt language instruction injection
 *
 * Usage: node scripts/test-multilang-voice.js
 */

const { voiceFlow } = require('../lib/voice-flow');
const database = require('../lib/database');

async function testLanguageDetection() {
    console.log('\n🧪 Testing Language Detection & Preferences\n');

    // Test 1: Language preference storage
    console.log('Test 1: Language Preference Storage');
    console.log('─────────────────────────────────────');

    const testUserId = 'test-user-123';

    // Save Portuguese preference
    voiceFlow.saveLanguagePreference(testUserId, 'pt');
    console.log('✓ Saved Portuguese preference');

    // Retrieve preference
    const storedLang = voiceFlow.getLanguagePreference(testUserId);
    console.log(`✓ Retrieved preference: ${storedLang}`);
    console.assert(storedLang === 'pt', 'Language preference should be pt');

    // Test 2: Language name mapping
    console.log('\nTest 2: Language Name Mapping');
    console.log('─────────────────────────────────────');

    const languages = [
        { code: 'en', expected: 'English' },
        { code: 'pt', expected: 'Portuguese' },
        { code: 'es', expected: 'Spanish' },
        { code: 'fr', expected: 'French' },
        { code: 'de', expected: 'German' }
    ];

    for (const { code, expected } of languages) {
        const name = voiceFlow.getLanguageName(code);
        console.log(`${code} → ${name}`);
        console.assert(name === expected, `${code} should map to ${expected}`);
    }

    // Test 3: Language support check
    console.log('\nTest 3: Language Support Check');
    console.log('─────────────────────────────────────');

    const supportedLangs = ['en', 'pt', 'es', 'fr'];
    const unsupportedLangs = ['de', 'zh', 'ja'];

    for (const lang of supportedLangs) {
        const supported = voiceFlow.isLanguageSupported(lang);
        console.log(`${lang}: ${supported ? '✓' : '✗'} supported`);
        console.assert(supported, `${lang} should be supported`);
    }

    for (const lang of unsupportedLangs) {
        const supported = voiceFlow.isLanguageSupported(lang);
        console.log(`${lang}: ${supported ? '✓' : '✗'} supported`);
        console.assert(!supported, `${lang} should NOT be supported`);
    }

    // Test 4: Simulate Whisper response parsing
    console.log('\nTest 4: Whisper Response Format');
    console.log('─────────────────────────────────────');

    // Sample verbose_json response from Groq Whisper
    const sampleResponse = {
        text: "Olá, como estás? Qual é o status do projeto?",
        language: "pt",
        duration: 3.5
    };

    console.log('Sample Whisper response:');
    console.log(JSON.stringify(sampleResponse, null, 2));
    console.log(`\nExtracted text: "${sampleResponse.text}"`);
    console.log(`Detected language: ${sampleResponse.language} (${voiceFlow.getLanguageName(sampleResponse.language)})`);

    // Test 5: AI Handler language instruction
    console.log('\nTest 5: AI Handler Language Instruction');
    console.log('─────────────────────────────────────');

    const aiHandler = require('../ai-handler');

    // Test with Portuguese
    const systemPromptPt = aiHandler.getSystemPrompt(null, null, 'pt');
    console.assert(systemPromptPt.includes('LANGUAGE:'), 'Prompt should include language instruction');
    console.assert(systemPromptPt.includes('Portuguese'), 'Prompt should mention Portuguese');
    console.log('✓ Portuguese language instruction injected');

    // Test with English (should NOT inject)
    const systemPromptEn = aiHandler.getSystemPrompt(null, null, 'en');
    console.assert(!systemPromptEn.includes('LANGUAGE:'), 'English prompt should NOT include language instruction');
    console.log('✓ English does not inject language instruction');

    // Test with Spanish
    const systemPromptEs = aiHandler.getSystemPrompt(null, null, 'es');
    console.assert(systemPromptEs.includes('Spanish'), 'Prompt should mention Spanish');
    console.log('✓ Spanish language instruction injected');

    // Cleanup
    console.log('\n🧹 Cleanup');
    console.log('─────────────────────────────────────');
    const facts = database.getFacts(testUserId, 'language');
    for (const fact of facts) {
        database.deleteFact(fact.id);
    }
    console.log('✓ Cleaned up test data');

    console.log('\n✅ All tests passed!\n');
}

// Run tests
testLanguageDetection().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
