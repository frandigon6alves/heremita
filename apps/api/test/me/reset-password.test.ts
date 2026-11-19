import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD_HASH_PREFIX } from '../../src/core/password/passwords.js';
import { resetPassword, ResetPasswordError } from '../../src/me/cli/reset-password.js';
import { getMe, logIn } from '../auth/auth-app.js';
import { buildTestApp, type TestApp } from '../support/app.js';
import { createUser, FACTORY_PASSWORD } from '../support/factories.js';

const API_DIR = path.join(import.meta.dirname, '../..');
const TSX = path.join(API_DIR, 'node_modules/.bin/tsx');
const CLI = path.join(API_DIR, 'src/me/cli/main.ts');

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

afterAll(async () => {
  await t.close();
});

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(...args: string[]): Promise<CliResult> {
  try {
    const { stdout, stderr } = await promisify(execFile)(TSX, [CLI, ...args], {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: t.env.DATABASE_URL },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string };
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr };
  }
}

describe('resetPassword (T32)', () => {
  it('sets_a_new_password_and_signs_out_every_session', async () => {
    const { user, email, cookie } = await createUser(t);
    await logIn(t, email, FACTORY_PASSWORD);
    t.clock.advance(60_000);

    const password = await resetPassword(t.prisma, t.clock, email);

    expect(password).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await getMe(t, cookie)).status).toBe(401);
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash.startsWith(PASSWORD_HASH_PREFIX)).toBe(true);
    expect(row.passwordChangedAt).toEqual(t.clock.now());
    expect((await logIn(t, email, password)).status).toBe(201);
    expect((await logIn(t, email, FACTORY_PASSWORD)).status).toBe(401);
  });

  it('gives_a_different_password_each_time', async () => {
    const { email } = await createUser(t);

    const first = await resetPassword(t.prisma, t.clock, email);
    const second = await resetPassword(t.prisma, t.clock, email);

    expect(first).not.toBe(second);
  });

  it('normalises_the_email_like_login_does', async () => {
    const { email } = await createUser(t);

    const password = await resetPassword(t.prisma, t.clock, `  ${email.toUpperCase()} `);

    expect((await logIn(t, email, password)).status).toBe(201);
  });

  it.each([
    ['an_unknown_email', 'nobody@example.com'],
    ['a_malformed_email', 'not an e-mail'],
  ])('refuses_%s_and_changes_nothing', async (_case, email) => {
    const { user, cookie } = await createUser(t);
    const before = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    await expect(resetPassword(t.prisma, t.clock, email)).rejects.toThrow(ResetPasswordError);

    expect(await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(before);
    expect((await getMe(t, cookie)).status).toBe(200);
  });
});

describe('cli reset-password', () => {
  it('prints_the_temporary_password_once', async () => {
    const { email } = await createUser(t);

    const result = await runCli('reset-password', email);

    expect(result.code).toBe(0);
    const [, password = ''] = /Temporary password: (\S+)/.exec(result.stdout) ?? [];
    expect(result.stdout.split(password)).toHaveLength(2);
    expect((await logIn(t, email, password)).status).toBe(201);
  });

  it('exits_1_for_an_unknown_email', async () => {
    const result = await runCli('reset-password', 'nobody@example.com');

    expect(result).toEqual({
      code: 1,
      stdout: '',
      stderr: 'No user has the e-mail nobody@example.com.\n',
    });
  });

  it('exits_2_with_usage_for_a_wrong_command', async () => {
    const result = await runCli('reset-pass');

    expect(result.code).toBe(2);
    expect(result.stderr).toBe('Usage: cli reset-password <email>\n');
  });
});
