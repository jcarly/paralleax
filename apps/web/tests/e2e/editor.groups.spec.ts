import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import {
  moveStoryGroup,
  removeStoryGroup,
  setStoryGroupInteractions,
  type CreateGroupInput,
  type Group,
  type Story,
  type UpdateGroupInput,
} from '@paralleax/shared';
import { mockStory, prepareEditorPage, storyWithConditionCandidate } from './editorTestHarness';

function requireValue<T>(value: T | null | undefined, description: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${description} to exist`);
  }
  return value;
}

function requireRevision(story: Story): number {
  return requireValue(story.revision, 'story revision');
}

function requireStoryGroups(story: Story): Group[] {
  return requireValue(story.groups, 'story groups');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string');
}

function isGroupUpdateInput(value: unknown): value is UpdateGroupInput {
  return (
    isRecord(value) &&
    isOptionalString(value.title) &&
    isOptionalNullableString(value.parentGroupId) &&
    isOptionalNullableString(value.beforeGroupId) &&
    (value.interactionIds === undefined || isStringArray(value.interactionIds))
  );
}

function isCreateGroupInput(value: unknown): value is CreateGroupInput {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    isStringArray(value.interactionIds) &&
    isOptionalString(value.parentGroupId)
  );
}

function incrementRevision(story: Story): void {
  story.revision = requireRevision(story) + 1;
}

function requireBoundingBox(box: Awaited<ReturnType<Locator['boundingBox']>>, label: string) {
  return requireValue(box, `${label} bounding box`);
}

async function installGroups(page: Page, input?: Story) {
  await prepareEditorPage(page);
  const state = createGroupFixtureState(input);
  await mockStory(page, () => state.current);
  await installGroupHistoryRoutes(page, state);
  await installGroupMutationRoutes(page, state);
  await openGroupTree(page, state);
  return { story: () => state.current, writes: () => state.writes };
}

interface GroupFixtureState {
  current: Story;
  writes: number;
  before?: Story;
  after?: Story;
}

function createGroupFixtureState(input?: Story): GroupFixtureState {
  const current = input ?? storyWithConditionCandidate();
  current.revision = 1;
  current.groups ??= [
    { id: 'parent', title: 'Act', interactionIds: ['interaction-2'] },
    { id: 'child', title: 'Scene', interactionIds: ['interaction-1'], parentGroupId: 'parent' },
    { id: 'other', title: 'Other', interactionIds: [] },
  ];
  return { current, writes: 0 };
}

async function installGroupHistoryRoutes(page: Page, state: GroupFixtureState) {
  await page.route('**/api/stories/story-1/history', (route) =>
    route.fulfill({ json: { entries: [], canUndo: Boolean(state.before), canRedo: false } }),
  );
  await page.route('**/api/stories/story-1/history/undo', (route) => {
    state.current = {
      ...structuredClone(requireValue(state.before, 'previous story snapshot')),
      revision: requireRevision(state.current) + 1,
    };
    return route.fulfill({
      json: { story: state.current, history: { entries: [], canUndo: false, canRedo: true } },
    });
  });
  await page.route('**/api/stories/story-1/history/redo', (route) => {
    state.current = {
      ...structuredClone(requireValue(state.after, 'next story snapshot')),
      revision: requireRevision(state.current) + 1,
    };
    return route.fulfill({
      json: { story: state.current, history: { entries: [], canUndo: true, canRedo: false } },
    });
  });
}

async function installGroupMutationRoutes(page: Page, state: GroupFixtureState) {
  await page.route('**/api/stories/story-1/groups/*', (route) =>
    updateGroupFromRequest(route, state),
  );
  await page.route('**/api/stories/story-1/groups', (route) =>
    createGroupFromRequest(route, state),
  );
}

async function updateGroupFromRequest(route: Route, state: GroupFixtureState) {
  state.writes++;
  state.before = structuredClone(state.current);
  const id = requireValue(route.request().url().split('/').at(-1), 'group route identifier');
  if (route.request().method() === 'DELETE') {
    state.current = removeStoryGroup(state.current, id);
    incrementRevision(state.current);
    state.after = structuredClone(state.current);
    await route.fulfill({
      json: {
        groupId: id,
        revision: state.current.revision,
        updatedAt: state.current.updatedAt,
      },
    });
    return;
  }
  await patchGroupFromRequest(route, state, id);
}

async function patchGroupFromRequest(route: Route, state: GroupFixtureState, id: string) {
  const requestBody: unknown = route.request().postDataJSON();
  if (!isGroupUpdateInput(requestBody)) {
    throw new Error('Expected a valid group update request');
  }
  const patch = requestBody;
  if (patch.beforeGroupId !== undefined) {
    state.current = moveStoryGroup(
      state.current,
      id,
      patch.parentGroupId ?? null,
      patch.beforeGroupId,
    );
  }
  const group = requireValue(
    requireStoryGroups(state.current).find((entry) => entry.id === id),
    `group ${id}`,
  );
  if (patch.title) {
    group.title = patch.title;
  }
  if (patch.interactionIds) {
    state.current = setStoryGroupInteractions(state.current, id, patch.interactionIds);
  }
  incrementRevision(state.current);
  state.after = structuredClone(state.current);
  await route.fulfill({ json: getGroupMutationResult(state, id) });
}

function getGroupMutationResult(state: GroupFixtureState, id: string) {
  const groups = requireStoryGroups(state.current);
  return {
    revision: state.current.revision,
    updatedAt: state.current.updatedAt,
    group: requireValue(
      groups.find((group) => group.id === id),
      `group ${id}`,
    ),
    groupOrder: groups.map(({ id: groupId }) => groupId),
  };
}

async function createGroupFromRequest(route: Route, state: GroupFixtureState) {
  state.writes++;
  state.before = structuredClone(state.current);
  const requestBody: unknown = route.request().postDataJSON();
  if (!isCreateGroupInput(requestBody)) {
    throw new Error('Expected a valid group creation request');
  }
  const group: Group = { id: 'new-' + state.writes, ...requestBody };
  requireStoryGroups(state.current).push(group);
  state.current = setStoryGroupInteractions(state.current, group.id, group.interactionIds);
  incrementRevision(state.current);
  state.after = structuredClone(state.current);
  await route.fulfill({
    json: {
      revision: state.current.revision,
      updatedAt: state.current.updatedAt,
      group,
    },
  });
}

async function openGroupTree(page: Page, state: GroupFixtureState) {
  await page.goto('/stories/story-1/edit');
  const groups = page.getByRole('region', { name: 'Groups', exact: true });
  await expect(groups).toBeVisible();
  if (state.current.groups?.length) {
    const toggle = groups.getByRole('button', { name: /Groups/ });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(groups.getByRole('tree', { name: 'Groups' })).toBeVisible();
  }
}
async function startDrag(page: Page, source: Locator) {
  await expect(source.locator('..').locator('.story-group-actions')).toBeEnabled();
  const box = requireBoundingBox(await source.boundingBox(), 'drag source');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2, { steps: 3 });
}
async function hoverRow(page: Page, target: Locator, fraction = 0.5) {
  await target.scrollIntoViewIfNeeded();
  const box = requireBoundingBox(await target.boundingBox(), 'drop target');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * fraction, { steps: 10 });
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
    .poll(() => requireStoryGroups(state.story()).find(({ id }) => id === 'other')?.parentGroupId)
    .toBe('parent');
  await startDrag(page, page.getByRole('button', { name: 'Other 0 interactions' }));
  const rootDrop = page.locator('.story-group-root-drop');
  await hoverRow(page, rootDrop);
  await expect(rootDrop).toHaveClass(/active/);
  await page.mouse.up();
  await expect
    .poll(() => requireStoryGroups(state.story()).find(({ id }) => id === 'other')?.parentGroupId)
    .toBeUndefined();
  await startDrag(page, page.getByRole('button', { name: 'Other 0 interactions' }));
  await hoverRow(page, page.locator('#story-group-parent'), 0.1);
  await page.mouse.up();
  await expect
    .poll(() => requireStoryGroups(state.story()).map(({ id }) => id))
    .toEqual(['other', 'parent', 'child']);
  await expect(page.getByRole('button', { name: 'Undo last Story change' })).toBeEnabled();
  await page.keyboard.press('Control+z');
  await expect
    .poll(() => requireStoryGroups(state.story()).map(({ id }) => id))
    .toEqual(['parent', 'child', 'other']);
  await expect(page.getByRole('button', { name: 'Redo Story change' })).toBeEnabled();
  await page.keyboard.press('Control+Shift+z');
  await expect
    .poll(() => requireStoryGroups(state.story()).map(({ id }) => id))
    .toEqual(['other', 'parent', 'child']);
  await page.reload();
  const groups = page.getByRole('region', { name: 'Groups', exact: true });
  await groups.getByRole('button', { name: /Groups/ }).click();
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
  await expect(page.locator('.story-group-root-drop')).toHaveAttribute('aria-hidden', 'true');
});

test('requires the configured mouse movement before activating a group drag', async ({ page }) => {
  const state = await installGroups(page);
  const source = page.getByRole('button', { name: 'Other 0 interactions' });
  const bounds = requireBoundingBox(await source.boundingBox(), 'group drag source');
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 4, start.y);
  await expect(page.locator('.story-group-drag-preview')).toHaveCount(0);

  await page.mouse.move(start.x + 6, start.y);
  await expect(page.locator('.story-group-drag-preview')).toHaveText('Other');
  await page.keyboard.press('Escape');
  await page.mouse.up();

  expect(state.writes()).toBe(0);
  await expect(page.locator('.story-group-root-drop')).toHaveAttribute('aria-hidden', 'true');
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
  const groups = page.getByRole('region', { name: 'Groups', exact: true });
  await createGroupWithShortcut(page, groups);
  await exerciseGroupMenusAndKeyboard(page, groups);
  expect(state.story().interactions).toHaveLength(2);
  await checkGroupTreeAccessibility(page, testInfo);
});

async function createGroupWithShortcut(page: Page, groups: Locator) {
  await page
    .locator('.react-flow__node[data-id="interaction-2"]')
    .click({ modifiers: ['Control'] });
  await page.keyboard.press('Control+g');
  const title = page.getByRole('textbox', { name: 'Group title', exact: true });
  await expect(title).toBeFocused();
  await title.fill('Opening arc');
  await title.press('Enter');
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
}

async function exerciseGroupMenusAndKeyboard(page: Page, groups: Locator) {
  const title = page.getByRole('textbox', { name: 'Group title', exact: true });
  await groups.getByRole('button', { name: 'Expand or collapse Act' }).click();
  const parentLabel = requireBoundingBox(
    await groups.getByRole('button', { name: 'Act 1 interaction' }).locator('strong').boundingBox(),
    'parent group label',
  );
  const childLabel = requireBoundingBox(
    await groups
      .getByRole('button', { name: 'Scene 1 interaction' })
      .locator('strong')
      .boundingBox(),
    'child group label',
  );
  expect(childLabel.x).toBeGreaterThan(parentLabel.x);
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
  await expect(groups.getByRole('treeitem', { name: /Renamed/ })).toBeFocused();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Delete group' }).click();
  await expect(groups.getByRole('button', { name: 'Renamed 1 interaction' })).toHaveCount(0);
}

async function checkGroupTreeAccessibility(
  page: Page,
  testInfo: { outputPath: (name: string) => string },
) {
  const accessibility = await new AxeBuilder({ page }).include('.story-groups-panel').analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('groups-tree.png') });
}

function storyWithGroups(count: number): Story {
  const story = storyWithConditionCandidate();
  story.groups = Array.from({ length: count }, (_, index) => ({
    id: 'g' + index,
    title: 'Group ' + index,
    interactionIds: [],
  }));
  return story;
}

test('searches a thousand groups', async ({ page }) => {
  await installGroups(page, storyWithGroups(1000));
  const context = page.getByRole('navigation', { name: 'Story context' });
  const groups = context.getByRole('region', { name: 'Groups', exact: true });
  const toggle = groups.getByRole('button', { name: /Groups/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await context
    .getByRole('searchbox', { name: 'Search story context and interactions' })
    .fill('Group 999');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('treeitem')).toHaveCount(1);
});

test('explores matching group members, ungrouped interactions and incoming triggers', async ({
  page,
}) => {
  await installGroups(page, storyForInteractionSearch());
  await checkSearchableGroupResults(page);
});

function storyForInteractionSearch() {
  const input = storyWithConditionCandidate();
  input.characters = [{ id: 'mira', name: 'Mira', description: '' }];
  input.itemDefinitions = [{ id: 'key', name: 'Silver Key', description: '' }];
  input.interactions[0].title = 'Mira at the quay';
  input.interactions[0].characterIds = ['mira'];
  input.interactions[1].title = 'Unrelated route';
  input.interactions[1].triggers[0].inputInteractionIds = [];
  input.interactions.push({
    id: 'loose',
    title: 'Loose note',
    body: '',
    position: { x: 400, y: 300 },
    itemEffects: [{ itemDefinitionId: 'key', operation: 'obtain' }],
    triggers: [
      {
        id: 'incoming-loose',
        inputInteractionIds: ['interaction-2'],
        conditions: [{ characterId: 'mira', isPresent: true }],
      },
    ],
  });
  input.groups = [
    { id: 'parent', title: 'Act', interactionIds: ['interaction-2'] },
    {
      id: 'child',
      title: 'Scene',
      interactionIds: ['interaction-1'],
      parentGroupId: 'parent',
    },
  ];
  return input;
}

async function checkSearchableGroupResults(page: Page) {
  const context = page.getByRole('navigation', { name: 'Story context' });
  const groups = context.getByRole('region', { name: 'Groups', exact: true });
  const search = context.getByRole('searchbox', { name: 'Search story context and interactions' });

  await search.fill('Act');
  await expect(
    groups.locator('#story-group-parent').getByRole('button', {
      name: 'Expand or collapse Act',
    }),
  ).toHaveAttribute('aria-expanded', 'false');
  await expect(groups.getByRole('treeitem', { name: /Scene/ })).toHaveCount(0);

  await search.fill('Mira');
  await expect(groups.getByRole('treeitem', { name: 'Mira at the quay' })).toBeVisible();
  await expect(groups.getByRole('treeitem', { name: /Unrelated route/ })).toHaveCount(0);
  await expect(groups.getByRole('button', { name: 'Loose note' })).toBeVisible();
  await groups.getByRole('treeitem', { name: 'Mira at the quay' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Inspector' }).getByLabel('Title'),
  ).toHaveValue('Mira at the quay');

  await search.fill('Silver Key');
  await expect(groups.getByRole('button', { name: 'Loose note' })).toBeVisible();
  await expect(groups.getByRole('treeitem', { name: 'Mira at the quay' })).toHaveCount(0);
}

test('auto-scrolls the navigation panel during a group drag', async ({ page }) => {
  const state = await installGroups(page, storyWithGroups(100));
  const scroller = page.locator('.location-panel-content');
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  const group = page.getByRole('button', { name: 'Group 0 0 interactions', exact: true });
  await startDrag(page, group);
  await expect(page.locator('#story-group-g0')).toHaveClass(/dragging/);
  const bounds = requireBoundingBox(await scroller.boundingBox(), 'navigation panel');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height - 3, {
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
    const bounds = requireBoundingBox(await node.boundingBox(), 'selection node');
    await page.keyboard.down(modifier);
    await page.mouse.move(bounds.x - 6, bounds.y - 6);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width + 6, bounds.y + bounds.height + 6, {
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
