# Monitoring & Analytics Skill

Real-time server health monitoring and system metrics for ClawdBot.

## Overview

The Monitoring skill provides comprehensive system health monitoring, process metrics, and log access. It integrates with PM2 for process management and uses the `systeminformation` library for detailed system metrics. Alerts are triggered when resource usage exceeds configurable thresholds.

## Features

- **System Health Monitoring** - CPU, RAM, disk usage with color-coded indicators
- **PM2 Process Management** - View and control PM2 processes
- **Log Access** - Tail service logs from PM2 or file system
- **API Metrics** - Response times and error rates from activity log
- **Threshold Alerts** - Automatic warnings when resources exceed limits
- **Caching** - 30-second cache for system metrics to reduce overhead

## Commands

### Server Health
```
server health
```
Get current CPU, RAM, and disk usage with threshold warnings.

**Example Response:**
```
✓ Server Health

🟢 CPU: 48.7%
🟡 RAM: 77.5% (6.11 GB / 7.89 GB)
🟡 Disk: 71.6% (170.24 GB / 237.86 GB)

⚠️ Warnings:
🟡 Memory usage is elevated (77.5%)
```

### System Information
```
system info
```
Get detailed system information including OS, architecture, and Node.js version.

**Example Response:**
```
✓ System Information

🖥️ OS: Ubuntu 22.04.1 LTS
🏗️ Architecture: x64
⚡ Node.js: v18.17.0
🕐 Uptime: 2d 5h

Resources:
🟢 CPU: 25.3%
🟢 RAM: 45.2% (2.3 GB)
🟢 Disk: 68.5% (85.2 GB)
```

### API Metrics
```
api metrics
```
Get API call statistics including error rates and response times.

**Example Response:**
```
✓ API Metrics (Last 50 calls)

📊 Total Calls: 47
🟢 Error Rate: 4.3%
⏱️ Avg Response: 285ms

⚠️ Recent Errors:
1. Timeout in GitHub API call
2. Rate limit exceeded
```

### View Logs
```
logs <service>
```
Tail the last 20 lines of logs for a service (via PM2 or file system).

**Example:**
```
logs clawd-bot
logs nginx
```

### PM2 Process Status
```
pm2 status
```
List all PM2 processes with status, uptime, CPU, RAM, and restart count.

**Example Response:**
```
✓ PM2 Process Status

🟢 clawd-bot
  Status: online
  Uptime: 2d 5h
  CPU: 3.2% | RAM: 145.3 MB
  Restarts: 0

🟢 nginx
  Status: online
  Uptime: 5d 12h
  CPU: 0.5% | RAM: 23.1 MB
  Restarts: 1
```

### PM2 Process Restart
```
pm2 restart <process-name>
```
Restart a PM2 process by name.

**Example:**
```
pm2 restart clawd-bot
```

## Thresholds

Resource usage thresholds trigger color-coded warnings:

| Metric | Green (🟢) | Yellow (🟡) | Red (🔴) |
|--------|-----------|------------|---------|
| CPU    | < 70%     | 70-90%     | > 90%   |
| RAM    | < 70%     | 70-90%     | > 90%   |
| Disk   | < 80%     | 80-95%     | > 95%   |

## Configuration

In `skills/skills.json`:

```json
{
  "monitoring": {
    "cacheTTLSeconds": 30,
    "thresholds": {
      "cpu": { "warning": 70, "critical": 90 },
      "memory": { "warning": 70, "critical": 90 },
      "disk": { "warning": 80, "critical": 95 }
    }
  }
}
```

## Dependencies

### Required
- `systeminformation` ^5.23.10 - System metrics (CPU, RAM, disk, OS info)

### Optional
- PM2 - For process management and log access
- Activity log module - For API metrics

## Installation

The skill works with or without `systeminformation`:

**With systeminformation (recommended for production):**
```bash
npm install systeminformation
```

**Without systeminformation (fallback mode):**
- Uses Node.js `os` module for basic metrics
- Attempts to use shell commands (`top`, `df`) if available
- Limited functionality on Windows

## Voice Examples

The monitoring skill integrates with ClawdBot's voice system:

- "Check server health"
- "What's the CPU usage?"
- "Show me the logs"
- "Restart the bot"
- "How much memory are we using?"

## Integration with Other Skills

### Alert Escalation
Threshold breaches can trigger alerts via the alert escalation system:

```javascript
if (cpuPercent > THRESHOLDS.cpu.critical) {
  alertEscalation.sendAlert('CRITICAL', `CPU at ${cpuPercent}%`);
}
```

### Morning Brief
System health metrics can be included in the morning brief:

```javascript
const health = await monitoringSkill.execute('server health', context);
// Include health.message in morning brief
```

### Autonomous Tasks
The monitoring skill can be used by autonomous tasks for health checks:

```javascript
// In nightly autonomous tasks
const health = await skills.monitoring.execute('server health', context);
if (health.message.includes('🔴')) {
  // Take corrective action
}
```

## Error Handling

The skill gracefully handles missing dependencies:

- **No systeminformation** → Fallback to Node.js `os` module
- **No PM2** → Skip PM2 commands, use file-based logs
- **No activity log** → API metrics show 0 calls

All errors are logged and return user-friendly error messages with suggestions.

## Technical Details

### Architecture
- **Priority:** 20 (medium-high)
- **Caching:** 30-second TTL for system metrics
- **Async/await** throughout for non-blocking operations
- **Graceful degradation** when optional dependencies unavailable

### Files
- `02-bot/skills/monitoring/index.js` - Main skill implementation
- `scripts/test-monitoring-skill.js` - Test script

### Testing

Run the test suite:
```bash
node scripts/test-monitoring-skill.js
```

Tests verify:
1. Server health retrieval
2. System info display
3. PM2 integration (if available)
4. API metrics calculation
5. Command pattern matching
6. Metadata generation

## Deployment

### Local Development
```bash
cd 02-bot
npm install systeminformation
npm run dev
```

### AWS EC2 Production
```bash
# Install native dependencies on EC2
ssh -i ~/.ssh/clawd-bot-key.pem ubuntu@16.171.150.151
cd /opt/clawd-bot/02-bot
npm install systeminformation
npm rebuild systeminformation  # Rebuild for Linux

# Restart bot
pm2 restart clawd-bot
```

**Note:** `systeminformation` is a native module. Windows `.node` files won't work on Linux - always run `npm rebuild` after deploying to EC2.

## Future Enhancements

- **Grafana Integration** - Send metrics to Grafana for visualization
- **Prometheus Integration** - Export metrics in Prometheus format
- **Historical Metrics** - Store metrics in database for trend analysis
- **Predictive Alerts** - ML-based prediction of resource exhaustion
- **Container Metrics** - Docker container resource monitoring
- **Network Metrics** - Bandwidth usage, connection counts
- **Custom Metrics** - User-defined metrics from application code

## Security

- Read-only access to system metrics (no destructive operations)
- PM2 restart requires explicit command (no auto-restart)
- Log access limited to 20 lines (prevents memory exhaustion)
- Command whitelist prevents arbitrary command execution

## Support

For issues or questions about the Monitoring skill:
1. Check logs: `pm2 logs clawd-bot --lines 50`
2. Test locally: `node scripts/test-monitoring-skill.js`
3. Verify dependencies: `npm list systeminformation`
4. Check threshold config in `skills/skills.json`
