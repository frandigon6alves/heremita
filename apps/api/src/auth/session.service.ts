import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../core/clock/clock.js';
import type { SessionUser } from '../core/http/api-request.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { fromDbLocale } from './me.mapper.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A session unused this long is dead. */
export const SESSION_IDLE_MS = 30 * DAY_MS;
/** Every session dies this long after it was created, however active. */
export const SESSION_ABSOLUTE_MS = 90 * DAY_MS;
/** `last_used_at` is written at most this often, so most requests cost no write. */
export const SESSION_TOUCH_INTERVAL_MS = HOUR_MS;

const TOKEN_BYTES = 32;

/** What the cookie needs: the token is only ever held in memory and in the browser. */
export interface IssuedSession {
  token: string;
  absoluteExpiresAt: Date;
}

function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** The database stores only this digest, so a leaked table cannot be replayed as cookies. */
export function hashToken(token: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash('sha256').update(token).digest());
}

function earliest(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

/** Opaque server-side sessions (§I.api.mechanics "Sessions"). */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Row values of a brand-new session, for `create` here or nested in a user create. */
  newSessionData(): { token: string; data: NewSessionData } {
    const now = this.clock.now();
    const token = newToken();
    return {
      token,
      data: {
        tokenHash: hashToken(token),
        createdAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + SESSION_IDLE_MS),
        absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
      },
    };
  }

  async create(userId: string): Promise<IssuedSession> {
    const { token, data } = this.newSessionData();
    await this.prisma.session.create({ data: { ...data, userId } });
    return { token, absoluteExpiresAt: data.absoluteExpiresAt };
  }

  /**
   * The caller behind a live token, or null. Slides the idle expiry (never
   * past the absolute one) when the session was last touched over an hour ago.
   */
  async authenticate(token: string): Promise<SessionUser | null> {
    const now = this.clock.now();
    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash: hashToken(token),
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
      },
      select: {
        id: true,
        lastUsedAt: true,
        absoluteExpiresAt: true,
        user: { select: { id: true, role: true, locale: true } },
      },
    });
    if (!session) {
      return null;
    }
    if (session.lastUsedAt.getTime() < now.getTime() - SESSION_TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          lastUsedAt: now,
          expiresAt: earliest(new Date(now.getTime() + SESSION_IDLE_MS), session.absoluteExpiresAt),
        },
      });
    }
    return {
      id: session.user.id,
      role: session.user.role,
      locale: fromDbLocale(session.user.locale),
      sessionId: session.id,
    };
  }

  /** Gives a session a new token (password change): the old cookie stops working at once. */
  async rotate(sessionId: string): Promise<IssuedSession> {
    const token = newToken();
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: { tokenHash: hashToken(token), lastUsedAt: this.clock.now() },
      select: { absoluteExpiresAt: true },
    });
    return { token, absoluteExpiresAt: session.absoluteExpiresAt };
  }

  /** Idempotent: a session deleted meanwhile is not an error. */
  async delete(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  async deleteAllOf(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async deleteOthersOf(userId: string, keepSessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId, id: { not: keepSessionId } } });
  }
}

export interface NewSessionData {
  tokenHash: Uint8Array<ArrayBuffer>;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
}
