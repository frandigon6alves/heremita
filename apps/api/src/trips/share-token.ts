import { randomBytes } from 'node:crypto';

const SHARE_TOKEN_BYTES = 16;

/** A fresh share token: 16 random bytes, base64url (22 characters). */
export function newShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString('base64url');
}
