import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'RetrofootPass123!';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function randomEmail() {
  const randomSuffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  return `retrofoot-auth-${randomSuffix}@example.com`;
}

async function run() {
  const email = process.env.TEST_EMAIL || randomEmail();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle' });
    await page.getByLabel('Manager Name').fill('Auto Login Check');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel('Confirm Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'CREATE ACCOUNT' }).click();

    await page.waitForURL((url) => !url.pathname.startsWith('/register'), {
      timeout: 15000,
    });
    assert(
      !page.url().includes('/login'),
      `Expected authenticated landing page after signup, got ${page.url()}`,
    );
    await page.getByRole('button', { name: 'Sign Out' }).waitFor({
      state: 'visible',
      timeout: 10000,
    });

    await page.reload({ waitUntil: 'networkidle' });
    assert(
      !page.url().includes('/login'),
      `Expected session to persist after reload, got ${page.url()}`,
    );
    await page.getByRole('button', { name: 'Sign Out' }).waitFor({
      state: 'visible',
      timeout: 10000,
    });

    await page.getByRole('button', { name: 'Sign Out' }).click();
    await page.waitForURL((url) => url.pathname.startsWith('/login'), {
      timeout: 10000,
    });

    console.log(
      JSON.stringify({
        status: 'ok',
        baseUrl: BASE_URL,
        testEmail: email,
      }),
    );
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      baseUrl: BASE_URL,
    }),
  );
  process.exit(1);
});
