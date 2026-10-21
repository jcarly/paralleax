import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  moveStoryGroup,
  setStoryGroupInteractions,
  removeStoryGroup,
  type Story,
} from '@paralleax/shared';
import { mockStory, prepareEditorPage, storyWithConditionCandidate } from './editorTestHarness';

async function installGroups(page: Page, input?: Story) {
  await prepareEditorPage(page);
  let current = input ?? storyWithConditionCandidate();
  current.revision = 1;
  current.groups ??= [
    { id: 'parent', title: 'Act', interactionIds: ['interaction-2'] },
    { id: 'child', title: 'Scene', interactionIds: ['interaction-1'], parentGroupId: 'parent' },
    { id: 'other', title: 'Other', interactionIds: [] },
  ];
  let writes = 0;
  let before: Story | undefined;
  let after: Story | undefined;
  await mockStory(page, () => current);
  await page.route('**/api/stories/story-1/history', (route) =>
    route.fulfill({ json: { entries: [], canUndo: Boolean(before), canRedo: false } }),
  );
  await page.route('**/api/stories/story-1/history/undo', (route) => {
    current = { ...structuredClone(before!), revision: current.revision! + 1 };
    return route.fulfill({
      json: { story: current, history: { entries: [], canUndo: false, canRedo: true } },
    });
  });
  await page.route('**/api/stories/story-1/history/redo', (route) => {
    current = { ...structuredClone(after!), revision: current.revision! + 1 };
    return route.fulfill({
      json: { story: current, history: { entries: [], canUndo: true, canRedo: false } },
    });
  });
  await page.route('**/api/stories/story-1/groups/*', async (route) => {
    writes++;
    before = structuredClone(current);
    const id = route.request().url().split('/').at(-1)!;
    if (route.request().method() === 'DELETE') {
      current = removeStoryGroup(current, id);
      current.revision!++;
      after = structuredClone(current);
      await route.fulfill({
        json: { groupId: id, revision: current.revision, updatedAt: current.updatedAt },
      });
      return;
    }
    const patch = route.request().postDataJSON();
    if (patch.beforeGroupId !== undefined)
      current = moveStoryGroup(current, id, patch.parentGroupId ?? null, patch.beforeGroupId);
    const group = current.groups!.find((group) => group.id === id)!;
    if (patch.title) group.title = patch.title;
    if (patch.interactionIds)
      current = setStoryGroupInteractions(current, id, patch.interactionIds);
    current.revision!++;
    after = structuredClone(current);
    await route.fulfill({
      json: {
        revision: current.revision,
        updatedAt: current.updatedAt,
        group: current.groups!.find((group) => group.id === id),
        groupOrder: current.groups!.map(({ id }) => id),
      },
    });
  });
  await page.route('**/api/stories/story-1/groups', async (route) => {
    writes++;
    before = structuredClone(current);
    const group = { id: 'new-' + writes, ...route.request().postDataJSON() };
    current.groups!.push(group);
    current = setStoryGroupInteractions(current, group.id, group.interactionIds);
    current.revision!++;
    after = structuredClone(current);
    await route.fulfill({
      json: { revision: current.revision, updatedAt: current.updatedAt, group },
    });
  });
  await page.goto('/stories/story-1/edit');
  if (current.groups.length) await expect(page.getByRole('tree')).toBeVisible();
  else await expect(page.getByRole('region', { name: 'Groups', exact: true })).toBeVisible();
  return { story: () => current, writes: () => writes };
}
async function startDrag(page: Page, source: Locator) {
  await expect(source.locator('..').locator('.story-group-actions')).toBeEnabled();
  const box = await source.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 8, box!.y + box!.height / 2, { steps: 3 });
}
async function hoverRow(page: Page, target: Locator, fraction = 0.5) {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height * fraction, { steps: 10 });
}

test('drags into collapsed groups, returns to root, reorders, undoes and reloads canonical order', async ({
  page,
}) => {
  const state = await installGroups(page);
  const positions = state.story().interactions.map(({ position }) => position);
  await startDrag(page, page.getByRole('button', { name: 'Other 0 interactions' }));
  await hoverRow(page, page.locator('#story-group-parent'));
  await expect(page.getByRole('button', { name: 'Scene 1 interaction' })).toBeVisible();
  expect(state.writes()).toBe(0);
  await page.mouse.up();
  await expect
    .poll(() => state.story().groups!.find(({ id }) => id === 'other')?.parentGroupId)
    .toBe('parent');
  await startDrag(page, page.getByRole('button', { name: 'Other 0 interactions' }));
  await hoverRow(page, page.locator('.story-group-root-drop'));
  await page.mouse.up();
  await expect
    .poll(() => state.story().groups!.find(({ id }) => id === 'other')?.parentGroupId)
    .toBeUndefined();
  await startDrag(page, page.getByRole('button', { name: 'Other 0 interactions' }));
  await hoverRow(page, page.locator('#story-group-parent'), 0.1);
  await page.mouse.up();
  await expect
    .poll(() => state.story().groups!.map(({ id }) => id))
    .toEqual(['other', 'parent', 'child']);
  await expect(page.getByRole('button', { name: 'Undo last Story change' })).toBeEnabled();
  await page.keyboard.press('Control+z');
  await expect
    .poll(() => state.story().groups!.map(({ id }) => id))
    .toEqual(['parent', 'child', 'other']);
  await expect(page.getByRole('button', { name: 'Redo Story change' })).toBeEnabled();
  await page.keyboard.press('Control+Shift+z');
  await expect
    .poll(() => state.story().groups!.map(({ id }) => id))
    .toEqual(['other', 'parent', 'child']);
  await page.reload();
  await expect(page.getByRole('treeitem').first()).toHaveAttribute('data-group-id', 'other');
  expect(state.story().interactions.map(({ position }) => position)).toEqual(positions);
});

test('rejects descendant cycles and cancels valid drags without saving', async ({ page }) => {
  const state = await installGroups(page);
  await page.getByRole('button', { name: 'Expand or collapse Act' }).click();
  await startDrag(page, page.getByRole('button', { name: 'Act 2 interactions' }));
  await hoverRow(page, page.locator('#story-group-child'));
  await expect(page.locator('#story-group-child')).toHaveClass(/drop-invalid/);
  await page.mouse.up();
  expect(state.writes()).toBe(0);
  await startDrag(page, page.getByRole('button', { name: 'Other 0 interactions' }));
  await hoverRow(page, page.locator('#story-group-parent'));
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(state.writes()).toBe(0);
  await expect(page.locator('.story-group-root-drop')).toHaveCount(0);
});

test('creates the first group from selection and loads its inline name without an inspector', async ({
  page,
}) => {
  const empty = storyWithConditionCandidate();
  empty.groups = [];
  const state = await installGroups(page, empty);
  await expect(page.getByRole('tree')).toHaveCount(0);
  await page
    .locator('.react-flow__node[data-id="interaction-2"]')
    .click({ modifiers: ['Control'] });
  await page.getByRole('button', { name: 'Create group', exact: true }).click();
  const title = page.getByRole('textbox', { name: 'Group title', exact: true });
  await expect(title).toBeFocused();
  await title.fill('First group');
  await title.press('Enter');
  await expect(page.getByRole('button', { name: 'First group 1 interaction' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Inspector', exact: true })).toHaveCount(0);
  expect(state.story().groups).toHaveLength(1);
});

test('creates directly with Ctrl+G, renames inline and uses context menus without a group inspector', async ({
  page,
}, testInfo) => {
  const state = await installGroups(page);
  await page
    .locator('.react-flow__node[data-id="interaction-2"]')
    .click({ modifiers: ['Control'] });
  await page.keyboard.press('Control+g');
  const title = page.getByRole('textbox', { name: 'Group title', exact: true });
  await expect(title).toBeFocused();
  await title.fill('Opening arc');
  await title.press('Enter');
  const groups = page.getByRole('region', { name: 'Groups', exact: true });
  await expect(groups.getByRole('button', { name: 'Opening arc 1 interaction' })).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Inspector', exact: true }),
  ).not.toBeVisible();
  await expect(
    page.locator('.react-flow__node[data-id="interaction-2"] .interaction-node'),
  ).not.toHaveClass(/dimmed/);
  await expect(
    page.locator('.react-flow__node[data-id="interaction-1"] .interaction-node'),
  ).toHaveClass(/dimmed/);
  await groups.getByRole('button', { name: 'Expand or collapse Act' }).click();
  const parentLabel = await groups
    .getByRole('button', { name: 'Act 1 interaction' })
    .locator('strong')
    .boundingBox();
  const childLabel = await groups
    .getByRole('button', { name: 'Scene 1 interaction' })
    .locator('strong')
    .boundingBox();
  expect(childLabel!.x).toBeGreaterThan(parentLabel!.x);
  await groups.getByRole('button', { name: 'Actions for Scene' }).click();
  await page.getByRole('menuitem', { name: 'Create subgroup' }).click();
  await expect(title).toBeFocused();
  await title.fill('Subgroup');
  await title.press('Enter');
  await page.getByRole('button', { name: 'Opening arc 1 interaction' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename group' }).click();
  await title.fill('Renamed');
  await title.press('Enter');
  await page.getByRole('button', { name: 'Renamed 1 interaction' }).click();
  await page.keyboard.press('F2');
  await title.fill('Cancelled');
  await title.press('Escape');
  await expect(groups.getByRole('button', { name: 'Renamed 1 interaction' })).toBeVisible();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Delete group' }).click();
  await expect(groups.getByRole('button', { name: 'Renamed 1 interaction' })).toHaveCount(0);
  expect(state.story().interactions).toHaveLength(2);
  const accessibility = await new AxeBuilder({ page }).include('.story-groups-panel').analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('groups-tree.png') });
});

test('searches many groups and auto-scrolls the navigation panel during a drag', async ({
  page,
}) => {
  const story = storyWithConditionCandidate();
  story.groups = Array.from({ length: 1000 }, (_, index) => ({
    id: 'g' + index,
    title: 'Group ' + index,
    interactionIds: [],
  }));
  const state = await installGroups(page, story);
  await page.getByRole('searchbox', { name: 'Find a group' }).fill('Group 999');
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Find a group' }).fill('');
  const scroller = page.locator('.location-panel-content');
  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  await startDrag(page, page.getByRole('button', { name: 'Group 0 0 interactions', exact: true }));
  const bounds = await scroller.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height - 3, {
    steps: 10,
  });
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(state.writes()).toBe(0);
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
