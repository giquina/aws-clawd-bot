#!/usr/bin/env node
/**
 * Security Check Script
 * Runs npm audit and reports vulnerabilities
 *
 * Usage:
 *   node scripts/security-check.js          # Check only
 *   node scripts/security-check.js --fix    # Auto-fix if possible
 *   node scripts/security-check.js --ci     # Exit with error on vulnerabilities (for CI)
 */

const { execSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const isCI = args.includes('--ci');

const botDir = path.join(__dirname, '..', '02-whatsapp-bot');

console.log('🔒 Running Security Check...\n');

try {
  // Run npm audit
  const auditCmd = shouldFix ? 'npm audit fix' : 'npm audit --audit-level=high';

  try {
    const result = execSync(auditCmd, {
      cwd: botDir,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    console.log('✅ No high severity vulnerabilities found!\n');
    console.log(result);
    process.exit(0);
  } catch (auditError) {
    // npm audit exits with code 1 if vulnerabilities found
    console.log('⚠️  Vulnerabilities detected:\n');
    console.log(auditError.stdout || auditError.message);

    if (isCI) {
      console.log('\n❌ CI check failed due to security vulnerabilities');
      console.log('Run "npm run audit:fix" locally to attempt automatic fixes');
      process.exit(1);
    }

    if (!shouldFix) {
      console.log('\n💡 Run with --fix to attempt automatic fixes:');
      console.log('   node scripts/security-check.js --fix');
    }

    process.exit(0);
  }
} catch (error) {
  console.error('❌ Security check failed:', error.message);
  process.exit(1);
}
