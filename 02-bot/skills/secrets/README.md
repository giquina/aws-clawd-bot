# Secrets Management Skill

Secure storage for API keys, tokens, passwords, and other sensitive credentials using AES-256-GCM encryption.

## Features

- **Encrypted Storage**: All secrets are encrypted using AES-256-GCM before being stored in the database
- **Audit Logging**: Every access to secrets is logged with user, timestamp, and action
- **Access Counting**: Track how many times each secret has been accessed
- **Masked Display**: Secret values are masked in responses (show first 4 chars only)
- **Confirmation Flow**: Set, rotate, and delete operations require user confirmation
- **Rotation Support**: Update secrets with new values while preserving audit history

## Setup

### 1. Generate Encryption Key

Generate a secure 32-byte encryption key:

```bash
openssl rand -base64 32
```

### 2. Set Environment Variable

Add the key to your environment (`.env.local` or system environment):

```bash
ENCRYPTION_KEY=your_generated_key_here
```

**IMPORTANT**: Never commit this key to git. Keep it secure.

### 3. Test Configuration

Run the test script to verify everything is working:

```bash
cd 02-bot
ENCRYPTION_KEY="your_key" node test-secrets.js
```

## Commands

### Store a Secret

```
secret set <name> <value>
```

Example:
```
secret set STRIPE_API_KEY sk_test_abc123
```

**Requires confirmation** - bot will show masked value and ask for approval.

### Retrieve a Secret

```
secret get <name>
```

Example:
```
secret get STRIPE_API_KEY
```

Returns masked value for security. The full value is logged in audit history.

### List All Secrets

```
secret list
```

Shows all stored secrets with:
- Name
- Last rotated timestamp
- Access count
- Created by user

**Note**: Does not show secret values - use `secret get` for that.

### Rotate a Secret

```
secret rotate <name> <new-value>
```

Example:
```
secret rotate STRIPE_API_KEY sk_live_xyz789
```

**Requires confirmation** - replaces the old value with the new one, updates last rotated timestamp.

### Delete a Secret

```
secret delete <name>
```

Example:
```
secret delete OLD_API_KEY
```

**Requires confirmation** - permanently deletes the encrypted secret. Cannot be undone.

### View Audit History

```
secret audit <name>
```

Example:
```
secret audit STRIPE_API_KEY
```

Shows up to 20 recent events:
- Action (GET, SET, ROTATE, DELETE)
- Timestamp
- User ID
- Platform
- Success/failure status

## Security

### Encryption

- Algorithm: **AES-256-GCM** (authenticated encryption)
- Key size: 256 bits (32 bytes)
- IV: 16 bytes random per encryption
- Auth tag: 16 bytes for integrity verification

### Storage Format

Encrypted values are stored as base64-encoded concatenation of:
```
[IV (16 bytes)] + [Auth Tag (16 bytes)] + [Ciphertext (variable)]
```

### Best Practices

1. **Rotate keys regularly** - use `secret rotate` to update values
2. **Monitor audit logs** - check who accessed what and when
3. **Limit access** - only authorized users can use secrets commands
4. **Backup encryption key** - store it securely outside the server
5. **Don't share in logs** - secrets are automatically masked in responses

### What's Logged

Every action on secrets is logged to `secrets_audit` table:
- Secret access (`get`)
- Secret creation/update (`set`)
- Secret rotation (`rotate`)
- Secret deletion (`delete`)

Each entry includes:
- Secret ID and name
- Action type
- User ID who performed the action
- Platform (telegram, whatsapp, voice)
- Success/failure status
- Timestamp

## Database Schema

### `secrets` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Unique secret ID |
| `name` | TEXT UNIQUE | Secret name (e.g., "STRIPE_API_KEY") |
| `value_encrypted` | TEXT | Base64-encoded encrypted value |
| `encryption_key_id` | TEXT | Key ID used for encryption |
| `last_rotated` | DATETIME | When the secret was last updated |
| `accessed_count` | INTEGER | Number of times accessed |
| `created_by` | TEXT | User ID who created the secret |
| `created_at` | DATETIME | Creation timestamp |
| `updated_at` | DATETIME | Last update timestamp |

### `secrets_audit` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Unique audit event ID |
| `secret_id` | INTEGER | Foreign key to secrets table |
| `secret_name` | TEXT | Secret name (preserved if deleted) |
| `action` | TEXT | Action: get, set, rotate, delete |
| `user_id` | TEXT | User who performed the action |
| `platform` | TEXT | Platform used (telegram, etc.) |
| `success` | BOOLEAN | Whether the action succeeded |
| `created_at` | DATETIME | When the action occurred |

## Troubleshooting

### "Encryption not configured" Error

**Cause**: `ENCRYPTION_KEY` environment variable is not set or invalid.

**Solution**:
1. Generate a key: `openssl rand -base64 32`
2. Set the environment variable
3. Restart the bot

### "Decryption failed - wrong key" Error

**Cause**: The encryption key has changed since the secret was stored.

**Solution**:
- If you still have the old key, restore it temporarily to retrieve secrets
- If the old key is lost, secrets cannot be recovered - delete and recreate them

### Secrets Not Showing in List

**Cause**: Database table might not exist or skill is not enabled.

**Solution**:
1. Check that "secrets" is in the enabled array in `skills.json`
2. Restart the bot to run database migrations
3. Check logs for database initialization errors

## API Integration

The secrets skill can be used by other skills to securely store credentials:

```javascript
const encryption = require('../../lib/encryption');
const db = require('../../lib/database');

// Store a secret
const encrypted = encryption.encrypt(apiKey);
db.saveSecret('MY_API_KEY', encrypted, 'default', userId);

// Retrieve a secret
const secret = db.getSecret('MY_API_KEY');
if (secret) {
  const decrypted = encryption.decrypt(secret.value_encrypted);
  // Use decrypted value...

  // Increment access counter
  db.incrementSecretAccess('MY_API_KEY');

  // Log access
  db.logSecretAudit(secret.id, 'MY_API_KEY', 'get', userId, 'telegram', true);
}
```

## Limitations

- **Single encryption key**: All secrets use the same key (specified by `ENCRYPTION_KEY`)
- **No key rotation**: Changing the encryption key requires re-encrypting all secrets
- **No AWS integration**: AWS Secrets Manager integration is planned but not yet implemented
- **Local storage only**: Secrets are stored in SQLite database on the server

## Roadmap

- [ ] AWS Secrets Manager integration (for production deployments)
- [ ] Multi-key support (key rotation without re-encryption)
- [ ] Secret expiration (auto-delete after N days)
- [ ] Secret sharing (between authorized users)
- [ ] Bulk import/export (encrypted backup format)

## Related Skills

- **audit**: View detailed audit logs for all bot actions
- **backup**: Create encrypted backups of the database (includes secrets)
- **remote-exec**: Use secrets when executing remote commands

## Support

For issues or questions:
1. Check logs: `pm2 logs clawd-bot`
2. Test encryption: `node test-secrets.js`
3. Review audit history: `secret audit <name>`
