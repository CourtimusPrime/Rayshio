import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { requireConfig } from '../config.js';

const VERSION = 'v1';
const IV_BYTES = 12;

function key(): Buffer {
  const { TOKEN_ENCRYPTION_KEY } = requireConfig('TOKEN_ENCRYPTION_KEY');
  return Buffer.from(TOKEN_ENCRYPTION_KEY, 'base64');
}

/** AES-256-GCM. Output format: v1:<b64 iv>:<b64 authTag>:<b64 ciphertext> */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptToken(stored: string): string {
  const [version, ivB64, tagB64, dataB64] = stored.split(':');
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error(`unsupported token format: ${version ?? 'empty'}`);
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
