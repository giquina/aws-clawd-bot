/**
 * Encryption Module - AES-256-GCM encryption for sensitive data
 *
 * Uses Node.js crypto module to encrypt/decrypt secrets with AES-256-GCM.
 * Requires ENCRYPTION_KEY environment variable (32-byte base64-encoded key).
 *
 * Generate a key with: openssl rand -base64 32
 *
 * Format: [iv:authTag:encrypted]
 * - iv: 16 bytes (initialization vector)
 * - authTag: 16 bytes (authentication tag for GCM)
 * - encrypted: variable length ciphertext
 *
 * @module encryption
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

/**
 * Get the encryption key from environment
 * @returns {Buffer} Encryption key
 * @throws {Error} If ENCRYPTION_KEY is not set or invalid
 */
function getEncryptionKey() {
  const keyString = process.env.ENCRYPTION_KEY;

  if (!keyString) {
    throw new Error('ENCRYPTION_KEY environment variable is not set. Generate one with: openssl rand -base64 32');
  }

  try {
    const key = Buffer.from(keyString, 'base64');

    if (key.length !== KEY_LENGTH) {
      throw new Error(`ENCRYPTION_KEY must be exactly ${KEY_LENGTH} bytes (${KEY_LENGTH * 8} bits) when decoded from base64`);
    }

    return key;
  } catch (error) {
    if (error.message.includes('must be exactly')) {
      throw error;
    }
    throw new Error('ENCRYPTION_KEY is not valid base64. Generate one with: openssl rand -base64 32');
  }
}

/**
 * Encrypt a string value
 * @param {string} plaintext - The value to encrypt
 * @returns {string} Base64-encoded encrypted data with format: iv:authTag:ciphertext
 * @throws {Error} If encryption fails or ENCRYPTION_KEY is not configured
 */
function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string');
  }

  const key = getEncryptionKey();

  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Combine iv:authTag:encrypted as base64
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'base64')
  ]).toString('base64');

  return combined;
}

/**
 * Decrypt an encrypted string value
 * @param {string} encryptedData - Base64-encoded encrypted data with format: iv:authTag:ciphertext
 * @returns {string} Decrypted plaintext
 * @throws {Error} If decryption fails, data is corrupted, or ENCRYPTION_KEY is wrong
 */
function decrypt(encryptedData) {
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Encrypted data must be a non-empty string');
  }

  const key = getEncryptionKey();

  try {
    // Decode from base64
    const combined = Buffer.from(encryptedData, 'base64');

    // Extract components
    const iv = combined.slice(0, IV_LENGTH);
    const authTag = combined.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.slice(IV_LENGTH + AUTH_TAG_LENGTH);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    if (error.message.includes('Unsupported state or unable to authenticate data')) {
      throw new Error('Decryption failed - wrong key or corrupted data');
    }
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Mask a secret value for display (show first 4 chars only)
 * @param {string} value - The secret value to mask
 * @returns {string} Masked value like "abcd****"
 */
function maskSecret(value) {
  if (!value || typeof value !== 'string') {
    return '****';
  }

  if (value.length <= 4) {
    return '****';
  }

  return value.substring(0, 4) + '*'.repeat(Math.min(value.length - 4, 20));
}

/**
 * Generate a random encryption key (for setup/testing)
 * @returns {string} Base64-encoded 32-byte key
 */
function generateKey() {
  return crypto.randomBytes(KEY_LENGTH).toString('base64');
}

/**
 * Test if encryption is properly configured
 * @returns {{configured: boolean, error?: string}}
 */
function testConfiguration() {
  try {
    const key = getEncryptionKey();

    // Test encryption/decryption
    const testData = 'test-secret-value';
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);

    if (decrypted !== testData) {
      return { configured: false, error: 'Encryption test failed - decrypted value does not match' };
    }

    return { configured: true };
  } catch (error) {
    return { configured: false, error: error.message };
  }
}

module.exports = {
  encrypt,
  decrypt,
  maskSecret,
  generateKey,
  testConfiguration,
  ALGORITHM,
  KEY_LENGTH
};
