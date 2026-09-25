import { test, expect } from '@playwright/test';

/**
 * Critical journey: authentication.
 * Complements user-journey.spec.ts (register → enroll → complete lesson).
 */
test.describe('Critical user journey: authentication', () => {
  test('unauthenticated user is redirected from dashboard to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
  });

  test('login page renders the sign-in form', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /log in|sign in/i })).toBeVisible();
  });

  test('empty submission shows validation errors and stays on login', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: /log in|sign in/i }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByText(/required|valid email/i).first()).toBeVisible();
  });

  test('invalid credentials do not authenticate the user', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel(/email/i).fill(`nobody_${Date.now()}@example.com`);
    await page.getByLabel(/^password$/i).fill('WrongPass@123');
    await page.getByRole('button', { name: /log in|sign in/i }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('login link navigates to registration', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('link', { name: /register|sign up|create account/i }).first().click();
    await expect(page).toHaveURL(/\/auth\/register/);
  });
});
