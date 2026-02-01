/**
 * Autonomous Module
 *
 * Entry point for ClawdBot's autonomous operation system.
 * Provides proactive, overnight task execution capabilities.
 *
 * Components:
 * - config: Configuration management
 * - projectScanner: Repository analysis and task identification
 * - taskExecutor: Safe task execution with AI
 * - morningReport: Progress reporting
 * - nightlyJob: Scheduled overnight execution
 */

const config = require('./config');
const projectScanner = require('./project-scanner');
const TaskExecutor = require('./task-executor');
const morningReport = require('./morning-report');
const nightlyJob = require('../scheduler/jobs/nightly-autonomous');

module.exports = {
  // Configuration manager
  config,

  // Project scanner
  projectScanner,

  // Task executor
  TaskExecutor,

  // Morning report generator
  morningReport,

  // Nightly job
  nightlyJob,

  // Convenience re-exports
  getConfig: config.getConfig,
  setConfig: config.setConfig,
  isAutonomousEnabled: config.isAutonomousEnabled,
  isSafeModeEnabled: config.isSafeModeEnabled,

  // Quick access methods
  async scanRepos() {
    return projectScanner.scanAllRepos();
  },

  async getTopTasks(limit = 5) {
    return projectScanner.getHighLeverageTasks(limit);
  },

  async executeTask(task, options = {}) {
    const executor = new TaskExecutor(options);
    return executor.executeTask(task);
  },

  async generateReport(results) {
    return morningReport.generateReport(results);
  }
};
