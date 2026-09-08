import { expect, test } from '@playwright/test';
import type {
  CharacterMutationResult,
  InteractionMutationResult,
  ItemDefinitionMutationResult,
  ReaderProgress,
  StatDefinitionMutationResult,
  Story,
  TriggerMutationResult,
} from '@paralleax/shared';
import {
  expectSuccessful,
  registerAndCreateStory,
  requestApiJson,
  waitForApiResponse,
} from './realStackTestHarness';

test('a reader save reconstructs variables, inventory, time, probability, and timers', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const { storyId } = await registerAndCreateStory(page, 'Runtime state');
  await page.goto('about:blank');

  await requestApiJson<Story>(page, 'PATCH', `/api/stories/${storyId}`, {
    startDateTime: '2026-07-27T09:00',
  });
  const { character } = await requestApiJson<CharacterMutationResult>(
    page,
    'POST',
    `/api/stories/${storyId}/characters`,
    { name: 'Mira', isPlayable: true },
  );
  const { statDefinition: courageDefinition } = await requestApiJson<StatDefinitionMutationResult>(
    page,
    'POST',
    `/api/stories/${storyId}/stat-definitions`,
    { name: 'Courage', valueType: 'number', changePerHour: 1 },
  );
  const storyWithCourage = await requestApiJson<Story>(
    page,
    'POST',
    `/api/stories/${storyId}/stats`,
    {
      statDefinitionId: courageDefinition.id,
      ownerType: 'story',
      initialValue: 2,
    },
  );
  const courage = storyWithCourage.stats?.find(
    ({ statDefinitionId }) => statDefinitionId === courageDefinition.id,
  );
  expect(courage).toBeDefined();

  const { statDefinition: durabilityDefinition } =
    await requestApiJson<StatDefinitionMutationResult>(
      page,
      'POST',
      `/api/stories/${storyId}/stat-definitions`,
      { name: 'Durability', valueType: 'number' },
    );
  const { itemDefinition } = await requestApiJson<ItemDefinitionMutationResult>(
    page,
    'POST',
    `/api/stories/${storyId}/item-definitions`,
    {
      name: 'Key',
      stats: [{ statDefinitionId: durabilityDefinition.id, initialValue: 10 }],
    },
  );
  const durability = itemDefinition.stats?.[0];
  expect(durability).toBeDefined();

  const { interaction: opening } = await requestApiJson<InteractionMutationResult>(
    page,
    'POST',
    `/api/stories/${storyId}/interactions`,
    {},
  );
  const { interaction: timedPath } = await requestApiJson<InteractionMutationResult>(
    page,
    'POST',
    `/api/stories/${storyId}/interactions`,
    { parentId: opening.id },
  );
  const { interaction: randomPath } = await requestApiJson<InteractionMutationResult>(
    page,
    'POST',
    `/api/stories/${storyId}/interactions`,
    { parentId: opening.id },
  );

  await requestApiJson<InteractionMutationResult>(
    page,
    'PATCH',
    `/api/stories/${storyId}/interactions/${opening.id}`,
    {
      title: 'Opening',
      body: '<p>Courage: {{story.Courage}}</p>',
      characterIds: [character.id],
      durationMinutes: 60,
      statEffects: [{ statId: courage!.id, operation: 'add', value: 3 }],
      itemEffects: [
        {
          itemDefinitionId: itemDefinition.id,
          characterId: character.id,
          operation: 'obtain',
        },
      ],
    },
  );
  await requestApiJson<InteractionMutationResult>(
    page,
    'PATCH',
    `/api/stories/${storyId}/interactions/${timedPath.id}`,
    { title: 'Timed passage', body: 'The timer is still running.' },
  );
  await requestApiJson<InteractionMutationResult>(
    page,
    'PATCH',
    `/api/stories/${storyId}/interactions/${randomPath.id}`,
    { title: 'Random passage', body: 'The seeded roll succeeded.' },
  );

  const timedTriggerId = timedPath.triggers[0]?.id;
  const randomTriggerId = randomPath.triggers[0]?.id;
  expect(timedTriggerId).toBeDefined();
  expect(randomTriggerId).toBeDefined();
  await requestApiJson<TriggerMutationResult>(
    page,
    'PATCH',
    `/api/stories/${storyId}/interactions/${timedPath.id}/triggers/${timedTriggerId}`,
    { appearanceProbability: 100, timerSeconds: 600 },
  );
  await requestApiJson<TriggerMutationResult>(
    page,
    'PATCH',
    `/api/stories/${storyId}/interactions/${randomPath.id}/triggers/${randomTriggerId}`,
    { appearanceProbability: 50 },
  );

  await page.goto(`/stories/${storyId}/play`);
  await expect(page.getByRole('heading', { name: 'Choose your character' })).toBeVisible();
  await page.getByRole('button', { name: 'Mira' }).click();
  await expect(page.getByRole('heading', { name: 'Start the story' })).toBeVisible();

  const progressSave = waitForApiResponse(
    page,
    'PATCH',
    new RegExp(`/api/stories/${storyId}/progress$`),
  );
  await page.getByRole('button', { name: 'Opening' }).click();
  const savedResponse = await expectSuccessful(progressSave);
  const saved = (await savedResponse.json()) as ReaderProgress;

  expect(saved.state.statValues[courage!.id]).toBe(6);
  expect(saved.state.currentDateTime).toBe('2026-07-27T10:00');
  expect(saved.state.ownedItemIds).toHaveLength(1);
  expect(saved.state.randomSeed).toEqual(expect.any(String));
  expect(saved.state.stepStartedAt).toHaveLength(2);
  expect(
    Object.values(saved.state.itemStatValues ?? {}).some((values) => values[durability!.id] === 10),
  ).toBe(true);

  await expect(page.getByRole('heading', { name: 'Opening' })).toBeVisible();
  await expect(page.locator('[data-stat-value]').filter({ hasText: /^6$/ })).toBeVisible();
  await expect(page.getByText('2026-07-27 10:00')).toBeVisible();
  const inventory = page.getByRole('complementary', { name: 'Played character' });
  await expect(inventory).toContainText('Key');
  await expect(inventory).toContainText('Durability: 10');

  const timedOption = page.getByRole('button', { name: 'Timed passage' });
  await expect(timedOption).toBeVisible();
  const timer = page.getByRole('progressbar', { name: 'Time remaining for this option' });
  await expect(timer).toHaveAttribute('aria-valuemax', '600');
  const timerBeforeReload = Number(await timer.getAttribute('aria-valuenow'));
  const randomOptionBeforeReload = await page
    .getByRole('button', { name: 'Random passage' })
    .count();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Opening' })).toBeVisible();
  await expect(inventory).toContainText('Key');
  await expect(page.locator('[data-stat-value]').filter({ hasText: /^6$/ })).toBeVisible();
  await expect(page.getByText('2026-07-27 10:00')).toBeVisible();
  await expect(timedOption).toBeVisible();
  const timerAfterReload = Number(await timer.getAttribute('aria-valuenow'));
  expect(timerAfterReload).toBeGreaterThan(0);
  expect(timerAfterReload).toBeLessThanOrEqual(timerBeforeReload);
  await expect(page.getByRole('button', { name: 'Random passage' })).toHaveCount(
    randomOptionBeforeReload,
  );

  const reloaded = await requestApiJson<{ progress: ReaderProgress }>(
    page,
    'GET',
    `/api/stories/${storyId}/progress`,
  );
  expect(reloaded.progress.state.randomSeed).toBe(saved.state.randomSeed);
  expect(reloaded.progress.state.stepStartedAt).toEqual(saved.state.stepStartedAt);
  expect(reloaded.progress.state.statValues[courage!.id]).toBe(6);
  expect(reloaded.progress.state.ownedItemIds).toEqual(saved.state.ownedItemIds);
});
