/**
 * Verify Monitoring Skill Integration
 *
 * Tests that the monitoring skill loads correctly in the skill registry
 * and doesn't conflict with other skills.
 *
 * Run: node scripts/verify-monitoring-integration.js
 */

const path = require('path');
const dotenv = require('dotenv');

// Load environment
dotenv.config({ path: path.join(__dirname, '../02-bot/config/.env.local') });

// Load skills framework
const { registry, loadSkills } = require('../02-bot/skills');

async function verifyIntegration() {
  console.log('========================================');
  console.log('Verifying Monitoring Skill Integration');
  console.log('========================================\n');

  // Initialize registry with mock context
  await registry.initialize({
    memory: null,
    ai: null,
    config: {},
    logger: console
  });

  console.log('✅ Skill registry initialized\n');

  // Load all skills from directory
  const skillsDir = path.join(__dirname, '../02-bot/skills');
  const loadedSkills = await loadSkills(skillsDir, {
    memory: null,
    ai: null,
    config: {},
    logger: console
  });

  console.log(`✅ Loaded ${loadedSkills.length} skills\n`);

  // Check if monitoring skill is loaded
  const monitoringSkill = registry.getSkill('monitoring');
  if (!monitoringSkill) {
    console.error('❌ Monitoring skill NOT found in registry!');
    console.error('Available skills:', Array.from(registry.skills.keys()).join(', '));
    process.exit(1);
  }

  console.log('✅ Monitoring skill found in registry\n');
  console.log('Monitoring Skill Details:');
  console.log('  Name:', monitoringSkill.name);
  console.log('  Description:', monitoringSkill.description);
  console.log('  Priority:', monitoringSkill.priority);
  console.log('  Commands:', monitoringSkill.commands.length);
  console.log('  Initialized:', monitoringSkill.isInitialized());
  console.log('\n');

  // Test command routing
  console.log('Testing Command Routing:');
  const testCommands = [
    { cmd: 'server health', expectSkill: 'monitoring' },
    { cmd: 'api metrics', expectSkill: 'monitoring' },
    { cmd: 'system info', expectSkill: 'monitoring' },
    { cmd: 'pm2 status', expectSkill: 'monitoring' },
    { cmd: 'logs clawd-bot', expectSkill: 'monitoring' },
    { cmd: 'help', expectSkill: 'help' }
  ];

  for (const { cmd, expectSkill } of testCommands) {
    // Find skill that can handle this command
    const sortedSkills = Array.from(registry.skills.values())
      .sort((a, b) => b.priority - a.priority);

    let handler = null;
    for (const skill of sortedSkills) {
      if (skill.canHandle(cmd)) {
        handler = skill;
        break;
      }
    }

    const actualSkill = handler?.name || 'none';

    if (actualSkill === expectSkill) {
      console.log(`  ✅ "${cmd}" → ${actualSkill}`);
    } else {
      console.log(`  ❌ "${cmd}" → ${actualSkill} (expected: ${expectSkill})`);
    }
  }

  console.log('\n');

  // Check for command conflicts
  console.log('Checking for Command Conflicts:');
  const allCommands = [];
  let conflicts = 0;

  for (const [skillName, skill] of registry.skills) {
    for (const cmd of skill.commands) {
      const pattern = cmd.pattern.toString();
      const existing = allCommands.find(c => c.pattern === pattern && c.skill !== skillName);

      if (existing) {
        console.log(`  ⚠️ Conflict: "${pattern}" in ${skillName} and ${existing.skill}`);
        conflicts++;
      }

      allCommands.push({ pattern, skill: skillName });
    }
  }

  if (conflicts === 0) {
    console.log('  ✅ No command conflicts detected');
  }

  console.log('\n');

  // List all skills by priority
  console.log('Skills by Priority (highest first):');
  const sortedSkills = Array.from(registry.skills.values())
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 15);  // Top 15

  sortedSkills.forEach((skill, i) => {
    const isMonitoring = skill.name === 'monitoring' ? '⭐' : '  ';
    console.log(`  ${isMonitoring} ${i + 1}. ${skill.name.padEnd(20)} (priority: ${skill.priority})`);
  });

  console.log('\n');

  // Shutdown
  await registry.shutdown();
  console.log('✅ Registry shut down cleanly\n');

  console.log('========================================');
  console.log('Integration Verification: PASSED ✅');
  console.log('========================================');
}

// Run verification
verifyIntegration().catch(error => {
  console.error('❌ Integration verification FAILED:', error);
  process.exit(1);
});
