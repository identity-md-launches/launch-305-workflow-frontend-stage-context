import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 25_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: '../docs/evidence/interactions.json' }]],
  outputDir: '../test/scratch/playwright-results',
  use: { baseURL: 'http://localhost:4173/preview/', headless: true, viewport: { width: 1440, height: 1100 }, launchOptions: { executablePath: process.env.CROWN_CHROMIUM_PATH } },
  webServer: { command: 'node scripts/serve.mjs', url: 'http://localhost:4173/preview/', reuseExistingServer: true },
});
