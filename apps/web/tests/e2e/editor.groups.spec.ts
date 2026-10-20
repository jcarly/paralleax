import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { setStoryGroupInteractions } from '@paralleax/shared';
import { mockStory, prepareEditorPage, storyWithConditionCandidate } from './editorTestHarness';

test('moves an interaction between groups and preserves nested mixed contents after reload', async ({
  page,
}) => {
  await prepareEditorPage(page);
  let current = storyWithConditionCandidate();
  current.revision = 1;
  current.groups = [
    { id: 'parent', title: 'Act', interactionIds: ['interaction-2'] },
    { id: 'child', title: 'Scene', interactionIds: ['interaction-1'], parentGroupId: 'parent' },
  ];
  await mockStory(page, () => current);
  await page.route('**/api/stories/story-1/groups/child', async (route) => {
    const input = route.request().postDataJSON();
    expect(input.interactionIds).toEqual(['interaction-1', 'interaction-2']);
    current = setStoryGroupInteractions(current, 'child', input.interactionIds);
    current.revision! += 1;
    await route.fulfill({
      json: { revision: current.revision, updatedAt: current.updatedAt, group: current.groups![1] },
    });
  });
  await page.route('**/api/stories/story-1/groups', async (route) => {
    const group = { id: 'new', ...route.request().postDataJSON() };
    current.groups!.push(group);
    current = setStoryGroupInteractions(current, group.id, group.interactionIds);
    current.revision! += 1;
    await route.fulfill({
      json: { revision: current.revision, updatedAt: current.updatedAt, group },
    });
  });
  await page.goto('/stories/story-1/edit');
  const groups = page.getByRole('region', { name: 'Groups', exact: true });
  await page
    .locator('.react-flow__node[data-id="interaction-2"]')
    .click({ modifiers: ['Control'] });
  await groups.getByRole('button', { name: 'Expand or collapse Act' }).click();
  await groups.getByRole('button', { name: 'Expand or collapse Scene' }).click();
  const parent = groups.locator('#story-group-parent').locator('..');
  const child = groups.locator('#story-group-child').locator('..');
  await child.getByRole('button', { name: 'Move selected interactions here' }).click();
  await expect(groups.getByRole('button', { name: 'Scene 2 interactions' })).toBeVisible();
  await expect(parent.locator('> .story-group-contents > ul > .context-entity-row')).toHaveCount(0);
  await expect(child.locator('> .story-group-contents > ul > .context-entity-row')).toHaveCount(2);
  await page.keyboard.press('Control+g');
  await page.locator('.graph-selection-inspector').getByLabel('Group title').fill('Another group');
  await page.getByRole('button', { name: 'Create group', exact: true }).click();
  await expect(groups.getByRole('button', { name: 'Another group 1 interaction' })).toBeVisible();
  await expect(groups.getByRole('button', { name: 'Scene 1 interaction' })).toBeVisible();
  await page.reload();
  await expect(groups.getByRole('button', { name: 'Act 1 interaction' })).toBeVisible();
  await groups.getByRole('button', { name: 'Expand or collapse Act' }).click();
  await expect(groups.getByRole('button', { name: 'Scene 1 interaction' })).toBeVisible();
  await expect(groups.getByRole('button', { name: 'Another group 1 interaction' })).toBeVisible();
  expect(current.groups!.flatMap(({ interactionIds }) => interactionIds).sort()).toEqual([
    'interaction-1',
    'interaction-2',
  ]);
});

test('adds with Shift rectangles and removes with Alt rectangles without changing graph positions', async ({
  page,
}) => {
  await prepareEditorPage(page);
  await mockStory(page, storyWithConditionCandidate());
  await page.goto('/stories/story-1/edit');
  const first = page.locator('.react-flow__node[data-id="interaction-1"]');
  const second = page.locator('.react-flow__node[data-id="interaction-2"]');
  await first.click({ modifiers: ['Control'] });
  async function rectangle(node: typeof first, modifier: 'Shift' | 'Alt') {
    const bounds = await node.boundingBox();
    expect(bounds).not.toBeNull();
    await page.keyboard.down(modifier);
    await page.mouse.move(bounds!.x - 6, bounds!.y - 6);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width + 6, bounds!.y + bounds!.height + 6, {
      steps: 8,
    });
    await page.mouse.up();
    await page.keyboard.up(modifier);
  }
  await rectangle(second, 'Shift');
  await expect(page.getByText('2 interactions selected')).toBeVisible();
  await rectangle(first, 'Alt');
  await expect(page.getByText('1 interaction selected')).toBeVisible();
  await expect(second).toHaveClass(/selected/);
  await expect(first).not.toHaveClass(/selected/);
});

test('creates a selected group immediately, reloads it and manages its membership', async ({
  page,
}, testInfo) => {
  await prepareEditorPage(page);
  const current = storyWithConditionCandidate();
  current.revision = 1;
  await mockStory(page, () => current);
  await page.route('**/api/stories/story-1/groups', async (route) => {
    const input = route.request().postDataJSON();
    const group = { id: 'opening', ...input };
    current.groups = [...(current.groups ?? []), group];
    current.revision! += 1;
    await route.fulfill({
      json: { revision: current.revision, updatedAt: current.updatedAt, group },
    });
  });
  await page.route('**/api/stories/story-1/groups/opening', async (route) => {
    Object.assign(current.groups![0], route.request().postDataJSON());
    current.revision! += 1;
    await route.fulfill({
      json: { revision: current.revision, updatedAt: current.updatedAt, group: current.groups![0] },
    });
  });

  await page.goto('/stories/story-1/edit');
  const first = page.locator('.react-flow__node[data-id="interaction-1"]');
  const second = page.locator('.react-flow__node[data-id="interaction-2"]');
  await first.click({ modifiers: ['Control'] });
  await second.click({ modifiers: ['Control'] });
  await expect(page.getByText('2 interactions selected')).toBeVisible();
  await page.keyboard.press('Control+g');
  const title = page.getByLabel('Group title', { exact: true });
  await expect(title).toBeFocused();
  await title.fill('Opening arc');
  await page.getByRole('button', { name: 'Create group', exact: true }).click();
  const groups = page.getByRole('region', { name: 'Groups', exact: true });
  await expect(groups.getByRole('button', { name: 'Opening arc 2 interactions' })).toBeVisible();
  await expect(
    page.getByText('Group created. It is available in Groups in the left panel.'),
  ).toBeVisible();
  expect(current.groups![0].interactionIds).toEqual(['interaction-1', 'interaction-2']);

  await page.reload();
  const group = groups.getByRole('button', { name: 'Opening arc 2 interactions' });
  await expect(group).toBeVisible();
  await group.click();
  await expect(group).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.graph-selection-inspector')).toHaveCount(0);
  await groups.getByRole('button', { name: 'Expand or collapse Opening arc' }).click();
  await expect(groups.getByRole('button', { name: 'Center on group' })).toBeVisible();
  await groups.getByRole('button', { name: 'Center on group' }).click();
  await groups.getByLabel('Group title').fill('Renamed arc');
  await groups.getByRole('button', { name: 'Rename group' }).click();
  await expect(groups.getByRole('button', { name: 'Renamed arc 2 interactions' })).toBeVisible();
  await groups.getByRole('button', { name: 'Remove Visited scene from group' }).click();
  await expect(groups.getByRole('button', { name: 'Renamed arc 1 interaction' })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include('.story-groups-panel')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('groups-navigation.png') });
  await page.reload();
  await expect(groups.getByRole('button', { name: 'Renamed arc 1 interaction' })).toBeVisible();
});
