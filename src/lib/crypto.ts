import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY fehlt oder hat nicht die erwarteten 64 Hex-Zeichen. ' +
      'Bitte als Umgebungsvariable setzen (openssl rand -hex 32).'
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Verschlüsselt einen Klartext-String mit AES-256-GCM.
 * Rückgabe: `iv:tag:ciphertext` (alle Base64-kodiert).
 */
export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Entschlüsselt einen mit encryptSecret() verschlüsselten String.
 */
export function decryptSecret(enc: string): string {
  const key = getKey();
  const parts = enc.split(':');
  if (parts.length !== 3) {
    throw new Error('Ungültiges Verschlüsselungsformat (erwartet iv:tag:ciphertext)');
  }
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
