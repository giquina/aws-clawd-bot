/**
 * Monitoring & Analytics Skill - System health monitoring
 *
 * Provides real-time monitoring of server health, resource usage, and service logs.
 * Integrates with PM2 for process metrics and systeminformation for system metrics.
 * Alerts on threshold breaches (CPU, RAM, disk usage).
 *
 * Commands:
 *   server health          - Get CPU, RAM, disk usage
 *   api metrics            - Get API response times, error rates
 *   logs <service>         - Tail service logs (PM2)
 *   pm2 status             - List PM2 processes
 *   pm2 restart <name>     - Restart PM2 process
 *   system info            - Detailed system information
 *
 * @example
 * server health
 * api metrics
 * logs clawd-bot
 * pm2 status
 * pm2 restart clawd-bot
 * system info
 *
 * Voice examples:
 * - "check server health"
 * - "show me the logs"
 * - "what's the CPU usage?"
 */
const BaseSkill = require('../base-skill');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class MonitoringSkill extends BaseSkill {
  name = 'monitoring';
  description = 'Monitor server health, resources, and service logs';
  priority = 20;

  commands = [
    {
      pattern: /^server health$/i,
      description: 'Get CPU, RAM, disk usage',
      usage: 'server health'
    },
    {
      pattern: /^api metrics$/i,
      description: 'Get API response times, error rates',
      usage: 'api metrics'
    },
    {
      pattern: /^logs\s+(.+)$/i,
      description: 'Tail service logs (PM2)',
      usage: 'logs <service>'
    },
    {
      pattern: /^pm2 status$/i,
      description: 'List PM2 processes',
      usage: 'pm2 status'
    },
    {
      pattern: /^pm2 restart\s+(.+)$/i,
      description: 'Restart PM2 process',
      usage: 'pm2 restart <name>'
    },
    {
      pattern: /^system info$/i,
      description: 'Detailed system information',
      usage: 'system info'
    }
  ];

  // Thresholds for alerts
  THRESHOLDS = {
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 70, critical: 90 },
    disk: { warning: 80, critical: 95 }
  };

  constructor(context = {}) {
    super(context);
    this.metricsCache = new Map(); // { metric: { data, timestamp } }
    this.CACHE_TTL_MS = 30 * 1000; // 30 seconds for system metrics
    this.systemInfoAvailable = false;
  }

  /**
   * Initialize the skill and check for dependencies
   */
  async initialize() {
    await super.initialize();

    try {
      // Check if systeminformation is available
      try {
        require('systeminformation');
        this.systemInfoAvailable = true;
        this.log('info', 'Monitoring skill initialized with systeminformation');
      } catch (error) {
        this.systemInfoAvailable = false;
        this.log('warn', 'systeminformation not installed. Using fallback methods.');
      }

      // Check if PM2 is available
      try {
        await execAsync('pm2 -v');
        this.log('info', 'PM2 detected');
      } catch (error) {
        this.log('warn', 'PM2 not available on this system');
      }
    } catch (error) {
      this.log('error', 'Error initializing monitoring skill', error);
    }
  }

  /**
   * Execute monitoring commands
   */
  async execute(command, context) {
    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Server health
    if (lowerCommand === 'server health') {
      return await this.handleServerHealth();
    }

    // API metrics
    if (lowerCommand === 'api metrics') {
      return await this.handleApiMetrics();
    }

    // Logs
    if (lowerCommand.startsWith('logs ')) {
      const service = lowerCommand.replace(/^logs\s+/, '').trim();
      return await this.handleLogs(service);
    }

    // PM2 status
    if (lowerCommand === 'pm2 status') {
      return await this.handlePM2Status();
    }

    // PM2 restart
    if (lowerCommand.startsWith('pm2 restart ')) {
      const processName = lowerCommand.replace(/^pm2 restart\s+/, '').trim();
      return await this.handlePM2Restart(processName);
    }

    // System info
    if (lowerCommand === 'system info') {
      return await this.handleSystemInfo();
    }

    return this.error('Unknown monitoring command');
  }

  /**
   * Handle server health check
   */
  async handleServerHealth() {
    try {
      const metrics = await this._getSystemMetrics();

      const response = this._formatHealthResponse(metrics);
      this.log('info', 'Retrieved server health metrics');
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error fetching server health', error);
      return this.error(
        'Failed to fetch server health',
        error.message,
        {
          suggestion: 'Ensure systeminformation package is installed or PM2 is running'
        }
      );
    }
  }

  /**
   * Handle API metrics
   */
  async handleApiMetrics() {
    try {
      // Get metrics from activity log or database
      const activityLog = require('../../lib/activity-log');
      const recentActivity = activityLog.getRecent(50);

      // Calculate metrics
      const apiCalls = recentActivity.filter(a => a.type === 'api_call');
      const totalCalls = apiCalls.length;
      const errors = apiCalls.filter(a => a.level === 'error').length;
      const errorRate = totalCalls > 0 ? ((errors / totalCalls) * 100).toFixed(1) : 0;

      // Calculate average response time if available
      const responseTimes = apiCalls
        .filter(a => a.metadata?.responseTime)
        .map(a => a.metadata.responseTime);
      const avgResponseTime = responseTimes.length > 0
        ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(0)
        : 'N/A';

      let response = `*API Metrics* (Last 50 calls)\n\n`;
      response += `📊 Total Calls: ${totalCalls}\n`;
      response += `${this._getErrorIcon(errorRate)} Error Rate: ${errorRate}%\n`;
      response += `⏱️ Avg Response: ${avgResponseTime}ms\n\n`;

      if (errors > 0) {
        response += `⚠️ *Recent Errors:*\n`;
        const recentErrors = apiCalls.filter(a => a.level === 'error').slice(0, 3);
        recentErrors.forEach((err, i) => {
          response += `${i + 1}. ${err.message || 'Unknown error'}\n`;
        });
      }

      this.log('info', 'Retrieved API metrics');
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error fetching API metrics', error);
      return this.error(
        'Failed to fetch API metrics',
        error.message,
        {
          suggestion: 'Check that activity log is enabled'
        }
      );
    }
  }

  /**
   * Handle logs request
   */
  async handleLogs(service) {
    try {
      // Try PM2 logs first
      try {
        const { stdout } = await execAsync(`pm2 logs ${service} --lines 20 --nostream --raw`);

        let response = `*Logs for ${service}* (Last 20 lines)\n\n`;
        response += '```\n';
        response += stdout.trim().slice(-2000); // Limit to 2000 chars
        response += '\n```';

        this.log('info', `Retrieved PM2 logs for ${service}`);
        return this.success(response);
      } catch (pm2Error) {
        // Fallback to reading log files
        const logPath = path.join('/opt/clawd-bot/logs', `${service}.log`);
        const logContent = await fs.readFile(logPath, 'utf-8');
        const lines = logContent.split('\n').slice(-20);

        let response = `*Logs for ${service}* (Last 20 lines)\n\n`;
        response += '```\n';
        response += lines.join('\n').slice(-2000); // Limit to 2000 chars
        response += '\n```';

        this.log('info', `Retrieved file logs for ${service}`);
        return this.success(response);
      }
    } catch (error) {
      this.log('error', `Error fetching logs for ${service}`, error);
      return this.error(
        `Failed to fetch logs for "${service}"`,
        error.message,
        {
          suggestion: 'Check service name or ensure PM2 is running'
        }
      );
    }
  }

  /**
   * Handle PM2 status
   */
  async handlePM2Status() {
    try {
      const { stdout } = await execAsync('pm2 jlist');
      const processes = JSON.parse(stdout);

      if (processes.length === 0) {
        return this.success('No PM2 processes running');
      }

      let response = `*PM2 Process Status*\n\n`;

      processes.forEach(proc => {
        const name = proc.name;
        const status = proc.pm2_env.status;
        const uptime = this._formatUptime(proc.pm2_env.pm_uptime);
        const cpu = proc.monit?.cpu ? `${proc.monit.cpu.toFixed(1)}%` : 'N/A';
        const memory = proc.monit?.memory ? this._formatBytes(proc.monit.memory) : 'N/A';
        const restarts = proc.pm2_env.restart_time || 0;

        const statusIcon = status === 'online' ? '🟢' : '🔴';

        response += `${statusIcon} *${name}*\n`;
        response += `  Status: ${status}\n`;
        response += `  Uptime: ${uptime}\n`;
        response += `  CPU: ${cpu} | RAM: ${memory}\n`;
        response += `  Restarts: ${restarts}\n\n`;
      });

      this.log('info', 'Retrieved PM2 status');
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error fetching PM2 status', error);
      return this.error(
        'Failed to fetch PM2 status',
        error.message,
        {
          suggestion: 'Ensure PM2 is installed and running'
        }
      );
    }
  }

  /**
   * Handle PM2 restart
   */
  async handlePM2Restart(processName) {
    try {
      const { stdout } = await execAsync(`pm2 restart ${processName}`);

      this.log('info', `Restarted PM2 process: ${processName}`);
      return this.success(`Restarted process: ${processName}\n\n${stdout.trim()}`);
    } catch (error) {
      this.log('error', `Error restarting PM2 process: ${processName}`, error);
      return this.error(
        `Failed to restart process "${processName}"`,
        error.message,
        {
          suggestion: 'Check process name with "pm2 status"'
        }
      );
    }
  }

  /**
   * Handle system info request
   */
  async handleSystemInfo() {
    try {
      const metrics = await this._getSystemMetrics();

      let response = `*System Information*\n\n`;
      response += `🖥️ *OS:* ${metrics.os || 'Unknown'}\n`;
      response += `🏗️ *Architecture:* ${metrics.arch || 'Unknown'}\n`;
      response += `⚡ *Node.js:* ${process.version}\n`;
      response += `🕐 *Uptime:* ${this._formatUptime(process.uptime() * 1000)}\n\n`;
      response += `*Resources:*\n`;
      response += `${this._getStatusIcon(metrics.cpuPercent)} CPU: ${metrics.cpuPercent}%\n`;
      response += `${this._getStatusIcon(metrics.memoryPercent)} RAM: ${metrics.memoryPercent}% (${metrics.memoryUsed})\n`;
      response += `${this._getStatusIcon(metrics.diskPercent)} Disk: ${metrics.diskPercent}% (${metrics.diskUsed})\n`;

      this.log('info', 'Retrieved system info');
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error fetching system info', error);
      return this.error(
        'Failed to fetch system info',
        error.message
      );
    }
  }

  // ==================== Private Helper Methods ====================

  /**
   * Get system metrics with caching
   * @private
   */
  async _getSystemMetrics() {
    const cacheKey = 'system_metrics';

    // Check cache
    if (this.metricsCache.has(cacheKey)) {
      const cached = this.metricsCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        this.log('debug', 'Retrieved system metrics from cache');
        return cached.data;
      } else {
        this.metricsCache.delete(cacheKey);
      }
    }

    let metrics = {};

    if (this.systemInfoAvailable) {
      // Use systeminformation package
      const si = require('systeminformation');
      const [cpu, mem, disk, osInfo] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.osInfo()
      ]);

      metrics = {
        cpuPercent: cpu.currentLoad.toFixed(1),
        memoryPercent: ((mem.used / mem.total) * 100).toFixed(1),
        memoryUsed: this._formatBytes(mem.used),
        memoryTotal: this._formatBytes(mem.total),
        diskPercent: disk[0] ? ((disk[0].used / disk[0].size) * 100).toFixed(1) : 0,
        diskUsed: disk[0] ? this._formatBytes(disk[0].used) : 'N/A',
        diskTotal: disk[0] ? this._formatBytes(disk[0].size) : 'N/A',
        os: `${osInfo.distro} ${osInfo.release}`,
        arch: osInfo.arch
      };
    } else {
      // Fallback to Node.js process info and OS commands
      const totalMem = require('os').totalmem();
      const freeMem = require('os').freemem();
      const usedMem = totalMem - freeMem;

      metrics = {
        cpuPercent: 'N/A',
        memoryPercent: ((usedMem / totalMem) * 100).toFixed(1),
        memoryUsed: this._formatBytes(usedMem),
        memoryTotal: this._formatBytes(totalMem),
        diskPercent: 'N/A',
        diskUsed: 'N/A',
        diskTotal: 'N/A',
        os: require('os').platform(),
        arch: require('os').arch()
      };

      // Try to get CPU from top command
      try {
        const { stdout } = await execAsync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'");
        metrics.cpuPercent = parseFloat(stdout.trim()).toFixed(1);
      } catch (error) {
        // Ignore, already set to N/A
      }

      // Try to get disk usage from df command
      try {
        const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $5}'");
        metrics.diskPercent = stdout.trim().replace('%', '');
      } catch (error) {
        // Ignore, already set to N/A
      }
    }

    // Cache the result
    this.metricsCache.set(cacheKey, {
      data: metrics,
      timestamp: Date.now()
    });

    return metrics;
  }

  /**
   * Format health response with emoji indicators
   * @private
   */
  _formatHealthResponse(metrics) {
    let response = `*Server Health*\n\n`;
    response += `${this._getStatusIcon(metrics.cpuPercent)} *CPU:* ${metrics.cpuPercent}%\n`;
    response += `${this._getStatusIcon(metrics.memoryPercent)} *RAM:* ${metrics.memoryPercent}% (${metrics.memoryUsed} / ${metrics.memoryTotal})\n`;
    response += `${this._getStatusIcon(metrics.diskPercent)} *Disk:* ${metrics.diskPercent}% (${metrics.diskUsed} / ${metrics.diskTotal})\n\n`;

    // Add threshold warnings
    const warnings = [];
    if (parseFloat(metrics.cpuPercent) > this.THRESHOLDS.cpu.critical) {
      warnings.push(`🔴 CPU usage is critically high (${metrics.cpuPercent}%)`);
    } else if (parseFloat(metrics.cpuPercent) > this.THRESHOLDS.cpu.warning) {
      warnings.push(`🟡 CPU usage is elevated (${metrics.cpuPercent}%)`);
    }

    if (parseFloat(metrics.memoryPercent) > this.THRESHOLDS.memory.critical) {
      warnings.push(`🔴 Memory usage is critically high (${metrics.memoryPercent}%)`);
    } else if (parseFloat(metrics.memoryPercent) > this.THRESHOLDS.memory.warning) {
      warnings.push(`🟡 Memory usage is elevated (${metrics.memoryPercent}%)`);
    }

    if (parseFloat(metrics.diskPercent) > this.THRESHOLDS.disk.critical) {
      warnings.push(`🔴 Disk usage is critically high (${metrics.diskPercent}%)`);
    } else if (parseFloat(metrics.diskPercent) > this.THRESHOLDS.disk.warning) {
      warnings.push(`🟡 Disk usage is elevated (${metrics.diskPercent}%)`);
    }

    if (warnings.length > 0) {
      response += `*⚠️ Warnings:*\n`;
      warnings.forEach(warning => {
        response += `${warning}\n`;
      });
    } else {
      response += `🟢 *All systems operational*`;
    }

    return response;
  }

  /**
   * Get status icon based on percentage
   * @private
   */
  _getStatusIcon(percent) {
    if (percent === 'N/A') return '⚪';
    const value = parseFloat(percent);
    if (value >= 90) return '🔴';
    if (value >= 70) return '🟡';
    return '🟢';
  }

  /**
   * Get error icon based on error rate
   * @private
   */
  _getErrorIcon(rate) {
    const value = parseFloat(rate);
    if (value > 10) return '🔴';
    if (value > 5) return '🟡';
    return '🟢';
  }

  /**
   * Format bytes to human-readable string
   * @private
   */
  _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format uptime to human-readable string
   * @private
   */
  _formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      dataType: 'monitoring',
      systemInfoAvailable: this.systemInfoAvailable,
      cacheSize: this.metricsCache.size,
      cacheTTLSeconds: this.CACHE_TTL_MS / 1000
    };
  }

  /**
   * Shutdown the skill - clear cache
   */
  async shutdown() {
    this.metricsCache.clear();
    this.log('info', 'Monitoring cache cleared');
    await super.shutdown();
  }
}

module.exports = MonitoringSkill;
