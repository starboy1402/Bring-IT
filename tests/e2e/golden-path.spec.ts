import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { uniqueEmail } from '../db/helpers';

test('Two-user golden path (MS-12): UI signup -> create -> accept -> lifecycle -> chat -> rate + a11y', async ({ browser }) => {
  const aliceEmail = uniqueEmail('cuet.ac.bd');
  const bobEmail = uniqueEmail('cuet.ac.bd');

  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();

  const pageAlice = await aliceContext.newPage();
  const pageBob = await bobContext.newPage();

  pageAlice.on('console', msg => console.log('Alice console:', msg.text()));
  pageBob.on('console', msg => console.log('Bob console:', msg.text()));
  pageAlice.on('pageerror', err => console.log('Alice error:', err.message));
  pageBob.on('pageerror', err => console.log('Bob error:', err.message));
  pageAlice.on('dialog', dialog => {
    console.log('Alice dialog:', dialog.message());
    dialog.dismiss();
  });
  pageBob.on('dialog', dialog => {
    console.log('Bob dialog:', dialog.message());
    dialog.dismiss();
  });

  // Helper for axe scans
  const checkA11y = async (page: Page, pageName: string) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `A11y violations on ${pageName}`).toEqual([]);
  };

  // 1. Alice Signs Up via UI
  await pageAlice.goto('/signup');
  await checkA11y(pageAlice, 'Signup Page');

  await pageAlice.fill('input[type="email"]', aliceEmail);
  await pageAlice.fill('input#password', 'password-123');
  await pageAlice.fill('input#confirm', 'password-123');
  await pageAlice.click('button[type="submit"]');

  // Alice Create Profile
  await expect(pageAlice.getByText(/complete your profile/i)).toBeVisible();
  await pageAlice.fill('input#display_name', 'Alice E2E');
  await pageAlice.fill('input#student_id', '2204123');
  await pageAlice.fill('input#department', 'CSE');
  await pageAlice.fill('input#hall', 'A');
  await pageAlice.fill('input#phone', '01712345678');
  await pageAlice.click('button[type="submit"]');
  await expect(pageAlice.getByText('Alice E2E').first()).toBeVisible({ timeout: 10000 });
  await checkA11y(pageAlice, 'Dashboard (Alice)');

  // 2. Bob Signs Up via UI
  await pageBob.goto('/signup');
  await pageBob.fill('input[type="email"]', bobEmail);
  await pageBob.fill('input#password', 'password-123');
  await pageBob.fill('input#confirm', 'password-123');
  await pageBob.click('button[type="submit"]');

  await expect(pageBob.getByText(/complete your profile/i)).toBeVisible();
  await pageBob.fill('input#display_name', 'Bob E2E');
  await pageBob.fill('input#student_id', '2204124');
  await pageBob.fill('input#department', 'EEE');
  await pageBob.fill('input#hall', 'B');
  await pageBob.fill('input#phone', '01812345678');
  await pageBob.click('button[type="submit"]');
  await expect(pageBob.getByText('Bob E2E').first()).toBeVisible({ timeout: 10000 });

  // 3. Alice creates a request
  await pageAlice.goto('/requests/new');
  await checkA11y(pageAlice, 'New Request Page');
  await pageAlice.fill('input#title', 'Golden Path Delivery');
  await pageAlice.fill('textarea#description', 'This is a test delivery request');
  await pageAlice.fill('input#pickup', 'Campus gate');
  await pageAlice.fill('input#dropoff', 'Hall block A');
  await pageAlice.selectOption('select#urgency', 'high');
  await pageAlice.fill('input#reward', '50');
  await pageAlice.click('button[type="submit"]');

  // Verify Alice sees the request details
  await expect(pageAlice.getByText('open', { exact: true })).toBeVisible();
  await expect(pageAlice.getByText('Golden Path Delivery').first()).toBeVisible();
  await checkA11y(pageAlice, 'Request Details (Open)');

  const aliceUrl = pageAlice.url();
  const requestId = aliceUrl.split('/').pop();
  expect(requestId).toBeTruthy();

  // 4. Bob browses open requests and accepts
  await pageBob.goto('/requests');
  await checkA11y(pageBob, 'Browse Requests');

  await expect(pageBob.getByText('Golden Path Delivery').first()).toBeVisible();
  await pageBob.goto(`/requests/${requestId}`);

  await pageBob.getByRole('button', { name: /Accept delivery/i }).click();
  await expect(pageBob.getByText('accepted', { exact: true })).toBeVisible();

  await pageAlice.reload();
  await expect(pageAlice.getByText('accepted', { exact: true })).toBeVisible();

  // Wait for deterministic realtime connection before sending messages
  await pageBob.waitForSelector('[data-realtime-status="SUBSCRIBED"]');
  await pageAlice.waitForSelector('[data-realtime-status="SUBSCRIBED"]');

  // 5. Participants chat
  await pageBob.fill('input[placeholder="Type a message…"]', 'Hello Alice, I am on my way.');
  await pageBob.getByRole('button', { name: /Send/i }).click();

  // Ensure Bob sees his own message first
  await expect(pageBob.getByText('Hello Alice, I am on my way.')).toBeVisible();

  // Realtime: Alice sees it without reload
  await expect(pageAlice.getByText('Hello Alice, I am on my way.')).toBeVisible({ timeout: 20000 });

  await pageAlice.fill('input[placeholder="Type a message…"]', 'Great, thank you Bob!');
  await pageAlice.getByRole('button', { name: /Send/i }).click();

  // Ensure Alice sees her own message first
  await expect(pageAlice.getByText('Great, thank you Bob!')).toBeVisible();

  // Realtime: Bob sees it without reload
  await expect(pageBob.getByText('Great, thank you Bob!')).toBeVisible({ timeout: 20000 });
  await checkA11y(pageBob, 'Request Details (Chatting)');

  // 6. Lifecycle
  await pageBob.getByRole('button', { name: /Mark picked up/i }).click();
  await expect(pageBob.getByText('in progress', { exact: true })).toBeVisible();
  await pageAlice.reload();
  await expect(pageAlice.getByText('in progress', { exact: true })).toBeVisible();

  await pageBob.getByRole('button', { name: /Mark delivered/i }).click();
  await expect(pageBob.getByText('delivered', { exact: true })).toBeVisible();
  await pageAlice.reload();
  await expect(pageAlice.getByText('delivered', { exact: true })).toBeVisible();

  // 7. Bilateral rating
  await pageAlice.getByRole('button', { name: 'star 5' }).click();
  await pageAlice.getByRole('button', { name: /Submit rating/i }).click();
  await expect(pageAlice.getByText('your rating for your deliverer is recorded', { exact: false })).toBeVisible();

  await pageBob.getByRole('button', { name: 'star 5' }).click();
  await pageBob.getByRole('button', { name: /Submit rating/i }).click();
  await expect(pageBob.getByText('your rating for your requester is recorded', { exact: false })).toBeVisible();
});
