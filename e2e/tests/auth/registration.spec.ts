import { test } from '@playwright/test';
import { getEmailLinks } from '../fixtures/mailinatorClient';
import { describe } from 'node:test';

describe('as a new user', () => {
    const sampleEmail = "test+"+Math.floor(Math.random()*1000)+"@mailinator.com"
    const password = "Astr0ngPassword!£%£$"

    test('should be able to register', async ({ page }) => {
        await page.goto('/');
        await page.getByTestId('register-link').click();
        await page.getByTestId('email').fill(sampleEmail);
        await page.getByTestId('password').fill(password);
        await page.getByTestId('confirm-password').fill(password);
        await page.getByTestId('create-account').click();
        await page.getByTestId('registration-success').isVisible();

        const link = await getEmailLinks(page.request, sampleEmail)
        await page.goto(link);
    });

    test('should be able to login', async ({ page }) => {
        await page.goto('/');
        await page.getByTestId('email').fill(sampleEmail);
        await page.getByTestId('password').fill(password);
        await page.getByTestId('login').click();
    });

    test('should be able to reset password', async ({ page }) => {
        await page.goto('/');
        await page.getByTestId('forgot-password-link').click();
        await page.getByTestId('email').fill(sampleEmail);
        await page.getByTestId('reset-password').click();
        await page.getByTestId('reset-password-success').isVisible();

        const resetLink = await getEmailLinks(page.request, sampleEmail);
        await page.goto(resetLink);

        const newPassword = "NewStr0ngPassword!£%£$";
        await page.getByTestId('new-password').fill(newPassword);
        await page.getByTestId('confirm-new-password').fill(newPassword);
        await page.getByTestId('submit-new-password').click();
        await page.getByTestId('password-reset-complete').isVisible();

        // Verify login with new password
        await page.goto('/');
        await page.getByTestId('email').fill(sampleEmail);
        await page.getByTestId('password').fill(newPassword);
        await page.getByTestId('login').click();
    })
})

