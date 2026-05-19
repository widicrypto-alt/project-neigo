/**
 * BYOK key encryption/decryption using Node.js built-in `crypto` (AES-256-GCM).
 *
 * Storage format (colon-delimited hex):
 *   `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 *
 * Requires BYOK_ENCRYPTION_KEY env var: 64-char hex (32 bytes).
 * Generate: openssl rand -hex 32
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from './env.js';

const ALGO = 'aes-256-gcm';

function getMasterKey(): Buffer {
  if (!env.BYOK_ENCRYPTION_KEY) {
    throw new Error('BYOK_ENCRYPTION_KEY is not configured. Generate with: openssl rand -hex 32');
  }
  return Buffer.from(env.BYOK_ENCRYPTION_KEY, 'hex');
}

/** Encrypt a plaintext string. Returns `iv:authTag:ciphertext` hex string. */
export function encryptByokKey(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

/** Decrypt a stored `iv:authTag:ciphertext` hex string. Returns plaintext. */
export function decryptByokKey(stored: string): string {
  const key = getMasterKey();
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid BYOK ciphertext format');
  const [ivHex, authTagHex, ciphertextHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Returns true if encryption is available (key is configured). */
export function byokEncryptionAvailable(): boolean {
  return Boolean(env.BYOK_ENCRYPTION_KEY);
}
