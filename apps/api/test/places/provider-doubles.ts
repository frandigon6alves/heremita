import { readFileSync } from 'node:fs';
import type { z } from 'zod';
import type { OutboundRequest, OutboundResponse } from '../../src/providers/core/outbound.js';

/** Body of a saved upstream answer (`test/fixtures/upstream/<dir>/<name>.body`), parsed. */
export function upstreamFixture(name: string, dir = 'responses'): unknown {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/upstream/${dir}/${name}.body`, import.meta.url), 'utf8'),
  );
}

/** Answers every GET with the queued responses (then the last one again) and records the requests. */
export class FakeOutbound {
  readonly requests: OutboundRequest[] = [];
  private readonly answers: OutboundResponse[];

  constructor(...answers: OutboundResponse[]) {
    this.answers = answers;
  }

  get(request: OutboundRequest): Promise<OutboundResponse> {
    this.requests.push(request);
    const answer = this.answers.length > 1 ? this.answers.shift() : this.answers[0];
    if (!answer) {
      return Promise.reject(new Error('FakeOutbound has no answer queued'));
    }
    return Promise.resolve(answer);
  }
}

/** In-memory `ProviderCacheService.remember`: stores what `load` returned, nothing when it throws. */
export class MemoryCache {
  readonly entries = new Map<string, { value: unknown; ttlMs: number }>();

  async remember<T>(
    key: string,
    schema: z.ZodType<T>,
    load: () => Promise<T>,
    ttlMs: (value: T) => number,
  ): Promise<T> {
    const entry = this.entries.get(key);
    if (entry) {
      return schema.parse(entry.value);
    }
    const value = await load();
    this.entries.set(key, { value, ttlMs: ttlMs(value) });
    return value;
  }
}

/** Collects warnings instead of logging them. */
export class WarningRecorder {
  readonly warnings: string[] = [];

  warn(message: string): void {
    this.warnings.push(message);
  }
}
