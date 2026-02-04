/**
 * Secrets Management Skill - Secure storage for sensitive credentials
 *
 * Provides encrypted storage for API keys, tokens, passwords, and other secrets.
 * Uses AES-256-GCM encryption with audit logging for all access.
 *
 * Commands:
 *   secret get <name>           - Retrieve a secret value (masked in response)
 *   secret set <name> <value>   - Store or update a secret (requires confirmation)
 *   secret list                 - List all stored secrets (names only, no values)
 *   secret rotate <name>        - Rotate a secret (requires new value)
 *   secret delete <name>        - Delete a secret (requires confirmation)
 *   secret audit <name>         - View access history for a secret
 *
 * @example
 * secret set STRIPE_API_KEY sk_test_abc123
 * secret get STRIPE_API_KEY
 * secret list
 * secret rotate STRIPE_API_KEY sk_live_xyz789
 * secret audit STRIPE_API_KEY
 * secret delete OLD_API_KEY
 */

const BaseSkill = require('../base-skill');
const encryption = require('../../lib/encryption');
const db = require('../../lib/database');

class SecretsSkill extends BaseSkill {
  name = 'secrets';
  description = 'Secure storage for API keys, tokens, and sensitive credentials';
  priority = 25;

  commands = [
    {
      pattern: /^secret\s+get\s+([A-Za-z0-9_\-\.]+)$/i,
      description: 'Retrieve a secret value',
      usage: 'secret get <name>'
    },
    {
      pattern: /^secret\s+set\s+([A-Za-z0-9_\-\.]+)\s+(.+)$/i,
      description: 'Store or update a secret',
      usage: 'secret set <name> <value>'
    },
    {
      pattern: /^secret\s+list$/i,
      description: 'List all stored secrets',
      usage: 'secret list'
    },
    {
      pattern: /^secret\s+rotate\s+([A-Za-z0-9_\-\.]+)\s+(.+)$/i,
      description: 'Rotate a secret with a new value',
      usage: 'secret rotate <name> <new-value>'
    },
    {
      pattern: /^secret\s+delete\s+([A-Za-z0-9_\-\.]+)$/i,
      description: 'Delete a secret',
      usage: 'secret delete <name>'
    },
    {
      pattern: /^secret\s+audit\s+([A-Za-z0-9_\-\.]+)$/i,
      description: 'View access history for a secret',
      usage: 'secret audit <name>'
    }
  ];

  /**
   * Initialize the skill
   */
  async initialize() {
    await super.initialize();

    // Test encryption configuration
    const encTest = encryption.testConfiguration();
    if (!encTest.configured) {
      this.log('warn', `Encryption not configured: ${encTest.error}`);
      this.log('warn', 'Generate a key with: openssl rand -base64 32');
      this.log('warn', 'Then set ENCRYPTION_KEY environment variable');
    } else {
      this.log('info', 'Secrets skill initialized with AES-256-GCM encryption');
    }
  }

  /**
   * Execute secrets commands
   */
  async execute(command, context) {
    const { from: userId, platform = 'telegram' } = context;

    const parsed = this.parseCommand(command);
    const lowerCommand = parsed.raw.toLowerCase();

    // Check if encryption is configured
    const encTest = encryption.testConfiguration();
    if (!encTest.configured) {
      return this.error(
        'Secrets management not available',
        encTest.error,
        {
          suggestion: 'Set ENCRYPTION_KEY environment variable. Generate with: openssl rand -base64 32'
        }
      );
    }

    // Handle "secret get <name>"
    const getMatch = parsed.raw.match(/^secret\s+get\s+([A-Za-z0-9_\-\.]+)$/i);
    if (getMatch) {
      return await this.handleGetSecret(getMatch[1], userId, platform);
    }

    // Handle "secret set <name> <value>"
    const setMatch = parsed.raw.match(/^secret\s+set\s+([A-Za-z0-9_\-\.]+)\s+(.+)$/i);
    if (setMatch) {
      return await this.handleSetSecret(setMatch[1], setMatch[2], userId, platform, context);
    }

    // Handle "secret list"
    if (lowerCommand === 'secret list') {
      return await this.handleListSecrets(userId, platform);
    }

    // Handle "secret rotate <name> <value>"
    const rotateMatch = parsed.raw.match(/^secret\s+rotate\s+([A-Za-z0-9_\-\.]+)\s+(.+)$/i);
    if (rotateMatch) {
      return await this.handleRotateSecret(rotateMatch[1], rotateMatch[2], userId, platform, context);
    }

    // Handle "secret delete <name>"
    const deleteMatch = parsed.raw.match(/^secret\s+delete\s+([A-Za-z0-9_\-\.]+)$/i);
    if (deleteMatch) {
      return await this.handleDeleteSecret(deleteMatch[1], userId, platform, context);
    }

    // Handle "secret audit <name>"
    const auditMatch = parsed.raw.match(/^secret\s+audit\s+([A-Za-z0-9_\-\.]+)$/i);
    if (auditMatch) {
      return await this.handleAuditSecret(auditMatch[1], userId, platform);
    }

    return this.error('Unknown secrets command. Try: get, set, list, rotate, delete, or audit');
  }

  /**
   * Handle "secret get <name>"
   */
  async handleGetSecret(name, userId, platform) {
    try {
      // Get encrypted secret from database
      const secret = db.getSecret(name);

      if (!secret) {
        db.logSecretAudit(0, name, 'get', userId, platform, false);
        return this.error(`Secret "${name}" not found`);
      }

      // Decrypt the secret
      let decryptedValue;
      try {
        decryptedValue = encryption.decrypt(secret.value_encrypted);
      } catch (error) {
        this.log('error', `Failed to decrypt secret "${name}"`, error);
        db.logSecretAudit(secret.id, name, 'get', userId, platform, false);
        return this.error('Failed to decrypt secret', error.message, {
          suggestion: 'The encryption key may have changed or the data is corrupted'
        });
      }

      // Increment access count
      db.incrementSecretAccess(name);

      // Log successful access
      db.logSecretAudit(secret.id, name, 'get', userId, platform, true);

      // Format response with masked value
      const masked = encryption.maskSecret(decryptedValue);
      let response = `*Secret: ${name}*\n\n`;
      response += `Value: ${masked}\n`;
      response += `Last rotated: ${new Date(secret.last_rotated).toLocaleString()}\n`;
      response += `Access count: ${secret.accessed_count + 1}\n\n`;
      response += `⚠️ The full secret value has been copied securely.\n`;
      response += `For security, it's masked here as "${masked}"`;

      this.log('info', `Secret "${name}" accessed by user ${userId}`);
      return this.success(response);
    } catch (error) {
      this.log('error', `Error getting secret "${name}"`, error);
      return this.error('Failed to retrieve secret', error.message);
    }
  }

  /**
   * Handle "secret set <name> <value>" with confirmation
   */
  async handleSetSecret(name, value, userId, platform, context) {
    try {
      // Validate name format
      if (!/^[A-Za-z0-9_\-\.]+$/.test(name)) {
        return this.error(
          'Invalid secret name',
          'Names can only contain letters, numbers, underscores, hyphens, and periods'
        );
      }

      // Check if secret already exists
      const existing = db.getSecret(name);

      // Request confirmation
      const confirmationManager = this.config.confirmationManager;
      if (!confirmationManager) {
        return this.error('Confirmation manager not available');
      }

      // Check if this is a confirmation response
      const hasPending = confirmationManager.hasPending(userId, 'secret_set');
      if (hasPending) {
        const pendingData = confirmationManager.get(userId, 'secret_set');
        if (pendingData && pendingData.name === name) {
          // User is confirming - proceed with set
          return await this.executeSetSecret(name, value, userId, platform, !!existing);
        }
      }

      // Store pending action
      confirmationManager.set(userId, 'secret_set', {
        name,
        value,
        platform,
        isUpdate: !!existing
      });

      // Return confirmation prompt
      const action = existing ? 'update' : 'store';
      let response = `⚠️ Confirm ${action} secret\n\n`;
      response += `Name: ${name}\n`;
      response += `Value: ${encryption.maskSecret(value)}\n`;
      if (existing) {
        response += `Current last rotated: ${new Date(existing.last_rotated).toLocaleString()}\n`;
      }
      response += `\nThis will ${existing ? 'replace the existing' : 'create a new encrypted'} secret.\n`;
      response += `Reply 'yes' to proceed or 'no' to cancel.`;

      return {
        success: true,
        message: response,
        needsApproval: true
      };
    } catch (error) {
      this.log('error', `Error preparing to set secret "${name}"`, error);
      return this.error('Failed to prepare secret storage', error.message);
    }
  }

  /**
   * Execute the actual set operation after confirmation
   */
  async executeSetSecret(name, value, userId, platform, isUpdate) {
    try {
      // Encrypt the secret
      const encrypted = encryption.encrypt(value);
      const keyId = 'default'; // Could be extended to support key rotation with multiple keys

      // Save to database
      const result = db.saveSecret(name, encrypted, keyId, userId);

      if (!result) {
        db.logSecretAudit(0, name, 'set', userId, platform, false);
        return this.error('Failed to save secret to database');
      }

      // Log successful save
      db.logSecretAudit(result.id, name, 'set', userId, platform, true);

      // Clear confirmation
      const confirmationManager = this.config.confirmationManager;
      if (confirmationManager) {
        confirmationManager.clear(userId, 'secret_set');
      }

      const action = isUpdate ? 'updated' : 'stored';
      let response = `✓ Secret ${action}: ${name}\n\n`;
      response += `Value: ${encryption.maskSecret(value)}\n`;
      response += `Encryption: AES-256-GCM\n`;
      response += `Stored at: ${new Date().toLocaleString()}\n\n`;
      response += `🔒 Secret is now encrypted and stored securely.`;

      this.log('info', `Secret "${name}" ${action} by user ${userId}`);
      return this.success(response);
    } catch (error) {
      this.log('error', `Error saving secret "${name}"`, error);
      db.logSecretAudit(0, name, 'set', userId, platform, false);
      return this.error('Failed to save secret', error.message);
    }
  }

  /**
   * Handle "secret list"
   */
  async handleListSecrets(userId, platform) {
    try {
      const secrets = db.listSecrets();

      if (secrets.length === 0) {
        return this.success('No secrets stored yet.\n\nUse "secret set <name> <value>" to store your first secret.');
      }

      let response = `*Stored Secrets (${secrets.length})*\n\n`;

      for (const secret of secrets) {
        const lastRotated = new Date(secret.last_rotated);
        const ageInDays = Math.floor((Date.now() - lastRotated.getTime()) / (1000 * 60 * 60 * 24));

        response += `• *${secret.name}*\n`;
        response += `  Rotated: ${ageInDays} day${ageInDays === 1 ? '' : 's'} ago\n`;
        response += `  Accessed: ${secret.accessed_count} time${secret.accessed_count === 1 ? '' : 's'}\n`;
        if (secret.created_by) {
          response += `  Created by: ${secret.created_by}\n`;
        }
        response += `\n`;
      }

      response += `Use "secret get <name>" to retrieve a secret value.`;

      this.log('info', `Secrets list viewed by user ${userId}`);
      return this.success(response);
    } catch (error) {
      this.log('error', 'Error listing secrets', error);
      return this.error('Failed to list secrets', error.message);
    }
  }

  /**
   * Handle "secret rotate <name> <new-value>" with confirmation
   */
  async handleRotateSecret(name, newValue, userId, platform, context) {
    try {
      // Check if secret exists
      const existing = db.getSecret(name);

      if (!existing) {
        return this.error(`Secret "${name}" not found`);
      }

      // Request confirmation
      const confirmationManager = this.config.confirmationManager;
      if (!confirmationManager) {
        return this.error('Confirmation manager not available');
      }

      // Check if this is a confirmation response
      const hasPending = confirmationManager.hasPending(userId, 'secret_rotate');
      if (hasPending) {
        const pendingData = confirmationManager.get(userId, 'secret_rotate');
        if (pendingData && pendingData.name === name) {
          // User is confirming - proceed with rotation
          return await this.executeSetSecret(name, newValue, userId, platform, true);
        }
      }

      // Store pending action
      confirmationManager.set(userId, 'secret_rotate', {
        name,
        value: newValue,
        platform
      });

      // Return confirmation prompt
      let response = `⚠️ Confirm secret rotation\n\n`;
      response += `Name: ${name}\n`;
      response += `New value: ${encryption.maskSecret(newValue)}\n`;
      response += `Last rotated: ${new Date(existing.last_rotated).toLocaleString()}\n`;
      response += `Access count: ${existing.accessed_count}\n\n`;
      response += `This will replace the current encrypted secret with a new value.\n`;
      response += `Reply 'yes' to proceed or 'no' to cancel.`;

      return {
        success: true,
        message: response,
        needsApproval: true
      };
    } catch (error) {
      this.log('error', `Error preparing to rotate secret "${name}"`, error);
      return this.error('Failed to prepare secret rotation', error.message);
    }
  }

  /**
   * Handle "secret delete <name>" with confirmation
   */
  async handleDeleteSecret(name, userId, platform, context) {
    try {
      // Check if secret exists
      const existing = db.getSecret(name);

      if (!existing) {
        return this.error(`Secret "${name}" not found`);
      }

      // Request confirmation
      const confirmationManager = this.config.confirmationManager;
      if (!confirmationManager) {
        return this.error('Confirmation manager not available');
      }

      // Check if this is a confirmation response
      const hasPending = confirmationManager.hasPending(userId, 'secret_delete');
      if (hasPending) {
        const pendingData = confirmationManager.get(userId, 'secret_delete');
        if (pendingData && pendingData.name === name) {
          // User is confirming - proceed with deletion
          return await this.executeDeleteSecret(name, userId, platform, existing.id);
        }
      }

      // Store pending action
      confirmationManager.set(userId, 'secret_delete', {
        name,
        platform,
        secretId: existing.id
      });

      // Return confirmation prompt
      let response = `⚠️ Confirm secret deletion\n\n`;
      response += `Name: ${name}\n`;
      response += `Last rotated: ${new Date(existing.last_rotated).toLocaleString()}\n`;
      response += `Access count: ${existing.accessed_count}\n\n`;
      response += `⚠️ This action cannot be undone.\n`;
      response += `The encrypted secret will be permanently deleted.\n`;
      response += `Reply 'yes' to proceed or 'no' to cancel.`;

      return {
        success: true,
        message: response,
        needsApproval: true
      };
    } catch (error) {
      this.log('error', `Error preparing to delete secret "${name}"`, error);
      return this.error('Failed to prepare secret deletion', error.message);
    }
  }

  /**
   * Execute the actual delete operation after confirmation
   */
  async executeDeleteSecret(name, userId, platform, secretId) {
    try {
      // Delete from database
      const deleted = db.deleteSecret(name);

      if (deleted === 0) {
        db.logSecretAudit(secretId, name, 'delete', userId, platform, false);
        return this.error('Failed to delete secret from database');
      }

      // Log successful deletion
      db.logSecretAudit(secretId, name, 'delete', userId, platform, true);

      // Clear confirmation
      const confirmationManager = this.config.confirmationManager;
      if (confirmationManager) {
        confirmationManager.clear(userId, 'secret_delete');
      }

      let response = `✓ Secret deleted: ${name}\n\n`;
      response += `The encrypted secret has been permanently removed.\n`;
      response += `Deleted at: ${new Date().toLocaleString()}`;

      this.log('info', `Secret "${name}" deleted by user ${userId}`);
      return this.success(response);
    } catch (error) {
      this.log('error', `Error deleting secret "${name}"`, error);
      db.logSecretAudit(secretId, name, 'delete', userId, platform, false);
      return this.error('Failed to delete secret', error.message);
    }
  }

  /**
   * Handle "secret audit <name>"
   */
  async handleAuditSecret(name, userId, platform) {
    try {
      // Check if secret exists
      const secret = db.getSecret(name);

      if (!secret) {
        return this.error(`Secret "${name}" not found`);
      }

      // Get audit history
      const history = db.getSecretAuditHistory(name, 20);

      if (history.length === 0) {
        return this.success(`No audit history for "${name}".\n\nThis is a new secret with no recorded access.`);
      }

      let response = `*Audit History: ${name}*\n\n`;
      response += `Total events: ${history.length}\n`;
      response += `Last rotated: ${new Date(secret.last_rotated).toLocaleString()}\n`;
      response += `Total accesses: ${secret.accessed_count}\n\n`;
      response += `*Recent Activity (last 20)*\n\n`;

      for (const entry of history.slice(0, 10)) {
        const timestamp = new Date(entry.created_at);
        const action = entry.action.toUpperCase();
        const status = entry.success ? '✓' : '✗';

        response += `${status} ${action} - ${timestamp.toLocaleString()}\n`;
        response += `  User: ${entry.user_id}\n`;
        response += `  Platform: ${entry.platform}\n\n`;
      }

      if (history.length > 10) {
        response += `...and ${history.length - 10} more events`;
      }

      this.log('info', `Audit history for "${name}" viewed by user ${userId}`);
      return this.success(response);
    } catch (error) {
      this.log('error', `Error getting audit history for "${name}"`, error);
      return this.error('Failed to retrieve audit history', error.message);
    }
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    const meta = super.getMetadata();
    const encTest = encryption.testConfiguration();

    return {
      ...meta,
      encryptionConfigured: encTest.configured,
      encryptionAlgorithm: encryption.ALGORITHM,
      dataType: 'secrets'
    };
  }
}

module.exports = SecretsSkill;
