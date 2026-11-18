const { createRequire } = require('node:module');
const req = createRequire('/Users/frangoncalves/Desktop/DEV/heremita/apps/web/package.json');
const { chromium, devices } = req('@playwright/test');
const BASE = 'http://localhost:3100';
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  const csp = [];
  page.on('console', (m) => { if (m.type() === 'error') csp.push(m.text()); });
  await page.exposeFunction('reportCsp', (v) => csp.push('CSP ' + v));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => window.reportCsp(e.violatedDirective + ' ' + e.blockedURI)));
  const log = (...a) => console.log(...a);

  // Gate: signed-out -> login with next
  let res = await page.goto(BASE + '/pt-BR/settings');
  log('settings signed out ->', page.url(), res.status());

  await page.goto(BASE + '/pt-BR/signup');
  log('signup h1', await page.getByRole('heading', { level: 1 }).textContent());
  const email = `t22-${Date.now()}@example.com`;
  await page.getByRole('textbox', { name: 'Nome' }).fill('Ana Probe');
  await page.getByRole('textbox', { name: 'E-mail' }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('short');
  await page.getByRole('textbox', { name: 'Nome' }).click();
  log('pw alert', await page.getByRole('alert').first().textContent());
  await page.getByLabel('Senha', { exact: true }).fill('passphrase for probing');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.waitForURL(/\/pt-BR\/trips\/new/);
  log('after signup url', page.url());
  await page.getByRole('button', { name: /Conta: Ana Probe/ }).waitFor();
  log('account button visible', await page.getByRole('button', { name: /Conta: Ana Probe/ }).isVisible());
  log('data-theme', await page.locator('html').getAttribute('data-theme'));
  await page.reload();
  log('after reload account', await page.getByRole('button', { name: /Conta: Ana Probe/ }).isVisible());
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  log('scrollWidth', sw);
  await page.screenshot({ path: 'signedin-phone.png' });
  // open menu + logout
  await page.getByRole('button', { name: /Conta: Ana Probe/ }).click();
  await page.screenshot({ path: 'menu-phone.png' });
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL(BASE + '/pt-BR');
  log('after logout', page.url());
  // login page signed out, duplicate signup -> email taken
  await page.goto(BASE + '/pt-BR/signup?next=%2Fpt-BR%2Fsettings');
  await page.getByRole('textbox', { name: 'Nome' }).fill('Ana Probe');
  await page.getByRole('textbox', { name: 'E-mail' }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('passphrase for probing');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  log('dup alert', await page.getByRole('alert').first().textContent());
  await page.getByRole('link', { name: 'Entrar' }).first().click();
  await page.waitForURL(/login/);
  log('login url', page.url());
  await page.getByRole('textbox', { name: 'E-mail' }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('wrong password!');
  await page.getByRole('button', { name: 'Entrar' }).click();
  log('wrong pw alert', await page.getByRole('alert').first().textContent());
  await page.getByLabel('Senha', { exact: true }).fill('passphrase for probing');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/pt-BR\/settings/);
  log('login -> next', page.url());
  // signed in visiting login -> trips
  await page.goto(BASE + '/pt-BR/login');
  log('login while signed in ->', page.url());
  await page.goto(BASE + '/en/login');
  await page.screenshot({ path: 'login-en.png' });
  log('problems', JSON.stringify(csp));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
