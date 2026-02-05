/**
 * Test script for dual-path skill loading
 *
 * This demonstrates the new skill-loader.js functionality that loads skills
 * from both ~/.claude/skills/ (universal) and 02-bot/skills/ (local).
 *
 * Run with: node 02-bot/test-skill-loader.js
 */

const path = require('path');
const { discoverSkills, SKILL_PATHS } = require('./skills/skill-loader');

console.log('=== ClawdBot Skill Loader Test ===\n');

// Display configured paths
console.log('Configured skill paths:');
SKILL_PATHS.forEach(({ path: skillPath, source, priority }) => {
  console.log(`  [Priority ${priority}] ${source}: ${skillPath}`);
});
console.log('');

// Discover skills from all paths
console.log('Discovering skills from all paths...\n');
const skills = discoverSkills();

console.log('\n=== Discovery Results ===');
console.log(`Total unique skills found: ${skills.length}\n`);

// Group by source
const bySource = skills.reduce((acc, skill) => {
  acc[skill.source] = acc[skill.source] || [];
  acc[skill.source].push(skill);
  return acc;
}, {});

console.log('Skills by source:');
Object.entries(bySource).forEach(([source, skillList]) => {
  console.log(`\n${source.toUpperCase()} (${skillList.length} skills):`);
  skillList.forEach(skill => {
    console.log(`  ✓ ${skill.name}`);
    console.log(`    Path: ${skill.path}`);
  });
});

console.log('\n=== Test Complete ===');
