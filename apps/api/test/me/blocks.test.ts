import { endpoints, type EndpointDef, type Page, type UserCard } from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, WEB_ORIGIN, type TestApp } from '../support/app.js';
import { cardOf, problemOf, UNKNOWN_ID } from '../support/assertions.js';
import { createUser, type TestUser } from '../support/factories.js';
import { sendRaw, type RawRequest } from '../support/http.js';

let t: TestApp;

beforeAll(async () => {
  t = await buildTestApp();
});

afterAll(async () => {
  await t.close();
});

function sendAnonymous(def: EndpointDef, raw: RawRequest) {
  return sendRaw(t.http, def, raw).set('Origin', WEB_ORIGIN);
}

async function block(blocker: TestUser, blocked: TestUser) {
  t.clock.advance(1_000);
  return sendRaw(blocker.agent, endpoints.blockUser, { params: { userId: blocked.user.id } });
}

async function listBlocks(
  blocker: TestUser,
  query: Record<string, unknown> = {},
): Promise<{ status: number; body: Page<UserCard> }> {
  const response = await sendRaw(blocker.agent, endpoints.listBlocks, { query });
  return { status: response.status, body: response.body as Page<UserCard> };
}

describe('E13 blockUser', () => {
  it('blocks_and_lists_the_user', async () => {
    const [blocker, blocked] = [await createUser(t), await createUser(t)];

    const response = await block(blocker, blocked);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect((await listBlocks(blocker)).body).toEqual({
      items: [cardOf(blocked)],
      nextCursor: null,
    });
  });

  it('is_idempotent_and_keeps_the_first_block_time (V27)', async () => {
    const [blocker, blocked] = [await createUser(t), await createUser(t)];
    await block(blocker, blocked);
    const first = await t.prisma.userBlock.findMany({ where: { blockerId: blocker.user.id } });

    const again = await block(blocker, blocked);

    expect(again.status).toBe(204);
    expect(await t.prisma.userBlock.findMany({ where: { blockerId: blocker.user.id } })).toEqual(
      first,
    );
  });

  it('refuses_to_block_oneself', async () => {
    const user = await createUser(t);

    const response = await block(user, user);

    expect(response.status).toBe(422);
    expect(problemOf(response).code).toBe('cannot_block_self');
  });

  it.each([
    ['an_unknown_user', UNKNOWN_ID],
    ['a_malformed_id', 'not-a-uuid'],
  ])('answers_user_not_found_for_%s', async (_case, userId) => {
    const { agent } = await createUser(t);

    const response = await sendRaw(agent, endpoints.blockUser, { params: { userId } });

    expect(response.status).toBe(404);
    expect(problemOf(response).code).toBe('user_not_found');
  });

  it('needs_a_session', async () => {
    const { user } = await createUser(t);

    const response = await sendAnonymous(endpoints.blockUser, { params: { userId: user.id } });

    expect(response.status).toBe(401);
  });
});

describe('E14 unblockUser', () => {
  it('unblocks_and_is_idempotent (V27)', async () => {
    const [blocker, blocked] = [await createUser(t), await createUser(t)];
    await block(blocker, blocked);
    const params = { userId: blocked.user.id };

    const first = await sendRaw(blocker.agent, endpoints.unblockUser, { params });
    const second = await sendRaw(blocker.agent, endpoints.unblockUser, { params });

    expect([first.status, second.status]).toEqual([204, 204]);
    expect((await listBlocks(blocker)).body).toEqual({ items: [], nextCursor: null });
  });

  it('answers_204_for_an_unknown_user', async () => {
    const { agent } = await createUser(t);

    const response = await sendRaw(agent, endpoints.unblockUser, {
      params: { userId: UNKNOWN_ID },
    });

    expect(response.status).toBe(204);
  });

  it('removes_only_the_callers_block', async () => {
    const [a, b, blocked] = [await createUser(t), await createUser(t), await createUser(t)];
    await block(a, blocked);
    await block(b, blocked);

    await sendRaw(a.agent, endpoints.unblockUser, { params: { userId: blocked.user.id } });

    expect((await listBlocks(b)).body.items).toEqual([cardOf(blocked)]);
  });

  it('needs_a_session', async () => {
    const response = await sendAnonymous(endpoints.unblockUser, {
      params: { userId: UNKNOWN_ID },
    });

    expect(response.status).toBe(401);
  });
});

describe('E12 listBlocks (V26)', () => {
  async function blockerOf(count: number): Promise<{ blocker: TestUser; newestFirst: UserCard[] }> {
    const blocker = await createUser(t);
    const blocked: UserCard[] = [];
    for (let index = 0; index < count; index += 1) {
      const target = await createUser(t);
      await block(blocker, target);
      blocked.unshift(cardOf(target));
    }
    return { blocker, newestFirst: blocked };
  }

  it.each([0, 1, 2])('fits_%i_blocks_in_one_page_of_2', async (count) => {
    const { blocker, newestFirst } = await blockerOf(count);

    const response = await listBlocks(blocker, { limit: 2 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: newestFirst, nextCursor: null });
  });

  it('pages_3_blocks_newest_first', async () => {
    const { blocker, newestFirst } = await blockerOf(3);

    const first = await listBlocks(blocker, { limit: 2 });
    const second = await listBlocks(blocker, { limit: 2, cursor: first.body.nextCursor });

    expect(first.body.items).toEqual(newestFirst.slice(0, 2));
    expect(first.body.nextCursor).toEqual(expect.any(String));
    expect(second.body).toEqual({ items: newestFirst.slice(2), nextCursor: null });
  });

  it('breaks_ties_on_the_same_instant_by_id', async () => {
    const blocker = await createUser(t);
    const targets = [await createUser(t), await createUser(t), await createUser(t)];
    for (const target of targets) {
      await sendRaw(blocker.agent, endpoints.blockUser, { params: { userId: target.user.id } });
    }
    const expected = targets.map(cardOf).sort((a, b) => b.id.localeCompare(a.id));

    const first = await listBlocks(blocker, { limit: 2 });
    const second = await listBlocks(blocker, { limit: 2, cursor: first.body.nextCursor });

    expect([...first.body.items, ...second.body.items]).toEqual(expected);
  });

  it('rejects_a_tampered_cursor', async () => {
    const { blocker } = await blockerOf(0);

    const response = await listBlocks(blocker, {
      cursor: Buffer.from('["x"]').toString('base64url'),
    });

    expect(response.status).toBe(422);
    expect(problemOf(response).code).toBe('invalid_cursor');
  });

  it('rejects_a_limit_over_50', async () => {
    const { blocker } = await blockerOf(0);

    const response = await listBlocks(blocker, { limit: 51 });

    expect(response.status).toBe(422);
    expect(problemOf(response).errors?.map((error) => error.pointer)).toEqual(['/query/limit']);
  });

  it('needs_a_session', async () => {
    const response = await sendAnonymous(endpoints.listBlocks, {});

    expect(response.status).toBe(401);
  });
});
