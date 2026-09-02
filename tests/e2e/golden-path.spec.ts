import { test, expect } from '@playwright/test';
import { createTestUser, reactivate } from '../db/helpers';

test('Two-user golden path (MS-12): signup -> create -> accept -> lifecycle -> chat -> rate', async ({ browser }) => {
  // Create two verified users using the DB helpers
  const alice = await createTestUser('cuet.ac.bd', 'Alice E2E');
  await reactivate(alice);
  const bob = await createTestUser('cuet.ac.bd', 'Bob E2E');
  await reactivate(bob);
  
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  
  const pageAlice = await aliceContext.newPage();
  const pageBob = await bobContext.newPage();

  pageAlice.on('console', msg => console.log('Alice:', msg.text()));
  pageBob.on('console', msg => console.log('Bob:', msg.text()));
  
  // 1. Alice logs in
  await pageAlice.goto('/login');
  await pageAlice.fill('input[type="email"]', alice.email);
  await pageAlice.fill('input[type="password"]', 'password-123');
  await pageAlice.click('button[type="submit"]');
  // ensure no error banner
  await expect(pageAlice.locator('[role="alert"]')).toBeHidden({ timeout: 5000 });
  await expect(pageAlice.getByText('Alice E2E').first()).toBeVisible({ timeout: 10000 });

  // 2. Bob logs in
  await pageBob.goto('/login');
  await pageBob.fill('input[type="email"]', bob.email);
  await pageBob.fill('input[type="password"]', 'password-123');
  await pageBob.click('button[type="submit"]');
  await expect(pageBob.locator('[role="alert"]')).toBeHidden({ timeout: 5000 });
  await expect(pageBob.getByText('Bob E2E').first()).toBeVisible({ timeout: 10000 });

  // 3. Alice creates a request
  await pageAlice.goto('/requests/new');
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

  // Extract request ID from URL
  const aliceUrl = pageAlice.url();
  const requestId = aliceUrl.split('/').pop();
  expect(requestId).toBeTruthy();

  // 4. Bob browses open requests and accepts
  await pageBob.goto('/requests');
  await expect(pageBob.getByText('Golden Path Delivery').first()).toBeVisible();
  // Bob navigates to the request
  await pageBob.goto(`/requests/${requestId}`);
  await expect(pageBob.getByText('Golden Path Delivery').first()).toBeVisible();
  
  // Bob accepts the delivery
  await pageBob.getByRole('button', { name: /Accept delivery/i }).click();
  // Status should change to accepted
  await expect(pageBob.getByText('accepted', { exact: true })).toBeVisible();
  await pageAlice.reload();
  await expect(pageAlice.getByText('accepted', { exact: true })).toBeVisible();

  // Participants chat
  await pageBob.fill('input[placeholder="Type a message…"]', 'Hello Alice, I am on my way.');
  await pageBob.getByRole('button', { name: /Send/i }).click();
  await expect(pageBob.getByText('Hello Alice, I am on my way.')).toBeVisible({ timeout: 20000 });

  // Alice sees the message
  await expect(pageAlice.getByText('Hello Alice, I am on my way.')).toBeVisible({ timeout: 20000 });

  await pageAlice.fill('input[placeholder="Type a message…"]', 'Great, thank you Bob!');
  await pageAlice.getByRole('button', { name: /Send/i }).click();

  // Bob sees Alice's message
  await expect(pageBob.getByText('Great, thank you Bob!')).toBeVisible();

  // 6. Lifecycle (Bob advances to in_progress, then delivered)
  await pageBob.getByRole('button', { name: /Mark picked up/i }).click();
  await expect(pageBob.getByText('in progress', { exact: true })).toBeVisible();
  await pageAlice.reload();
  await expect(pageAlice.getByText('in progress', { exact: true })).toBeVisible();

  await pageBob.getByRole('button', { name: /Mark delivered/i }).click();
  await expect(pageBob.getByText('delivered', { exact: true })).toBeVisible();
  await pageAlice.reload();
  await expect(pageAlice.getByText('delivered', { exact: true })).toBeVisible();

  // 7. Bilateral rating
  // Alice rates Bob
  await pageAlice.getByRole('button', { name: 'star 5' }).click();
  await pageAlice.getByRole('button', { name: /Submit rating/i }).click();
  await expect(pageAlice.getByText('your rating for your deliverer is recorded', { exact: false })).toBeVisible();

  // Bob rates Alice
  await pageBob.getByRole('button', { name: 'star 5' }).click();
  await pageBob.getByRole('button', { name: /Submit rating/i }).click();
  await expect(pageBob.getByText('your rating for your requester is recorded', { exact: false })).toBeVisible();
});
