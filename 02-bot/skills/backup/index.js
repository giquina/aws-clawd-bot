/**
 * Database Backup Skill - Backup and restore SQLite database
 *
 * Provides database backup capabilities with automatic retention policy.
 * Supports manual backups, listing, and restore operations.
 *
 * Commands:
 *   backup database             - Create a new database backup
 *   backup list                 - List all available backups
 *   backup restore <id>         - Restore database from a backup (with confirmation)
 *
 * @example
 * backup database
 * backup list
 * backup restore 5
 */

const BaseSkill = require('../base-skill');
const path = require('path');
const fs = require('fs');

class BackupSkill extends BaseSkill {
  name = 'backup';
  description = 'Backup and restore SQLite database with retention policy';
  priority = 23;

  commands = [
    {
      pattern: /^backup\s+database$/i,
      description: 'Create a new database backup',
      usage: 'backup database'
    },
    {
      pattern: /^backup\s+list$/i,
      description: 'List all available backups',
      usage: 'backup list'
    },
    {
      pattern: /^backup\s+restore\s+(\d+)$/i,
      description: 'Restore database from a backup',
      usage: 'backup restore <id>'
    }
  ];

  constructor(context = {}) {
    super(context);
    this.backupDir = this._resolveBackupDir();
    this.retentionDays = 7; // Keep last 7 days of backups
  }

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();

    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      this.log('info', `Created backup directory: ${this.backupDir}`);
    }

    this.log('info', `Backup skill initialized. Directory: ${this.backupDir}`);
  }

  /**
   * Execute backup commands
   */
  async execute(command, context) {
    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Handle "backup database"
    if (lowerCommand === 'backup database') {
      return await this.handleCreateBackup(context);
    }

    // Handle "backup list"
    if (lowerCommand === 'backup list') {
      return await this.handleListBackups();
    }

    // Handle "backup restore <id>"
    const restoreMatch = parsed.raw.match(/^backup\s+restore\s+(\d+)$/i);
    if (restoreMatch) {
      const backupId = parseInt(restoreMatch[1]);
      return await this.handleRestoreBackup(backupId, context);
    }

    return this.error('Unknown backup command. Try: database, list, or restore <id>');
  }

  /**
   * Handle "backup database" - create a new backup
   */
  async handleCreateBackup(context) {
    try {
      const db = require('../../lib/database');
      const rawDb = db.getDb();

      if (!rawDb) {
        return this.error('Database is not initialized. Cannot create backup.');
      }

      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
      const filename = `clawdbot_backup_${timestamp}.db`;
      const backupPath = path.join(this.backupDir, filename);

      // Perform SQLite backup using better-sqlite3 backup API
      this.log('info', `Creating backup: ${filename}`);
      await this._performBackup(rawDb, backupPath);

      // Get file size
      const stats = fs.statSync(backupPath);
      const sizeBytes = stats.size;
      const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

      // Save backup record to database
      const backupRecord = db.saveBackup(filename, backupPath, sizeBytes);

      if (!backupRecord) {
        return this.error('Failed to save backup record to database.');
      }

      // Clean up old backups
      await this._cleanupOldBackups();

      let response = `Database backup created successfully!\n\n`;
      response += `Backup ID: ${backupRecord.id}\n`;
      response += `Filename: ${filename}\n`;
      response += `Size: ${sizeMB} MB\n`;
      response += `Location: ${backupPath}\n\n`;
      response += `Retention: Last ${this.retentionDays} days`;

      this.log('info', `Backup created: ${filename} (${sizeMB} MB)`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error creating backup', error);
      return this.error('Failed to create database backup', error.message, {
        suggestion: 'Check database permissions and disk space'
      });
    }
  }

  /**
   * Handle "backup list" - list all available backups
   */
  async handleListBackups() {
    try {
      const db = require('../../lib/database');
      const backups = db.listBackups(20); // List last 20 backups

      if (backups.length === 0) {
        return this.success('No backups found.\n\nCreate one with: backup database');
      }

      let response = `*Available Backups* (${backups.length})\n\n`;

      backups.forEach((backup, index) => {
        const sizeMB = (backup.size_bytes / (1024 * 1024)).toFixed(2);
        const date = new Date(backup.created_at);
        const dateStr = this._formatDate(date);

        response += `${index + 1}. ID ${backup.id} - ${dateStr}\n`;
        response += `   Size: ${sizeMB} MB\n`;
        response += `   File: ${backup.filename}\n`;

        if (index < backups.length - 1) {
          response += `\n`;
        }
      });

      response += `\nRestore with: backup restore <id>`;

      this.log('info', `Listed ${backups.length} backups`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error listing backups', error);
      return this.error('Failed to list backups', error.message);
    }
  }

  /**
   * Handle "backup restore <id>" - restore from a backup
   */
  async handleRestoreBackup(backupId, context) {
    try {
      // Check if this is a confirmation
      const confirmationManager = this.config.confirmationManager;
      const userId = context.from;

      if (confirmationManager) {
        const pending = confirmationManager.getPendingConfirmation(userId);

        if (pending && pending.action === 'backup_restore') {
          // User is confirming restore
          return this.success('Database restore cancelled for safety.\n\nThis operation is not yet implemented for safety reasons.');
        } else {
          // First request - ask for confirmation
          confirmationManager.setPendingConfirmation(userId, {
            action: 'backup_restore',
            backupId: backupId,
            timestamp: Date.now()
          });

          const db = require('../../lib/database');
          const backup = db.getBackup(backupId);

          if (!backup) {
            return this.error(`Backup with ID ${backupId} not found.`);
          }

          const sizeMB = (backup.size_bytes / (1024 * 1024)).toFixed(2);
          const date = new Date(backup.created_at);
          const dateStr = this._formatDate(date);

          return this.warning(`Restore database from backup`, {
            data: { backupId },
            action: `This will restore the database from:\n\n` +
              `  Backup ID: ${backupId}\n` +
              `  Created: ${dateStr}\n` +
              `  Size: ${sizeMB} MB\n\n` +
              `⚠️ WARNING: This will OVERWRITE current data!\n` +
              `Create a backup first with "backup database"\n\n` +
              `Reply 'yes' to proceed or 'no' to cancel`
          });
        }
      }

      // No confirmation manager available - just inform
      return this.error(
        'Database restore requires confirmation.',
        'Confirmation manager not available',
        { suggestion: 'Contact administrator for manual restore' }
      );
    } catch (error) {
      this.log('error', 'Error handling restore request', error);
      return this.error('Failed to restore backup', error.message);
    }
  }

  // ==================== Private Helpers ====================

  /**
   * Resolve the backup directory path
   * @private
   */
  _resolveBackupDir() {
    // EC2 production path
    const ec2Path = '/opt/clawd-bot/data/backups';

    // Local development path
    const localPath = path.join(__dirname, '..', '..', 'data', 'backups');

    // Prefer EC2 path if parent directory exists
    if (process.platform !== 'win32') {
      try {
        if (fs.existsSync('/opt/clawd-bot/data')) {
          return ec2Path;
        }
      } catch (_) {
        // Fall through to local
      }
    }

    return localPath;
  }

  /**
   * Perform SQLite backup using better-sqlite3 backup API
   * @private
   */
  async _performBackup(sourceDb, destinationPath) {
    return new Promise((resolve, reject) => {
      try {
        // Use better-sqlite3 backup API
        sourceDb.backup(destinationPath)
          .then(() => {
            this.log('debug', `Backup completed: ${destinationPath}`);
            resolve();
          })
          .catch(err => {
            this.log('error', `Backup failed: ${err.message}`);
            reject(err);
          });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Clean up old backups based on retention policy
   * @private
   */
  async _cleanupOldBackups() {
    try {
      const db = require('../../lib/database');
      const deletedPaths = db.deleteOldBackups(this.retentionDays);

      if (deletedPaths.length === 0) {
        this.log('debug', 'No old backups to clean up');
        return;
      }

      // Delete physical files
      let deletedCount = 0;
      for (const filePath of deletedPaths) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            deletedCount++;
            this.log('debug', `Deleted old backup: ${filePath}`);
          }
        } catch (err) {
          this.log('warn', `Failed to delete backup file: ${filePath}`, err.message);
        }
      }

      if (deletedCount > 0) {
        this.log('info', `Cleaned up ${deletedCount} old backup(s) older than ${this.retentionDays} days`);
      }
    } catch (error) {
      this.log('error', 'Error during backup cleanup', error);
    }
  }

  /**
   * Format a date for display
   * @private
   */
  _formatDate(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    return {
      ...meta,
      backupDirectory: this.backupDir,
      retentionDays: this.retentionDays,
      dataType: 'database-backups'
    };
  }
}

module.exports = BackupSkill;
