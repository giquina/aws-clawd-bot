// Scheduler Module Index
// Re-exports scheduler components for convenient importing

const { Scheduler, createScheduler, getScheduler } = require('./scheduler');
const morningBrief = require('./jobs/morning-brief');
const proactiveAlerts = require('./jobs/proactive-alerts');
const nightlyAutonomous = require('./jobs/nightly-autonomous');
const endOfDay = require('./jobs/end-of-day');
const heartbeat = require('./jobs/heartbeat');

module.exports = {
    // Main scheduler class and factories
    Scheduler,
    createScheduler,
    getScheduler,

    // Job handlers
    jobs: {
        morningBrief,
        proactiveAlerts,
        nightlyAutonomous,
        endOfDay,
        heartbeat
    },

    // Common cron expressions for convenience
    CRON: {
        // Daily schedules
        EVERY_MORNING_8AM: '0 8 * * *',
        EVERY_EVENING_6PM: '0 18 * * *',
        EVERY_NIGHT_10PM: '0 22 * * *',
        EVERY_NIGHT_2AM: '0 2 * * *',

        // Weekday schedules
        WEEKDAY_MORNING_8AM: '0 8 * * 1-5',
        WEEKDAY_EVENING_6PM: '0 18 * * 1-5',

        // Weekend schedules
        WEEKEND_MORNING_9AM: '0 9 * * 0,6',

        // Hourly schedules
        EVERY_HOUR: '0 * * * *',
        EVERY_2_HOURS: '0 */2 * * *',
        EVERY_4_HOURS: '0 */4 * * *',

        // Minute schedules (for testing)
        EVERY_MINUTE: '* * * * *',
        EVERY_5_MINUTES: '*/5 * * * *',
        EVERY_15_MINUTES: '*/15 * * * *',
        EVERY_30_MINUTES: '*/30 * * * *',

        // Weekly schedules
        MONDAY_9AM: '0 9 * * 1',
        FRIDAY_5PM: '0 17 * * 5',
        SUNDAY_8PM: '0 20 * * 0'
    }
};
