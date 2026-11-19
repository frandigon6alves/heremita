import { hash, verify } from '@node-rs/argon2';
import { invalidFields } from '../http/problems.js';
import { COMMON_PASSWORDS } from './common-passwords.js';

/**
 * Argon2id at the OWASP minimum (m=19 MiB, t=2, p=1). `algorithm` is omitted:
 * Argon2id is the library default, and its `Algorithm` const enum cannot be
 * used under `isolatedModules`.
 */
export const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** PHC prefix every stored hash starts with. */
export const PASSWORD_HASH_PREFIX = '$argon2id$v=19$m=19456,t=2,p=1$';

/**
 * Hash of a random secret nobody knows, with the same parameters as real ones.
 * Logging in with an unknown e-mail verifies against it, so the response takes
 * as long as a wrong password for a real account.
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$lkL/U/YdoZqCw1i8+VXopQ$+8PmQRPBTON5FPVDagL5/pLGktts1Gv5O8nbLSlV4hU';

const COMMON = new Set(COMMON_PASSWORDS.map((password) => password.toLowerCase()));

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** False for a wrong password and for a stored hash that cannot be read. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Spends the time of a real verification and always fails. */
export async function verifyAgainstDummy(password: string): Promise<false> {
  await verifyPassword(DUMMY_PASSWORD_HASH, password);
  return false;
}

export function isCommonPassword(password: string): boolean {
  return COMMON.has(password.toLowerCase());
}

/** 422 `validation_failed` at `pointer` (`/body/password`, `/body/newPassword`) for a common password. */
export function assertUncommonPassword(password: string, pointer: string): void {
  if (isCommonPassword(password)) {
    throw invalidFields([{ pointer, detail: 'This password is too common. Choose another one.' }]);
  }
}
