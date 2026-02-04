# Database Backup Skill

Provides database backup capabilities with automatic retention policy for ClawdBot's SQLite database.

## Features

- **Manual backups** - Create backups on demand via Telegram command
- **Automatic backups** - Can be scheduled via cron for daily backups
- **Retention policy** - Automatically deletes backups older than 7 days
- **Backup listing** - View all available backups with size and date
- **Restore capability** - Restore database from a backup (with confirmation)
- **Integrity tracking** - All backups logged to database with metadata

## Commands

### Create a Backup
```
backup database
```
Creates a new SQLite backup with timestamp in filename. Automatically cleans up old backups.

**Output:**
```
✓ Database backup created successfully!

Backup ID: 5
Filename: clawdbot_backup_2026-02-04_17-53-36.db
Size: 0.14 MB
Location: /opt/clawd-bot/data/backups/...

Retention: Last 7 days
```

### List Backups
```
backup list
```
Lists all available backups with ID, date, size, and filename.

**Output:**
```
*Available Backups* (3)

1. ID 5 - 2026-02-04 17:53
   Size: 0.14 MB
   File: clawdbot_backup_2026-02-04_17-53-36.db

2. ID 4 - 2026-02-03 08:00
   Size: 0.12 MB
   File: clawdbot_backup_2026-02-03_08-00-00.db

3. ID 3 - 2026-02-02 08:00
   Size: 0.11 MB
   File: clawdbot_backup_2026-02-02_08-00-00.db

Restore with: backup restore <id>
```

### Restore from Backup
```
backup restore <id>
```
Restores database from a specific backup (requires confirmation).

**Output:**
```
⚠ Restore database from backup requires approval

This will restore the database from:

  Backup ID: 5
  Created: 2026-02-04 17:53
  Size: 0.14 MB

⚠️ WARNING: This will OVERWRITE current data!
Create a backup first with "backup database"

Reply 'yes' to proceed or 'no' to cancel
```

## Technical Details

### Storage Location

**EC2 Production:**
```
/opt/clawd-bot/data/backups/
```

**Local Development:**
```
02-bot/data/backups/
```

### Database Schema

Backups are tracked in the `backups` table:

```sql
CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  size_bytes INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Backup Process

1. Uses better-sqlite3's native `backup()` API for atomic backups
2. Generates timestamped filename: `clawdbot_backup_YYYY-MM-DD_HH-MM-SS.db`
3. Saves backup record to database with metadata
4. Automatically cleans up backups older than retention period (7 days)

### Retention Policy

- **Default:** 7 days
- **Configurable** via `skills.json` → `backup.retentionDays`
- Cleanup runs automatically after each backup creation
- Deletes both database records AND physical files

## Configuration

In `skills.json`:

```json
{
  "backup": {
    "retentionDays": 7,
    "maxBackups": 20
  }
}
```

## Scheduling Automated Backups

To schedule daily backups at 2 AM, add to cron configuration:

```javascript
// In scheduler or index.js
cron.schedule('0 2 * * *', async () => {
  const BackupSkill = require('./skills/backup');
  const skill = new BackupSkill(context);
  await skill.handleCreateBackup({ from: 'system' });
});
```

## Safety Features

- **Confirmation required** for restore operations
- **Automatic cleanup** prevents disk space issues
- **Integrity validation** - backups tracked in database
- **Read-only verification** available via SQLite PRAGMA checks

## File Size

Typical backup sizes:
- Fresh database: ~100 KB
- With 1 week of activity: ~200-500 KB
- With 1 month of activity: ~1-2 MB

## Error Handling

The skill handles:
- Database not initialized
- Insufficient disk space
- Permission errors
- Corrupt backup files
- Missing backup records

All errors return structured error messages with suggestions.

## Testing

Run the test suite:

```bash
cd 02-bot
node -e "
const BackupSkill = require('./skills/backup');
const skill = new BackupSkill({});
skill.initialize().then(() => {
  console.log('✓ Backup skill initialized');
  console.log('✓ Directory:', skill.backupDir);
  console.log('✓ Retention:', skill.retentionDays, 'days');
});
"
```

## Skill Metadata

- **Name:** backup
- **Priority:** 23 (higher priority than most data skills)
- **Dependencies:** better-sqlite3, lib/database.js
- **Data Type:** database-backups
