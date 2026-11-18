import { describe, expect, it } from 'vitest';
import { ApiProblem } from '../http/api-problem.js';
import {
  assertUncommonPassword,
  DUMMY_PASSWORD_HASH,
  hashPassword,
  isCommonPassword,
  PASSWORD_HASH_PREFIX,
  verifyAgainstDummy,
  verifyPassword,
} from './passwords.js';

const PASSWORD = 'correct horse battery staple';

describe('password hashing', () => {
  it('hashes_with_argon2id_at_m19456_t2_p1', async () => {
    const passwordHash = await hashPassword(PASSWORD);

    expect(passwordHash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(passwordHash.startsWith(PASSWORD_HASH_PREFIX)).toBe(true);
  });

  it('salts_every_hash', async () => {
    const [first, second] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);

    expect(first).not.toBe(second);
  });

  it('verifies_the_right_password_only', async () => {
    const passwordHash = await hashPassword(PASSWORD);

    await expect(verifyPassword(passwordHash, PASSWORD)).resolves.toBe(true);
    await expect(verifyPassword(passwordHash, `${PASSWORD}!`)).resolves.toBe(false);
  });

  it('rejects_instead_of_throwing_on_an_unreadable_hash', async () => {
    await expect(verifyPassword('not-a-phc-string', PASSWORD)).resolves.toBe(false);
  });

  it('keeps_the_dummy_hash_on_the_same_parameters_as_real_ones', async () => {
    expect(DUMMY_PASSWORD_HASH.startsWith(PASSWORD_HASH_PREFIX)).toBe(true);
    await expect(verifyAgainstDummy(PASSWORD)).resolves.toBe(false);
  });
});

describe('common password blocklist', () => {
  it('holds_the_vendored_10k_list', () => {
    expect(isCommonPassword('password')).toBe(true);
    expect(isCommonPassword('123456')).toBe(true);
  });

  it('matches_regardless_of_case', () => {
    expect(isCommonPassword('UNBELIEVABLE')).toBe(true);
  });

  it('lets_an_uncommon_password_through', () => {
    expect(isCommonPassword(PASSWORD)).toBe(false);
    expect(() => assertUncommonPassword(PASSWORD, '/body/password')).not.toThrow();
  });

  it('answers_422_at_the_given_pointer_for_a_common_password', () => {
    let problem: unknown;
    try {
      assertUncommonPassword('scandinavian', '/body/newPassword');
    } catch (error) {
      problem = error;
    }

    expect(problem).toBeInstanceOf(ApiProblem);
    expect(problem).toMatchObject({
      code: 'validation_failed',
      extensions: { errors: [{ pointer: '/body/newPassword' }] },
    });
  });
});
