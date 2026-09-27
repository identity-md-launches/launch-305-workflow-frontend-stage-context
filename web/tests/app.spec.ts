import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { fixture, units, account, challenger, manifest, game, token } from './fixture';

const connect = async (page: any) => { await page.getByRole('button', { name: 'Connect wallet' }).click(); await expect(page.getByText('10,000', { exact: false }).first()).toBeVisible(); };
const minimum = async (page: any) => { await page.getByRole('button', { name: 'Use minimum' }).click(); };

test('static subpath, live reads while disconnected, missing wallet, keyboard focus', async ({ page }) => {
  await fixture(page, { wallet: false });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByText('The throne awaits.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve CRWN', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Claim the throne' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Withdraw CRWN' })).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to game' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.getByRole('alert')).toContainText('No browser wallet found');
  expect(errors).toEqual([]);
});

test('explicit exact approval, separate claim, confirmation and self-claim guard', async ({ page }) => {
  const { writes } = await fixture(page);
  await page.goto('./'); await connect(page); await minimum(page);
  await expect(page.getByRole('button', { name: 'Claim the throne' })).toBeDisabled();
  await page.getByRole('button', { name: 'Approve CRWN', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('Approval confirmed');
  await expect(page.getByRole('button', { name: 'Claim the throne' })).toBeEnabled();
  expect(writes[0].functionName).toBe('approve'); expect(writes[0].to.toLowerCase()).toBe(token.address);
  expect(writes[0].args).toEqual([expect.stringMatching(new RegExp(game.address, 'i')), units('1000')]);
  expect(writes[0].value).toBeUndefined();
  await page.getByRole('button', { name: 'Claim the throne' }).click();
  await expect(page.getByRole('status').first()).toContainText('Claim confirmed');
  await expect(page.getByText('You are the current king. Another wallet must claim next.')).toBeVisible();
  expect(writes.map(write => write.functionName)).toEqual(['approve', 'claim']);
  expect(writes[1].args).toEqual([units('1000')]); expect(writes[1].to.toLowerCase()).toBe(game.address);
  await expect(page.getByRole('button', { name: 'Claim the throne' })).toBeDisabled();
  await expect(page.getByRole('row').filter({ hasText: '#1' })).toBeVisible();
});

test('primary flow is operable using only Tab, typing, Enter and Space', async ({ page }) => {
  await fixture(page);
  await page.goto('./');
  async function tabTo(target: any) {
    for (let i = 0; i < 35; i++) {
      await page.keyboard.press('Tab');
      if (await target.evaluate((element: Element) => element === document.activeElement)) return;
    }
    throw new Error('Control was not reachable by Tab');
  }
  await tabTo(page.getByRole('button', { name: 'Connect wallet' }));
  await page.keyboard.press('Enter');
  await expect(page.getByText('10,000', { exact: false }).first()).toBeVisible();
  await tabTo(page.getByLabel('Your claim amount'));
  await page.keyboard.type('1000');
  await tabTo(page.getByRole('button', { name: 'Approve CRWN', exact: true }));
  await page.screenshot({ path: '../docs/evidence/keyboard-approve-focus.png', fullPage: true });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').first()).toContainText('Approval confirmed');
  await tabTo(page.getByRole('button', { name: 'Claim the throne' }));
  await page.keyboard.press('Space');
  await expect(page.getByRole('status').first()).toContainText('Claim confirmed');
});

test('settles at the exact chain deadline then withdraws only the caller credit', async ({ page }) => {
  const { writes, state } = await fixture(page, { occupied: true, expired: true });
  state.king = account;
  await page.goto('./'); await connect(page);
  await expect(page.getByRole('button', { name: 'Settle round' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Claim the throne' })).toBeDisabled();
  await page.getByRole('button', { name: 'Settle round' }).click();
  await expect(page.getByRole('heading', { name: 'Round 2' })).toBeVisible();
  await expect(page.getByRole('status').first()).toContainText('Settlement confirmed');
  await page.getByRole('button', { name: 'Withdraw CRWN' }).click();
  await expect(page.getByRole('status').first()).toContainText('Withdrawal confirmed');
  await expect(page.getByRole('button', { name: 'Withdraw CRWN' })).toBeDisabled();
  expect(writes.map(write => write.functionName)).toEqual(['settle', 'withdraw']);
  expect(state.balance).toBe(units('11075'));
});

test('settle unavailable during a round or without a king; expired claim refused', async ({ page }) => {
  const { state, writes } = await fixture(page, { occupied: true });
  await page.goto('./'); await connect(page); await minimum(page);
  await expect(page.getByRole('button', { name: 'Settle round' })).toBeDisabled();
  state.deadline = state.timestamp;
  await page.getByRole('button', { name: 'Refresh state' }).click();
  await expect(page.getByText('This round has ended. Settle it to start the next round.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve CRWN', exact: true })).toBeDisabled();
  expect(writes).toHaveLength(0);
});

test('unknown chain offers exact add-chain parameters and switches again', async ({ page }) => {
  await fixture(page, { wrongChain: true });
  await page.goto('./'); await connect(page); await minimum(page);
  await expect(page.getByRole('button', { name: 'Approve CRWN', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Switch to Sepolia' }).click();
  await expect(page.getByRole('button', { name: 'Approve CRWN', exact: true })).toBeEnabled();
  const requests = await page.evaluate(() => (window as any).mockWallet.requests);
  expect(requests.filter((r: any) => r.method === 'wallet_switchEthereumChain')).toHaveLength(2);
  expect(requests.find((r: any) => r.method === 'wallet_addEthereumChain').params).toEqual([manifest.walletAddChain]);
});

test('rejection is recoverable; transaction refusal leaves approval intact', async ({ page }) => {
  const { writes } = await fixture(page);
  await page.goto('./');
  await page.evaluate(() => { (window as any).mockWallet.reject = true; });
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.getByRole('alert')).toContainText('Request declined');
  await page.evaluate(() => { (window as any).mockWallet.reject = false; });
  await connect(page); await minimum(page);
  await page.evaluate(() => { (window as any).mockWallet.reject = true; });
  await page.getByRole('button', { name: 'Approve CRWN', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Request declined');
  expect(writes).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Approve CRWN', exact: true })).toBeEnabled();
});

test('decoded simulation revert prevents wallet broadcast', async ({ page }) => {
  const { state, writes } = await fixture(page);
  state.simulationError = 'AlreadyKing';
  state.allowance = units('1000');
  await page.goto('./'); await connect(page); await minimum(page);
  await page.getByRole('button', { name: 'Claim the throne' }).click();
  await expect(page.getByRole('alert')).toContainText('You are already king');
  expect(writes).toHaveLength(0);
});

test('failed receipt is reported without claiming success', async ({ page }) => {
  const { state } = await fixture(page);
  state.revertReceipt = true;
  await page.goto('./'); await connect(page); await minimum(page);
  await page.getByRole('button', { name: 'Approve CRWN', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Transaction reverted on-chain');
  await expect(page.getByRole('link', { name: 'View transaction' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Claim the throne' })).toBeDisabled();
});

test('integer-safe minimum and decimal validation; insufficient balance', async ({ page }) => {
  const { state, writes } = await fixture(page, { occupied: true });
  state.kingPayment = units('1000') + 1n;
  await page.goto('./'); await connect(page); await minimum(page);
  await expect(page.getByLabel('Your claim amount')).toHaveValue('1100.000000000000000002');
  await page.getByText('Show exact CRWN amounts', { exact: true }).click();
  await expect(page.locator('.exact-values')).toContainText('1100.000000000000000002 CRWN');
  await page.getByLabel('Your claim amount').fill('1100.000000000000000001');
  await expect(page.getByText('Enter at least 1100.000000000000000002 CRWN.')).toBeVisible();
  await page.getByLabel('Your claim amount').fill('1100.0000000000000000001');
  await expect(page.getByLabel('Your claim amount')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Approve CRWN', exact: true })).toBeDisabled();
  await page.getByLabel('Your claim amount').fill('10001');
  await expect(page.getByText('Your CRWN balance is too low. Get CRWN before claiming.')).toBeVisible();
  expect(writes).toHaveLength(0);
});

test('account and chain changes clear unsafe action eligibility', async ({ page }) => {
  const { state } = await fixture(page);
  state.allowance = units('1000');
  await page.goto('./'); await connect(page); await minimum(page);
  await expect(page.getByRole('button', { name: 'Claim the throne' })).toBeEnabled();
  state.balance = 0n;
  await page.evaluate(challenger => { const w = (window as any).mockWallet; w.account = challenger; w.emit('accountsChanged', [challenger]); }, challenger);
  await expect(page.getByText('Your CRWN balance is too low. Get CRWN before claiming.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Claim the throne' })).toBeDisabled();
  await page.evaluate(() => { const w = (window as any).mockWallet; w.chain = '0x1'; w.emit('chainChanged', '0x1'); });
  await expect(page.getByRole('button', { name: 'Switch to Sepolia' })).toBeVisible();
  await page.evaluate(() => { const w = (window as any).mockWallet; w.account = ''; w.emit('accountsChanged', []); });
  await expect(page.getByRole('button', { name: 'Connect wallet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Withdraw CRWN' })).toBeDisabled();
});

test('RPC failure and stale blocks disable all writes with a recovery control', async ({ page }) => {
  const { state, writes } = await fixture(page);
  await page.goto('./'); await connect(page); await minimum(page);
  state.failRpc = true;
  await page.getByRole('button', { name: 'Refresh state' }).click();
  await expect(page.getByText('Live connection unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve CRWN', exact: true })).toBeDisabled();
  state.failRpc = false; state.timestamp -= 600n;
  await page.getByRole('button', { name: 'Retry connection' }).click();
  await expect(page.getByText('Chain data is stale.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Withdraw CRWN' })).toBeDisabled();
  expect(writes).toHaveLength(0);
});

for (const failure of ['noCode', 'wrongToken', 'tamperedAbi'] as const) test(`deployment verification fails closed: ${failure}`, async ({ page }) => {
  await fixture(page, { [failure]: true });
  if (failure === 'tamperedAbi') await page.route('**/abi/KingOfTheHill.json', route => route.fulfill({ json: [] }));
  await page.goto('./');
  await expect(page.getByText('Live connection unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve CRWN', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Settle round' })).toBeDisabled();
});

test('claim history uses events, pages older blocks, handles log errors', async ({ page }) => {
  const { state, calls } = await fixture(page, { history: true });
  await page.goto('./');
  await expect(page.getByRole('row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Load older blocks' }).click();
  await expect(page.getByRole('row')).toHaveCount(3);
  expect(calls.filter(c => c.method === 'eth_getLogs').every(c => c.params[0].address.toLowerCase() === game.address)).toBe(true);
  state.failHistory = true;
  await page.getByRole('button', { name: 'Refresh state' }).click();
  await expect(page.getByText('Claim history unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(3);
});

test('desktop, tablet and mobile reflow; rendered contrast scan; local resources', async ({ page }) => {
  await fixture(page, { history: true, occupied: true });
  const errors: string[] = [], failed: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failed.push(request.url()));
  await page.goto('./'); await connect(page); await minimum(page);
  const evidence: any[] = [];
  const contrast = await page.evaluate(() => {
    function rgb(text: string) { return text.match(/[\d.]+/g)!.slice(0, 3).map(Number); }
    function luminance(color: number[]) { return color.map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0); }
    return ['.intro-note p', '.claim-footnote', '.king-caption', '.button.primary', '.throne-card .eyebrow', '.rules-copy', '.history-range'].map(selector => {
      const element = document.querySelector(selector)!;
      const foreground = getComputedStyle(element).color;
      let parent: Element | null = element, background = '';
      while (parent) { background = getComputedStyle(parent).backgroundColor; if (background !== 'rgba(0, 0, 0, 0)') break; parent = parent.parentElement; }
      const a = luminance(rgb(foreground)), b = luminance(rgb(background));
      return { selector, foreground, background, ratio: Number(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toFixed(2)) };
    });
  });
  for (const width of [1440, 840, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole('heading', { name: 'Claim the throne' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    evidence.push({ width, violations: results.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), passes: results.passes.map(p => p.id) });
    await page.screenshot({ path: `../docs/evidence/mocked-${width}.png`, fullPage: true });
    expect(results.violations).toEqual([]);
    if (width === 320) {
      const region = page.getByRole('region', { name: 'Claim history table; scroll horizontally for all columns' });
      await region.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.getByRole('button', { name: 'Approve CRWN', exact: true }).evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.setViewportSize({ width: 840, height: 1000 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../docs/evidence/text-200-percent.png', fullPage: true });
  await writeFile('../docs/evidence/accessibility.json', JSON.stringify({ automated: evidence, contrast, errors, failed, reducedMotion: true, textEnlargement: '200% at 840px; not native browser zoom' }, null, 2));
  expect(errors).toEqual([]); expect(failed).toEqual([]);
});
