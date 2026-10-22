import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';
const port = process.env.CATSLAVE_TEST_PORT ?? '5174';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: `npm run dev -- --port ${port} --mode test`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], browserName: 'chromium', launchOptions: { args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
});
