#!/usr/bin/env node
/**
 * Setup Git Hooks
 * Installs pre-commit hook for security checks
 *
 * Usage: node scripts/setup-hooks.js
 */

const fs = require('fs');
const path = require('path');

const gitHooksDir = path.join(__dirname, '..', '.git', 'hooks');
const preCommitPath = path.join(gitHooksDir, 'pre-commit');

const preCommitScript = `#!/bin/sh
# Pre-commit hook for ClawdBot
# Runs security audit before each commit

echo "🔒 Running pre-commit security check..."

cd "$(git rev-parse --show-toplevel)/02-whatsapp-bot"

# Run npm audit (high severity only)
npm audit --audit-level=high > /dev/null 2>&1
AUDIT_RESULT=$?

if [ $AUDIT_RESULT -ne 0 ]; then
  echo ""
  echo "⚠️  Security vulnerabilities detected!"
  echo ""
  npm audit --audit-level=high
  echo ""
  echo "Run 'npm audit fix' to attempt automatic fixes"
  echo "Or use 'git commit --no-verify' to skip this check (not recommended)"
  exit 1
fi

echo "✅ No high severity vulnerabilities found"
exit 0
`;

try {
  // Ensure hooks directory exists
  if (!fs.existsSync(gitHooksDir)) {
    console.log('❌ Git hooks directory not found. Is this a git repository?');
    process.exit(1);
  }

  // Write pre-commit hook
  fs.writeFileSync(preCommitPath, preCommitScript, { mode: 0o755 });
  console.log('✅ Pre-commit hook installed successfully!');
  console.log(`   Location: ${preCommitPath}`);
  console.log('\n📋 The hook will:');
  console.log('   - Run npm audit before each commit');
  console.log('   - Block commits with high severity vulnerabilities');
  console.log('   - Allow bypass with: git commit --no-verify');

} catch (error) {
  console.error('❌ Failed to install hook:', error.message);
  process.exit(1);
}
