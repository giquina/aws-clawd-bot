/**
 * ClawdBot Test Suite
 *
 * Comprehensive test script that verifies all bot components work correctly.
 * Tests: Memory System, Skills, Scheduler, GitHub Handler, AI Handler
 *
 * Run with: npm test (from 02-whatsapp-bot directory)
 * Or directly: node ../scripts/test-bot.js
 */

const path = require('path');
const fs = require('fs');

// Resolve paths relative to this script
const botDir = path.join(__dirname, '..', '02-whatsapp-bot');
const configDir = path.join(__dirname, '..', 'config');

// Add bot directory to module search path so we can require its dependencies
module.paths.unshift(path.join(botDir, 'node_modules'));

// Load environment variables
try {
    require('dotenv').config({
        path: path.join(configDir, '.env.local')
    });
} catch (error) {
    // dotenv might not be installed, try alternative location
    try {
        require(path.join(botDir, 'node_modules', 'dotenv')).config({
            path: path.join(configDir, '.env.local')
        });
    } catch (e) {
        console.warn('Warning: Could not load dotenv. Environment variables may not be set.');
    }
}

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m'
};

// Test result symbols
const PASS = `${colors.green}[PASS]${colors.reset}`;
const FAIL = `${colors.red}[FAIL]${colors.reset}`;
const SKIP = `${colors.yellow}[SKIP]${colors.reset}`;
const INFO = `${colors.cyan}[INFO]${colors.reset}`;

/**
 * Test results tracker
 */
const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    details: []
};

/**
 * Print a section header
 */
function printHeader(title) {
    console.log('\n' + colors.bright + colors.cyan + '=' .repeat(50) + colors.reset);
    console.log(colors.bright + `  ${title}` + colors.reset);
    console.log(colors.cyan + '=' .repeat(50) + colors.reset + '\n');
}

/**
 * Log a test result
 */
function logResult(component, testName, status, message = '') {
    results.total++;

    let symbol;
    switch (status) {
        case 'pass':
            results.passed++;
            symbol = PASS;
            break;
        case 'fail':
            results.failed++;
            symbol = FAIL;
            break;
        case 'skip':
            results.skipped++;
            symbol = SKIP;
            break;
    }

    const detail = { component, testName, status, message };
    results.details.push(detail);

    console.log(`  ${symbol} ${testName}${message ? ': ' + message : ''}`);
}

/**
 * Test the Memory System
 */
async function testMemorySystem() {
    printHeader('Memory System Tests');

    let memory;
    const testUserId = 'test_user_' + Date.now();

    try {
        // Import Memory Manager
        const { MemoryManager } = require('../02-whatsapp-bot/memory/memory-manager');

        // Create test instance with temp database
        const testDbPath = path.join(__dirname, 'test-clawd.db');
        memory = new MemoryManager(testDbPath);
        logResult('Memory', 'Initialize database', 'pass');

        // Test 1: Save a message
        try {
            const msgId = memory.saveMessage(testUserId, 'user', 'Hello, this is a test message!');
            if (msgId) {
                logResult('Memory', 'Save message', 'pass', `ID: ${msgId}`);
            } else {
                logResult('Memory', 'Save message', 'fail', 'No message ID returned');
            }
        } catch (error) {
            logResult('Memory', 'Save message', 'fail', error.message);
        }

        // Test 2: Retrieve conversation history
        try {
            const history = memory.getConversationHistory(testUserId, 10);
            if (history && history.length > 0) {
                logResult('Memory', 'Retrieve history', 'pass', `${history.length} message(s) found`);
            } else {
                logResult('Memory', 'Retrieve history', 'fail', 'No messages retrieved');
            }
        } catch (error) {
            logResult('Memory', 'Retrieve history', 'fail', error.message);
        }

        // Test 3: Save a fact
        try {
            const factId = memory.saveFact(testUserId, 'Prefers TypeScript over JavaScript', 'preference', 'test');
            if (factId) {
                logResult('Memory', 'Save fact', 'pass', `ID: ${factId}`);
            } else {
                logResult('Memory', 'Save fact', 'fail', 'No fact ID returned');
            }
        } catch (error) {
            logResult('Memory', 'Save fact', 'fail', error.message);
        }

        // Test 4: Retrieve facts
        try {
            const facts = memory.getFacts(testUserId);
            if (facts && facts.length > 0) {
                logResult('Memory', 'Retrieve facts', 'pass', `${facts.length} fact(s) found`);
            } else {
                logResult('Memory', 'Retrieve facts', 'fail', 'No facts retrieved');
            }
        } catch (error) {
            logResult('Memory', 'Retrieve facts', 'fail', error.message);
        }

        // Test 5: Create a task
        try {
            const taskId = memory.createTask(testUserId, 'Test Task', 'This is a test task', 'high');
            if (taskId) {
                logResult('Memory', 'Create task', 'pass', `ID: ${taskId}`);
            } else {
                logResult('Memory', 'Create task', 'fail', 'No task ID returned');
            }
        } catch (error) {
            logResult('Memory', 'Create task', 'fail', error.message);
        }

        // Test 6: Get tasks
        try {
            const tasks = memory.getTasks(testUserId);
            if (tasks && tasks.length > 0) {
                logResult('Memory', 'Get tasks', 'pass', `${tasks.length} task(s) found`);
            } else {
                logResult('Memory', 'Get tasks', 'fail', 'No tasks retrieved');
            }
        } catch (error) {
            logResult('Memory', 'Get tasks', 'fail', error.message);
        }

        // Test 7: Get user stats
        try {
            const stats = memory.getStats(testUserId);
            if (stats && typeof stats.totalMessages === 'number') {
                logResult('Memory', 'Get stats', 'pass', `Messages: ${stats.totalMessages}, Facts: ${stats.totalFacts}`);
            } else {
                logResult('Memory', 'Get stats', 'fail', 'Invalid stats returned');
            }
        } catch (error) {
            logResult('Memory', 'Get stats', 'fail', error.message);
        }

        // Cleanup: Close database and remove test file
        memory.close();
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
            // Also remove WAL files if they exist
            const walPath = testDbPath + '-wal';
            const shmPath = testDbPath + '-shm';
            if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
            if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
        }

    } catch (error) {
        logResult('Memory', 'Module import', 'fail', error.message);
        if (memory) memory.close();
    }
}

/**
 * Test Skills Loading
 */
async function testSkillsLoading() {
    printHeader('Skills Loading Tests');

    try {
        const skillLoader = require('../02-whatsapp-bot/skills/skill-loader');
        const registry = require('../02-whatsapp-bot/skills/skill-registry');

        logResult('Skills', 'Import modules', 'pass');

        // Test 1: Discover skill directories
        const skillsDir = path.join(__dirname, '..', '02-whatsapp-bot', 'skills');
        let skillDirs;

        try {
            skillDirs = skillLoader.discoverSkillDirs(skillsDir);
            if (skillDirs && skillDirs.length > 0) {
                logResult('Skills', 'Discover directories', 'pass', `${skillDirs.length} skill dir(s) found`);
            } else {
                logResult('Skills', 'Discover directories', 'fail', 'No skill directories found');
            }
        } catch (error) {
            logResult('Skills', 'Discover directories', 'fail', error.message);
        }

        // Test 2: Load all skills
        let loadedSkills;
        try {
            loadedSkills = await skillLoader.loadSkills(skillsDir, {}, { autoRegister: true });
            if (loadedSkills && loadedSkills.length > 0) {
                logResult('Skills', 'Load skills', 'pass', `${loadedSkills.length} skill(s) loaded`);
            } else {
                logResult('Skills', 'Load skills', 'fail', 'No skills loaded');
            }
        } catch (error) {
            logResult('Skills', 'Load skills', 'fail', error.message);
        }

        // Test 3: Verify skills have required methods
        if (loadedSkills && loadedSkills.length > 0) {
            let allValid = true;
            const invalidSkills = [];

            for (const skill of loadedSkills) {
                const hasName = typeof skill.name === 'string' && skill.name.length > 0;
                const hasExecute = typeof skill.execute === 'function';
                const hasCanHandle = typeof skill.canHandle === 'function';

                if (!hasName || !hasExecute || !hasCanHandle) {
                    allValid = false;
                    invalidSkills.push(skill.name || 'unnamed');
                }
            }

            if (allValid) {
                logResult('Skills', 'Verify methods', 'pass', 'All skills have required methods');
            } else {
                logResult('Skills', 'Verify methods', 'fail', `Invalid: ${invalidSkills.join(', ')}`);
            }
        }

        // Test 4: Test help skill response
        try {
            const helpSkill = registry.getSkill('help');
            if (helpSkill) {
                const canHandleHelp = helpSkill.canHandle('help');
                if (canHandleHelp) {
                    const response = await helpSkill.execute('help', {});
                    if (response && response.success) {
                        logResult('Skills', 'Help skill response', 'pass');
                    } else {
                        logResult('Skills', 'Help skill response', 'fail', 'Response not successful');
                    }
                } else {
                    logResult('Skills', 'Help skill response', 'fail', 'Cannot handle "help" command');
                }
            } else {
                logResult('Skills', 'Help skill response', 'skip', 'Help skill not loaded');
            }
        } catch (error) {
            logResult('Skills', 'Help skill response', 'fail', error.message);
        }

        // Test 5: List all registered skills
        try {
            const registeredSkills = registry.listSkills();
            console.log(`\n  ${INFO} Registered skills:`);
            for (const skill of registeredSkills) {
                console.log(`      - ${skill.name}: ${skill.commands.length} command(s)`);
            }
        } catch (error) {
            console.log(`  ${INFO} Could not list registered skills: ${error.message}`);
        }

        // Cleanup
        await registry.shutdown();

    } catch (error) {
        logResult('Skills', 'Module import', 'fail', error.message);
    }
}

/**
 * Test Scheduler
 */
async function testScheduler() {
    printHeader('Scheduler Tests');

    try {
        const { Scheduler } = require('../02-whatsapp-bot/scheduler/scheduler');

        // Create scheduler without database (in-memory mode)
        const mockSendMessage = async (msg) => {
            console.log(`      ${INFO} Mock message: ${msg.substring(0, 50)}...`);
        };

        const scheduler = new Scheduler(null, mockSendMessage);
        logResult('Scheduler', 'Create instance', 'pass');

        // Test 1: Start scheduler
        try {
            await scheduler.start();
            logResult('Scheduler', 'Start scheduler', 'pass');
        } catch (error) {
            logResult('Scheduler', 'Start scheduler', 'fail', error.message);
        }

        // Test 2: Schedule a test job
        let testJob;
        try {
            testJob = await scheduler.schedule(
                'test-job-' + Date.now(),
                '0 0 * * *', // Midnight daily (won't actually run during test)
                'custom',
                { message: 'This is a test scheduled message' }
            );

            if (testJob && testJob.id) {
                logResult('Scheduler', 'Schedule job', 'pass', `ID: ${testJob.id}`);
            } else {
                logResult('Scheduler', 'Schedule job', 'fail', 'No job ID returned');
            }
        } catch (error) {
            logResult('Scheduler', 'Schedule job', 'fail', error.message);
        }

        // Test 3: List jobs
        try {
            const jobs = await scheduler.list();
            // In-memory mode won't persist jobs to DB
            logResult('Scheduler', 'List jobs', 'pass', `${jobs.length} job(s) in DB (in-memory: ${scheduler.jobs.size})`);
        } catch (error) {
            logResult('Scheduler', 'List jobs', 'fail', error.message);
        }

        // Test 4: Cancel test job
        if (testJob) {
            try {
                const cancelled = await scheduler.cancel(testJob.id);
                if (cancelled || !scheduler.jobs.has(testJob.id)) {
                    logResult('Scheduler', 'Cancel job', 'pass');
                } else {
                    logResult('Scheduler', 'Cancel job', 'fail', 'Job still exists');
                }
            } catch (error) {
                logResult('Scheduler', 'Cancel job', 'fail', error.message);
            }
        }

        // Test 5: Health check handler
        try {
            const healthMessage = await scheduler.handleHealthCheck({});
            if (healthMessage && healthMessage.includes('Status:')) {
                logResult('Scheduler', 'Health check handler', 'pass');
            } else {
                logResult('Scheduler', 'Health check handler', 'fail', 'Invalid health check response');
            }
        } catch (error) {
            logResult('Scheduler', 'Health check handler', 'fail', error.message);
        }

        // Cleanup
        scheduler.stop();

    } catch (error) {
        logResult('Scheduler', 'Module import', 'fail', error.message);
    }
}

/**
 * Test GitHub Handler
 */
async function testGitHubHandler() {
    printHeader('GitHub Handler Tests');

    const hasToken = !!process.env.GITHUB_TOKEN;
    const hasUsername = !!process.env.GITHUB_USERNAME;
    const hasRepos = !!process.env.REPOS_TO_MONITOR;

    if (!hasToken || !hasUsername) {
        logResult('GitHub', 'Check credentials', 'skip', 'GITHUB_TOKEN or GITHUB_USERNAME not set');
        return;
    }

    if (!hasRepos) {
        logResult('GitHub', 'Check repos config', 'skip', 'REPOS_TO_MONITOR not set');
        return;
    }

    try {
        const githubHandler = require('../02-whatsapp-bot/github-handler');
        logResult('GitHub', 'Import module', 'pass');

        // Test 1: List repos
        try {
            const repoList = await githubHandler.listRepos();
            if (repoList && !repoList.includes('Failed')) {
                logResult('GitHub', 'List repos', 'pass');
                console.log(`      ${INFO} Response preview: ${repoList.substring(0, 100)}...`);
            } else {
                logResult('GitHub', 'List repos', 'fail', 'Failed to list repos');
            }
        } catch (error) {
            logResult('GitHub', 'List repos', 'fail', error.message);
        }

        // Test 2: Get repo info (for first monitored repo)
        try {
            const repos = process.env.REPOS_TO_MONITOR.split(',').map(r => r.trim());
            if (repos.length > 0) {
                const repoInfo = await githubHandler.getRepoInfo(repos[0]);
                if (repoInfo && repoInfo.name) {
                    logResult('GitHub', 'Get repo info', 'pass', `Repo: ${repoInfo.full_name}`);
                } else {
                    logResult('GitHub', 'Get repo info', 'fail', 'Invalid repo info');
                }
            }
        } catch (error) {
            logResult('GitHub', 'Get repo info', 'fail', error.message);
        }

    } catch (error) {
        logResult('GitHub', 'Module import', 'fail', error.message);
    }
}

/**
 * Test AI Handler
 */
async function testAIHandler() {
    printHeader('AI Handler Tests');

    const hasKey = !!process.env.ANTHROPIC_API_KEY;

    if (!hasKey) {
        logResult('AI', 'Check API key', 'skip', 'ANTHROPIC_API_KEY not set');
        return;
    }

    try {
        const aiHandler = require('../02-whatsapp-bot/ai-handler');
        logResult('AI', 'Import module', 'pass');

        // Test 1: Initialize client
        try {
            const client = aiHandler.initClient();
            if (client) {
                logResult('AI', 'Initialize client', 'pass');
            } else {
                logResult('AI', 'Initialize client', 'fail', 'Client is null');
            }
        } catch (error) {
            logResult('AI', 'Initialize client', 'fail', error.message);
        }

        // Test 2: Check new conversation state
        try {
            const isNew = aiHandler.isNewConversation();
            logResult('AI', 'Check conversation state', 'pass', `New conversation: ${isNew}`);
        } catch (error) {
            logResult('AI', 'Check conversation state', 'fail', error.message);
        }

        // Test 3: Get greeting
        try {
            const greeting = aiHandler.getGreeting();
            if (greeting && greeting.includes('ClawdBot')) {
                logResult('AI', 'Get greeting', 'pass');
            } else {
                logResult('AI', 'Get greeting', 'fail', 'Invalid greeting');
            }
        } catch (error) {
            logResult('AI', 'Get greeting', 'fail', error.message);
        }

        // Test 4: Process a simple query (actual API call)
        try {
            console.log(`      ${INFO} Sending test query to Claude API...`);
            const response = await aiHandler.processQuery('Say "Test successful" and nothing else.');

            if (response && typeof response === 'string' && response.length > 0) {
                logResult('AI', 'Process query', 'pass', `Response: ${response.substring(0, 50)}...`);
            } else {
                logResult('AI', 'Process query', 'fail', 'Empty or invalid response');
            }
        } catch (error) {
            logResult('AI', 'Process query', 'fail', error.message);
        }

        // Test 5: Clear history
        try {
            aiHandler.clearHistory();
            const isNewAfterClear = aiHandler.isNewConversation();
            if (isNewAfterClear) {
                logResult('AI', 'Clear history', 'pass');
            } else {
                logResult('AI', 'Clear history', 'fail', 'History not cleared');
            }
        } catch (error) {
            logResult('AI', 'Clear history', 'fail', error.message);
        }

    } catch (error) {
        logResult('AI', 'Module import', 'fail', error.message);
    }
}

/**
 * Print final summary
 */
function printSummary() {
    printHeader('Test Summary');

    // Group results by component
    const byComponent = {};
    for (const detail of results.details) {
        if (!byComponent[detail.component]) {
            byComponent[detail.component] = { pass: 0, fail: 0, skip: 0 };
        }
        byComponent[detail.component][detail.status]++;
    }

    console.log('Component Results:');
    console.log('-'.repeat(50));

    for (const [component, counts] of Object.entries(byComponent)) {
        let status;
        if (counts.fail > 0) {
            status = `${colors.red}FAIL${colors.reset}`;
        } else if (counts.skip > 0 && counts.pass === 0) {
            status = `${colors.yellow}SKIPPED${colors.reset}`;
        } else {
            status = `${colors.green}PASS${colors.reset}`;
        }

        const details = [];
        if (counts.pass > 0) details.push(`${counts.pass} passed`);
        if (counts.fail > 0) details.push(`${counts.fail} failed`);
        if (counts.skip > 0) details.push(`${counts.skip} skipped`);

        console.log(`  ${status.padEnd(20)} ${component}: ${details.join(', ')}`);
    }

    console.log('\n' + '-'.repeat(50));
    console.log(`\n${colors.bright}Overall Results:${colors.reset}`);
    console.log(`  Total tests: ${results.total}`);
    console.log(`  ${colors.green}Passed:${colors.reset} ${results.passed}`);
    console.log(`  ${colors.red}Failed:${colors.reset} ${results.failed}`);
    console.log(`  ${colors.yellow}Skipped:${colors.reset} ${results.skipped}`);

    // Final status
    console.log('\n' + '='.repeat(50));
    if (results.failed === 0) {
        console.log(`${colors.green}${colors.bright}All tests passed!${colors.reset}`);
    } else {
        console.log(`${colors.red}${colors.bright}${results.failed} test(s) failed.${colors.reset}`);
    }
    console.log('='.repeat(50) + '\n');

    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
}

/**
 * Main test runner
 */
async function runTests() {
    console.log('\n');
    console.log(colors.bright + colors.cyan + '╔══════════════════════════════════════════════════╗' + colors.reset);
    console.log(colors.bright + colors.cyan + '║           ClawdBot Test Suite                    ║' + colors.reset);
    console.log(colors.bright + colors.cyan + '║           Version 1.0.0                          ║' + colors.reset);
    console.log(colors.bright + colors.cyan + '╚══════════════════════════════════════════════════╝' + colors.reset);

    console.log(`\n${INFO} Starting tests at ${new Date().toISOString()}`);
    console.log(`${INFO} Working directory: ${__dirname}`);

    // Check environment
    console.log(`\n${INFO} Environment check:`);
    console.log(`      ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set'}`);
    console.log(`      GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? 'Set' : 'Not set'}`);
    console.log(`      GITHUB_USERNAME: ${process.env.GITHUB_USERNAME || 'Not set'}`);
    console.log(`      REPOS_TO_MONITOR: ${process.env.REPOS_TO_MONITOR ? 'Set' : 'Not set'}`);

    try {
        // Run all test suites
        await testMemorySystem();
        await testSkillsLoading();
        await testScheduler();
        await testGitHubHandler();
        await testAIHandler();

    } catch (error) {
        console.error(`\n${FAIL} Unexpected error during tests:`, error);
        process.exit(1);
    }

    // Print final summary
    printSummary();
}

// Run tests
runTests();
