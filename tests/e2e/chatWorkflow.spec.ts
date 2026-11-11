import { test, expect } from '@playwright/test';

test.describe('Scenario 15: End-to-End Chat & Memory Workflow', () => {
  test('User can converse, memories persist, page reloads keep history, and citations render', async ({ page }) => {
    // 1. Open the application
    await page.goto('/');

    // Verify Brand title in sidebar header
    await expect(page.locator('h1:has-text("Minimi")')).toBeVisible();

    // Verify Welcome text
    await expect(page.locator('h2:has-text("Welcome to Minimi")')).toBeVisible();

    // 2. Start a conversation by typing a memory statement
    const inputArea = page.locator('textarea');
    await expect(inputArea).toBeVisible();

    const initialStatement = 'I am planning to buy a laptop. My budget is ₹80,000, and I prefer ASUS.';
    await inputArea.fill(initialStatement);

    // Click send button
    const sendButton = page.locator('button[aria-label="Send message"]');
    await sendButton.click();

    // 3. Verify user message appears in chat
    await expect(page.locator(`text=${initialStatement}`).first()).toBeVisible();

    // 4. Wait for and verify assistant response
    // Response should mention ASUS or budget
    const assistantBubble = page.locator('.prose');
    await expect(assistantBubble.first()).toBeVisible({ timeout: 15000 });
    const responseText = await assistantBubble.first().textContent();
    expect(responseText).toBeTruthy();

    // 5. Verify conversation appears in sidebar
    const convItem = page.locator('aside').locator('text=I am planning to buy a laptop');
    await expect(convItem.first()).toBeVisible();

    // 6. Refresh the page to test persistence across browser sessions
    await page.reload();

    // Verify conversation still listed in sidebar
    await expect(page.locator('aside').locator('text=I am planning to buy a laptop').first()).toBeVisible({ timeout: 10000 });

    // Click to reopen conversation
    await page.locator('aside').locator('text=I am planning to buy a laptop').first().click();

    // Verify previous messages reloaded
    await expect(page.locator(`text=${initialStatement}`).first()).toBeVisible();

    // 7. Open Memory Vault and inspect stored memories
    await page.locator('button:has-text("Memory Vault")').click();
    await expect(page.locator('h2:has-text("Memory Vault")')).toBeVisible();

    // Verify ASUS preference record is displayed in vault
    await expect(page.locator('text=user → preferred_laptop_brand:').first()).toBeVisible({ timeout: 10000 });

    // Close Memory Vault
    await page.locator('button:has(svg.lucide-x)').click();

    // 8. Ask follow-up question in the same or new session
    await inputArea.fill('Which brand did I prefer for my laptop?');
    await sendButton.click();

    // Verify second response arrives and correctly recalls ASUS from persistent DB
    const secondReply = page.locator('.prose').last();
    await expect(secondReply).toBeVisible({ timeout: 15000 });
    const secondReplyText = await secondReply.textContent();
    expect(secondReplyText).toContain('ASUS');
  });
});
