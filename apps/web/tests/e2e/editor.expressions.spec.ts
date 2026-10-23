import { expect, test } from '@playwright/test';
import { cloneStory, mockStory, prepareEditorPage } from './editorTestHarness';

test('saves an expression, retains invalid drafts and restores the saved expression after reload', async ({
  page,
}) => {
  await prepareEditorPage(page);
  const current = cloneStory();
  current.statDefinitions = [{ id: 'number', name: 'Score', valueType: 'number' }];
  current.stats = [{ id: 'score', statDefinitionId: 'number', initialValue: 2 }];
  current.interactions[0].statEffects = [{ statId: 'score', operation: 'set', value: 3 }];
  await mockStory(page, () => current);
  let writes = 0;
  await page.route('**/api/stories/story-1/interactions/interaction-1', async (route) => {
    expect(route.request().method()).toBe('PATCH');
    const patch = route.request().postDataJSON();
    current.interactions[0].statEffects = patch.statEffects;
    writes += 1;
    await route.fulfill({ json: current });
  });
  await page.goto('/stories/story-1/edit');
  await page.getByTestId('interaction-node').filter({ hasText: 'Original title' }).click();
  await page.getByRole('button', { name: 'Use expression', exact: true }).click();
  await expect.poll(() => writes).toBe(1);
  const field = page.getByLabel('Variable effect expression');
  await field.fill('(@{score} + 2) * 3');
  await field.blur();
  await expect.poll(() => writes).toBe(2);
  expect(current.interactions[0].statEffects).toEqual([
    { statId: 'score', operation: 'set', expression: '(@{score} + 2) * 3' },
  ]);
  await field.fill('@{score} +');
  await field.blur();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(writes).toBe(2);
  await field.fill('(@{score} + 2) * 3');
  await field.blur();
  await expect(field).toHaveAttribute('aria-invalid', 'false');
  await page.reload();
  await page.getByTestId('interaction-node').filter({ hasText: 'Original title' }).click();
  await expect(page.getByLabel('Variable effect expression')).toHaveValue('(@{score} + 2) * 3');
});
