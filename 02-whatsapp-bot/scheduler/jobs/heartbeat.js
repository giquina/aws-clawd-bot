// Heartbeat Monitoring Job
// Runs every 4 hours to check system health
// Only sends alerts if action is needed

const { execSync } = require('child_process');
const os = require('os');

/**
 * Run heartbeat checks and return alerts if any issues found
 * @param {Object} db - Memory manager instance
 * @param {Object} params - Job parameters
 * @returns {Promise<string|null>} Alert message or null if all OK
 */
async function check(db, params = {}) {
    const alerts = [];

    try {
        // Check 1: Disk Space
        const diskAlert = checkDiskSpace();
        if (diskAlert) alerts.push(diskAlert);

        // Check 2: Memory Usage
        const memAlert = checkMemoryUsage();
        if (memAlert) alerts.push(memAlert);

        // Check 3: Process Health
        const processAlert = checkProcessHealth();
        if (processAlert) alerts.push(processAlert);

        // Check 4: Database Health
        const dbAlert = checkDatabaseHealth(db);
        if (dbAlert) alerts.push(dbAlert);

    } catch (error) {
        console.error('[Heartbeat] Error during checks:', error);
        alerts.push(`Heartbeat check error: ${error.message}`);
    }

    // Only return message if there are alerts
    if (alerts.length === 0) {
        console.log('[Heartbeat] All checks passed');
        return null;
    }

    // Format alert message
    let message = `SYSTEM ALERT\n`;
    message += `${'='.repeat(20)}\n\n`;
    alerts.forEach(alert => {
        message += `${alert}\n`;
    });
    message += `\nTime: ${new Date().toLocaleString('en-GB')}`;

    return message;
}

/**
 * Check disk space - alert if <10% free
 */
function checkDiskSpace() {
    try {
        if (process.platform === 'win32') {
            // Windows - skip for now, would need wmic
            return null;
        }

        // Linux/Mac
        const output = execSync('df -h / | tail -1', { encoding: 'utf8' });
        const parts = output.trim().split(/\s+/);
        const usePercent = parseInt(parts[4]?.replace('%', '') || '0');

        if (usePercent > 90) {
            return `Disk space critical: ${usePercent}% used (alert at 90%)`;
        }

        return null;
    } catch (error) {
        console.error('[Heartbeat] Disk check failed:', error.message);
        return null; // Don't alert on check failure
    }
}

/**
 * Check memory usage - alert if >85% used
 */
function checkMemoryUsage() {
    try {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

        if (usedPercent > 85) {
            const usedGB = ((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(1);
            const totalGB = (totalMem / 1024 / 1024 / 1024).toFixed(1);
            return `Memory high: ${usedPercent}% used (${usedGB}/${totalGB} GB)`;
        }

        return null;
    } catch (error) {
        console.error('[Heartbeat] Memory check failed:', error.message);
        return null;
    }
}

/**
 * Check Node.js process health
 */
function checkProcessHealth() {
    try {
        const heapUsed = process.memoryUsage().heapUsed / 1024 / 1024;
        const heapTotal = process.memoryUsage().heapTotal / 1024 / 1024;
        const heapPercent = Math.round((heapUsed / heapTotal) * 100);

        // Alert if heap usage >90%
        if (heapPercent > 90) {
            return `Node heap high: ${heapPercent}% (${Math.round(heapUsed)}/${Math.round(heapTotal)} MB)`;
        }

        // Alert if uptime < 5 minutes (recent restart)
        const uptime = process.uptime();
        if (uptime < 300) {
            const mins = Math.floor(uptime / 60);
            return `Recent restart: Bot running for only ${mins} minutes`;
        }

        return null;
    } catch (error) {
        console.error('[Heartbeat] Process check failed:', error.message);
        return null;
    }
}

/**
 * Check database health
 */
function checkDatabaseHealth(db) {
    if (!db) return null;

    try {
        // Try a simple query
        const stats = db.getStats(process.env.YOUR_WHATSAPP);
        if (!stats) {
            return `Database: Unable to query stats`;
        }
        return null;
    } catch (error) {
        return `Database error: ${error.message}`;
    }
}

/**
 * Get system status summary (non-alerting, for status commands)
 */
function getStatus() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    return {
        memory: `${usedPercent}%`,
        uptime: `${hours}h ${minutes}m`,
        platform: process.platform,
        nodeVersion: process.version,
        heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    };
}

module.exports = {
    check,
    getStatus,
    checkDiskSpace,
    checkMemoryUsage,
    checkProcessHealth,
    checkDatabaseHealth
};
