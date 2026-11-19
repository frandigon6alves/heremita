import { createHash } from 'node:crypto';
import { AxeBuilder } from '@axe-core/playwright';
import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { newApiContext, signUp, type Account } from './api';
import { isLocalUrl } from './environment';

/** A CSP violation as the page reported it. */
interface CspViolation {
  page: string;
  directive: string;
  blocked: string;
}

interface TestFixtures {
  /** Auto: aborts every request that would leave localhost (V72). */
  hermeticNetwork: void;
  /** Auto: fails the test on any `securitypolicyviolation` (V54). */
  cspViolations: CspViolation[];
  /**
   * Another browser context (a second person) with the same guards: local
   * network only, CSP violations fail the test. Signed out unless given a session.
   */
  openContext: (storageState?: Account['storageState']) => Promise<BrowserContext>;
}

interface WorkerFixtures {
  /** One account per worker, signed up through the API. */
  workerAccount: Account;
}

interface AccountFixtures {
  /** Signs up another account for this test through the API (each from its own address). */
  makeAccount: (displayName: string) => Promise<Account>;
  /** The test's own account, signed in in the default context. */
  account: Account;
}

/**
 * An address the API's trusted proxy hop passes on as the client IP. Sign-up
 * allows 5 per hour per IP, so every test (and every worker account) signs up
 * from its own address.
 */
export function clientAddressFor(seed: string): string {
  const [a = 0, b = 0, c = 0] = createHash('sha256').update(seed).digest();
  return `10.${a}.${b}.${c}`;
}

/** Tells worker processes apart even when two share an index across runs. */
const processTag = `${process.pid}${Date.now().toString(36)}`;

function testAddress(testInfo: TestInfo, contextIndex = 0): string {
  return clientAddressFor(
    `${processTag}:${testInfo.project.name}:${testInfo.testId}:${testInfo.repeatEachIndex}:${contextIndex}`,
  );
}

/** Aborts every request that would leave localhost (V72). */
async function keepLocal(context: BrowserContext): Promise<void> {
  await context.route('**/*', (route) =>
    isLocalUrl(route.request().url()) ? route.fallback() : route.abort('blockedbyclient'),
  );
}

/** Collects every `securitypolicyviolation` the context's pages report (V54). */
async function reportCspViolations(
  context: BrowserContext,
  violations: CspViolation[],
): Promise<void> {
  await context.exposeBinding('__heremitaReportCsp', ({ page }, violation: CspViolation) => {
    violations.push({ ...violation, page: page.url() });
  });
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as Record<string, (v: unknown) => void>)
        .__heremitaReportCsp;
      report?.({ directive: event.effectiveDirective, blocked: event.blockedURI });
    });
  });
}

let accountCounter = 0;

/** A unique e-mail per worker process and call. */
export function uniqueEmail(label: string, workerIndex: number): string {
  accountCounter += 1;
  return `${label}-${workerIndex}-${processTag}-${accountCounter}@e2e.example.com`;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, testInfo) => {
    await use({ ...extraHTTPHeaders, 'X-Forwarded-For': testAddress(testInfo) });
  },

  hermeticNetwork: [
    async ({ context }, use) => {
      await keepLocal(context);
      await use();
    },
    { auto: true },
  ],

  cspViolations: [
    async ({ context }, use) => {
      const violations: CspViolation[] = [];
      await reportCspViolations(context, violations);
      await use(violations);
      expect(violations, 'Content-Security-Policy violations').toEqual([]);
    },
    { auto: true },
  ],

  openContext: async ({ browser, baseURL, cspViolations }, use, testInfo) => {
    const opened: BrowserContext[] = [];
    await use(async (storageState) => {
      const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
      const context = await browser.newContext({
        viewport,
        userAgent,
        deviceScaleFactor,
        isMobile,
        hasTouch,
        baseURL,
        locale: 'pt-BR',
        storageState,
        extraHTTPHeaders: { 'X-Forwarded-For': testAddress(testInfo, opened.length + 1) },
      });
      opened.push(context);
      await keepLocal(context);
      await reportCspViolations(context, cspViolations);
      return context;
    });
    await Promise.all(opened.map((context) => context.close()));
  },

  workerAccount: [
    async ({ playwright }, use, workerInfo) => {
      const email = uniqueEmail('worker', workerInfo.workerIndex);
      const context = await newApiContext(playwright.request, clientAddressFor(`worker:${email}`));
      const account = await signUp(context, {
        displayName: `Worker ${workerInfo.workerIndex}`,
        email,
        password: 'worker passphrase e2e',
      });
      await use(account);
      await context.dispose();
    },
    { scope: 'worker' },
  ],
});

/** Tests that start signed in as the worker's account. */
export const signedInTest = test.extend({
  storageState: async ({ workerAccount }, use) => {
    await use(workerAccount.storageState);
  },
});

/**
 * Tests that start signed in as an account of their own: for journeys whose
 * writes (reports, reviews, deletion) must not leak into the next test.
 */
export const accountTest = test.extend<AccountFixtures>({
  makeAccount: async ({ playwright }, use, testInfo) => {
    const contexts: APIRequestContext[] = [];
    await use(async (displayName) => {
      const email = uniqueEmail('account', testInfo.workerIndex);
      const context = await newApiContext(playwright.request, clientAddressFor(`account:${email}`));
      contexts.push(context);
      return signUp(context, { displayName, email, password: 'account passphrase e2e' });
    });
    await Promise.all(contexts.map((context) => context.dispose()));
  },
  account: async ({ makeAccount }, use) => {
    await use(await makeAccount('Rita Andarilha'));
  },
  storageState: async ({ account }, use) => {
    await use(account.storageState);
  },
});

export type { Account };

export { expect };

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/**
 * Asserts zero serious or critical axe violations on the current page, in the
 * light and the dark colour scheme (V60). Explicit user themes win over the
 * emulated scheme, so a signed-in page is checked in its own theme twice.
 */
export async function expectAccessible(page: Page): Promise<void> {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    // Colour transitions run after a scheme switch; axe must read the settled colours.
    // Endless ones (spinners, skeleton shimmer) never finish and change no colour pair.
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
          // A cancelled animation rejects `finished`; it is settled all the same.
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
    );
    const { violations } = await new AxeBuilder({ page }).analyze();
    const blocking = violations
      .filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ''))
      .map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map((node) => node.target.join(' ')),
      }));
    expect(blocking, `axe serious/critical violations (${colorScheme})`).toEqual([]);
  }
}
