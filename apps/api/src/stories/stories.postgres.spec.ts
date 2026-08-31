import { randomUUID } from 'node:crypto';
import { buildReaderProgressState, createDemoStories, type Story } from '@paralleax/shared';
import { Pool } from 'pg';
import type { DatabaseConnection } from '../database/database.connection';
import { DatabaseMigrator } from '../database/database.migrator';
import { StoriesRepository } from './stories.repository';

const connectionString = process.env.POSTGRES_TEST_DATABASE_URL;
const describePostgres = connectionString ? describe : describe.skip;

describePostgres('StoriesRepository PostgreSQL integration', () => {
  const ownerId = `postgres-user-${randomUUID()}`;
  const collaboratorId = `postgres-collaborator-${randomUUID()}`;
  const adminId = `postgres-admin-${randomUUID()}`;
  const pool = new Pool({ connectionString });
  const database = { pool } as DatabaseConnection;
  const migrator = new DatabaseMigrator(database);
  const repository = new StoriesRepository(database);
  const storyIds: string[] = [];

  beforeAll(async () => {
    await waitForPostgres(pool);
    // Always start from a clean dedicated test schema. A previous interrupted
    // migration scenario may otherwise leave historical tables without matching
    // schema_migrations rows.
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await migrator.run();
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, created_at)
       VALUES
         ($1, $2, 'test-only', 'user', now()),
         ($3, $4, 'test-only', 'user', now()),
         ($5, $6, 'test-only', 'admin', now())`,
      [
        ownerId,
        `${ownerId}@example.test`,
        collaboratorId,
        `${collaboratorId}@example.test`,
        adminId,
        `${adminId}@example.test`,
      ],
    );
  }, 30_000);

  afterEach(async () => {
    await Promise.all(storyIds.splice(0).map((id) => repository.delete(id, ownerId)));
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::text[])', [
      [ownerId, collaboratorId, adminId],
    ]);
    await pool.end();
  });

  function persistedStory(): Story {
    const now = new Date().toISOString();
    const id = `postgres-test-${randomUUID()}`;
    storyIds.push(id);
    return {
      id,
      title: 'PostgreSQL round trip',
      startDateTime: '2026-07-27T09:30',
      createdAt: now,
      updatedAt: now,
      locations: [
        {
          id: 'location-1',
          name: 'Harbor',
          description: 'A quiet harbor.',
          category: 'Coast',
          imageUrl: 'https://images.example/harbor.png',
          stats: [
            {
              id: 'weather-stat',
              statDefinitionId: 'weather-definition',
              initialValue: 'calm',
            },
          ],
        },
      ],
      statDefinitions: [
        { id: 'alarm-definition', name: 'Alarm', valueType: 'boolean' },
        {
          id: 'courage-definition',
          name: 'Courage',
          valueType: 'number',
          changePerHour: 2,
        },
        { id: 'weather-definition', name: 'Weather', valueType: 'string' },
        { id: 'charge-definition', name: 'Charge', valueType: 'number' },
        {
          id: 'definition-1',
          name: 'Trust',
          valueType: 'number',
          category: 'Relationships',
          imageUrl: 'https://images.example/trust.svg',
          changePerHour: -0.5,
        },
      ],
      stats: [
        {
          id: 'alarm-stat',
          statDefinitionId: 'alarm-definition',
          initialValue: false,
        },
      ],
      itemDefinitions: [
        {
          id: 'item-definition-1',
          name: 'Key',
          description: 'A brass key.',
          category: 'Quest items',
          imageUrl: 'https://images.example/key.png',
          stats: [
            {
              id: 'charge-stat',
              statDefinitionId: 'charge-definition',
              initialValue: 10,
            },
          ],
        },
      ],
      characters: [
        {
          id: 'character-1',
          name: 'Mira',
          description: 'An investigator.',
          category: 'Allies',
          imageUrl: 'https://images.example/mira.png',
          stats: [
            {
              id: 'courage-stat',
              statDefinitionId: 'courage-definition',
              initialValue: 1,
            },
            { id: 'stat-1', statDefinitionId: 'definition-1', initialValue: 2 },
          ],
          items: [
            { id: 'item-1', itemDefinitionId: 'item-definition-1' },
            { id: 'item-2', itemDefinitionId: 'item-definition-1' },
          ],
        },
      ],
      graphDecorations: [
        {
          id: 'frame-1',
          kind: 'frame',
          position: { x: 20, y: 30 },
          color: '#5b6ee1',
          width: 420,
          height: 240,
        },
        {
          id: 'text-1',
          kind: 'text',
          position: { x: 40, y: 50 },
          color: '#273043',
          text: 'Act one',
          fontSize: 32,
          fontFamily: 'sans',
          fontWeight: 'normal',
          fontStyle: 'normal',
        },
      ],
      interactions: [
        {
          id: 'interaction-1',
          title: 'Original title',
          body: 'Original content',
          position: { x: 80, y: 120 },
          locationId: 'location-1',
          characterIds: ['character-1'],
          statEffects: [
            { statId: 'stat-1', operation: 'add', value: 1 },
            {
              statId: 'alarm-stat',
              operation: 'set',
              value: true,
            },
            {
              statId: 'courage-stat',
              operation: 'add',
              value: 2,
            },
            {
              statId: 'charge-stat',
              itemId: 'item-1',
              operation: 'add',
              value: -1,
            },
          ],
          itemEffects: [{ itemId: 'item-1', operation: 'obtain' }],
          durationMinutes: 45,
          triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
        },
        {
          id: 'interaction-2',
          title: 'Next scene',
          body: 'A linked scene',
          position: { x: 320, y: 120 },
          triggers: [
            {
              id: 'trigger-2',
              inputInteractionIds: ['interaction-1'],
              conditions: [
                { interactionId: 'interaction-1', hasBeenVisited: true },
                { locationId: 'location-1', isCurrentLocation: true },
                { characterId: 'character-1', isPresent: true },
                { statId: 'stat-1', operator: 'gte', value: 3 },
                { statId: 'alarm-stat', operator: 'eq', value: true },
                { statId: 'courage-stat', operator: 'gte', value: 4 },
                { statId: 'weather-stat', operator: 'eq', value: 'calm' },
                {
                  statId: 'charge-stat',
                  itemId: 'item-1',
                  operator: 'gte',
                  value: 9,
                },
                {
                  temporal: {
                    weekdays: ['monday', 'tuesday'],
                    timeSlots: [
                      { startTime: '09:00', endTime: '12:00' },
                      { startTime: '22:00', endTime: '02:00' },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };
  }

  it('persists interaction and trigger moves across repository instances', async () => {
    const story = persistedStory();
    await repository.save(story, ownerId);
    await repository.mutate(
      story.id,
      (current) => {
        current.interactions[0].position = { x: 420, y: 360 };
        current.interactions[1].triggers[0].position = { x: 280, y: 240 };
        const frame = current.graphDecorations?.find(({ id }) => id === 'frame-1');
        if (frame?.kind === 'frame') {
          frame.position = { x: 60, y: 70 };
          frame.width = 560;
          frame.height = 300;
        }
        const text = current.graphDecorations?.find(({ id }) => id === 'text-1');
        if (text?.kind === 'text') {
          text.text = 'Opening act';
          text.fontFamily = 'serif';
          text.fontWeight = 'bold';
        }
        current.updatedAt = new Date().toISOString();
        return current;
      },
      ownerId,
    );

    const reloadedRepository = new StoriesRepository(database);
    const reloaded = await reloadedRepository.find(story.id, ownerId);
    expect(reloaded?.interactions[0]).toMatchObject({
      title: 'Original title',
      body: 'Original content',
      position: { x: 420, y: 360 },
      locationId: 'location-1',
      characterIds: ['character-1'],
      statEffects: story.interactions[0].statEffects,
      itemEffects: [{ itemId: 'item-1', operation: 'obtain' }],
      durationMinutes: 45,
    });
    expect(reloaded?.interactions[1].triggers[0]).toMatchObject({
      id: 'trigger-2',
      inputInteractionIds: ['interaction-1'],
      position: { x: 280, y: 240 },
    });
    expect(reloaded?.graphDecorations).toEqual([
      {
        id: 'frame-1',
        kind: 'frame',
        position: { x: 60, y: 70 },
        color: '#5b6ee1',
        width: 560,
        height: 300,
      },
      {
        id: 'text-1',
        kind: 'text',
        position: { x: 40, y: 50 },
        color: '#273043',
        text: 'Opening act',
        fontSize: 32,
        fontFamily: 'serif',
        fontWeight: 'bold',
        fontStyle: 'normal',
      },
    ]);
    expect(reloaded?.locations).toEqual([
      {
        id: 'location-1',
        name: 'Harbor',
        description: 'A quiet harbor.',
        category: 'Coast',
        imageUrl: 'https://images.example/harbor.png',
        stats: story.locations?.[0].stats,
      },
    ]);
    expect(reloaded?.characters?.[0].imageUrl).toBe('https://images.example/mira.png');
    expect(reloaded?.characters?.[0].category).toBe('Allies');
    expect(reloaded?.characters?.[0].stats).toEqual(story.characters?.[0].stats);
    expect(reloaded?.statDefinitions).toEqual(story.statDefinitions);
    expect(reloaded?.stats).toEqual(story.stats);
    expect(reloaded?.statDefinitions?.[4].imageUrl).toBe('https://images.example/trust.svg');
    expect(reloaded?.statDefinitions?.[4].category).toBe('Relationships');
    expect(reloaded?.statDefinitions?.[4].changePerHour).toBe(-0.5);
    expect(reloaded?.itemDefinitions?.[0].imageUrl).toBe('https://images.example/key.png');
    expect(reloaded?.itemDefinitions?.[0].category).toBe('Quest items');
    expect(reloaded?.itemDefinitions?.[0].stats).toEqual(story.itemDefinitions?.[0].stats);
    expect(reloaded?.interactions[1].triggers[0]).toEqual({
      id: 'trigger-2',
      inputInteractionIds: ['interaction-1'],
      position: { x: 280, y: 240 },
      conditionGroups: [
        {
          id: 'trigger-2',
          conditions: [
            { interactionId: 'interaction-1', hasBeenVisited: true },
            { locationId: 'location-1', isCurrentLocation: true },
            { characterId: 'character-1', isPresent: true },
            { statId: 'stat-1', operator: 'gte', value: 3 },
            { statId: 'alarm-stat', operator: 'eq', value: true },
            { statId: 'courage-stat', operator: 'gte', value: 4 },
            { statId: 'weather-stat', operator: 'eq', value: 'calm' },
            {
              statId: 'charge-stat',
              itemId: 'item-1',
              operator: 'gte',
              value: 9,
            },
            {
              temporal: {
                weekdays: ['monday', 'tuesday'],
                timeSlots: [
                  { startTime: '09:00', endTime: '12:00' },
                  { startTime: '22:00', endTime: '02:00' },
                ],
              },
            },
          ],
        },
      ],
      appearanceProbability: 100,
    });
  });

  it('merges concurrent field-level mutations without losing fields', async () => {
    const story = persistedStory();
    await repository.save(story, ownerId);

    await Promise.all([
      repository.mutate(
        story.id,
        async (current) => {
          current.interactions[0].title = 'Concurrent title';
          await new Promise((resolve) => setTimeout(resolve, 75));
          return current;
        },
        ownerId,
      ),
      repository.mutate(
        story.id,
        (current) => {
          current.interactions[0].body = 'Concurrent content';
          return current;
        },
        ownerId,
      ),
    ]);

    const reloaded = await repository.find(story.id, ownerId);
    expect(reloaded?.interactions[0]).toMatchObject({
      title: 'Concurrent title',
      body: 'Concurrent content',
    });
  });

  it('keeps reversible authored history across repository instances', async () => {
    const story = persistedStory();
    story.revision = 1;
    await repository.save(story, ownerId);
    await repository.mutate(
      story.id,
      (current) => ({
        ...current,
        revision: 2,
        title: 'Changed through history',
        updatedAt: new Date().toISOString(),
      }),
      ownerId,
    );

    const reloadedRepository = new StoriesRepository(database);
    await expect(reloadedRepository.getHistory(story.id, ownerId)).resolves.toMatchObject({
      canUndo: true,
      canRedo: false,
      entries: [{ revision: 2, kind: 'change', reverted: false }],
    });
    const undone = await reloadedRepository.revertHistory(story.id, ownerId, 'undo');
    expect(undone).toMatchObject({
      kind: 'applied',
      result: {
        story: { title: 'PostgreSQL round trip', revision: 3 },
        history: { canUndo: false, canRedo: true },
      },
    });

    const finalRepository = new StoriesRepository(database);
    const redone = await finalRepository.revertHistory(story.id, ownerId, 'redo');
    expect(redone).toMatchObject({
      kind: 'applied',
      result: {
        story: { title: 'Changed through history', revision: 4 },
        history: { canUndo: true, canRedo: false },
      },
    });
  });

  it('round-trips versioned reader progress JSON per user and story', async () => {
    const story = persistedStory();
    await repository.save(story, ownerId);
    const state = buildReaderProgressState(
      story,
      ['interaction-1', 'interaction-2', 'interaction-1'],
      ['item-1', 'item-2'],
    );
    const updatedAt = '2026-07-27T10:00:00.000Z';

    await expect(repository.saveProgress(story.id, ownerId, state, updatedAt)).resolves.toBe(true);
    await expect(repository.findProgress(story.id, ownerId)).resolves.toEqual({
      id: 'reader-autosave',
      kind: 'reader-autosave',
      state,
      createdAt: updatedAt,
      updatedAt,
    });
    await repository.saveProgress(
      story.id,
      ownerId,
      state,
      '2026-07-27T10:01:00.000Z',
      'simulation-autosave',
    );
    await repository.saveProgress(
      story.id,
      ownerId,
      state,
      '2026-07-27T10:02:00.000Z',
      'manual-save-1',
      'Before the gate',
    );
    await expect(repository.findProgressSaves(story.id, ownerId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'reader-autosave', kind: 'reader-autosave' }),
        expect.objectContaining({ id: 'simulation-autosave', kind: 'simulation-autosave' }),
        expect.objectContaining({
          id: 'manual-save-1',
          kind: 'manual',
          name: 'Before the gate',
        }),
      ]),
    );

    await repository.deleteProgress(story.id, ownerId);
    await expect(repository.findProgress(story.id, ownerId)).resolves.toBeUndefined();
  });

  it('enforces private, invitation, editor, public, and administrator access in SQL', async () => {
    const story = persistedStory();
    await repository.save(story, ownerId);

    await expect(repository.find(story.id)).resolves.toBeUndefined();
    await expect(repository.find(story.id, collaboratorId)).resolves.toBeUndefined();
    await expect(repository.find(story.id, adminId)).resolves.toMatchObject({
      capabilities: { canRead: true, canEdit: true, canManage: true },
    });

    await expect(
      repository.updateAccess(story.id, ownerId, {
        visibility: 'invitation',
        editPolicy: 'collaborators',
        commentPolicy: 'readers',
      }),
    ).resolves.toBe(true);
    await expect(
      repository.setCollaborator(story.id, ownerId, `${collaboratorId}@example.test`, 'viewer'),
    ).resolves.toBe(true);
    await expect(repository.find(story.id, collaboratorId)).resolves.toMatchObject({
      capabilities: { canRead: true, canEdit: false, canManage: false, canComment: true },
    });
    await expect(
      repository.mutate(story.id, (current) => current, collaboratorId),
    ).resolves.toBeUndefined();

    await repository.setCollaborator(story.id, ownerId, `${collaboratorId}@example.test`, 'editor');
    await expect(
      repository.mutate(
        story.id,
        (current) => ({ ...current, title: 'Edited by collaborator' }),
        collaboratorId,
      ),
    ).resolves.toMatchObject({ title: 'Edited by collaborator' });

    await repository.updateAccess(story.id, ownerId, {
      visibility: 'private',
      editPolicy: 'collaborators',
      commentPolicy: 'editors',
    });
    await expect(repository.find(story.id, collaboratorId)).resolves.toBeUndefined();
    await repository.updateAccess(story.id, ownerId, {
      visibility: 'public',
      editPolicy: 'owner',
      commentPolicy: 'editors',
    });
    await expect(repository.find(story.id)).resolves.toMatchObject({
      capabilities: { canRead: true, canEdit: false, canManage: false },
    });
    await expect(repository.listPublic()).resolves.toEqual([
      expect.objectContaining({
        id: story.id,
        capabilities: { canRead: true, canEdit: false, canManage: false, canComment: false },
      }),
    ]);
  });

  it('stores the story graph in relational tables', async () => {
    const story = persistedStory();
    await repository.save(story, ownerId);

    const result = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM interactions WHERE story_id = $1) AS interactions,
         (SELECT count(*)::int FROM locations WHERE story_id = $1) AS locations,
         (SELECT count(*)::int FROM characters WHERE story_id = $1) AS characters,
         (SELECT count(*)::int FROM interaction_characters WHERE story_id = $1)
           AS interaction_characters,
         (SELECT count(*)::int FROM stat_definitions WHERE story_id = $1)
           AS stat_definitions,
         (SELECT count(*)::int FROM stat_assignments WHERE story_id = $1)
           AS stat_assignments,
         (SELECT count(*)::int FROM interaction_stat_effects WHERE story_id = $1)
           AS interaction_stat_effects,
         (SELECT count(*)::int FROM interaction_item_effects WHERE story_id = $1)
           AS interaction_item_effects,
         (SELECT count(*)::int FROM triggers
          JOIN interactions ON interactions.id = triggers.output_interaction_id
          WHERE interactions.story_id = $1) AS triggers,
         (SELECT count(*)::int FROM trigger_inputs
          JOIN triggers ON triggers.id = trigger_inputs.trigger_id
          JOIN interactions ON interactions.id = triggers.output_interaction_id
          WHERE interactions.story_id = $1) AS inputs,
         (SELECT coalesce(sum(group_count.count), 0)::int
          FROM triggers
          CROSS JOIN LATERAL (
            SELECT coalesce(sum(jsonb_array_length(condition_group.value->'conditions')), 0) AS count
            FROM jsonb_array_elements(condition_groups) AS condition_group(value)
          ) AS group_count
          WHERE story_id = $1) AS conditions`,
      [story.id],
    );

    expect(result.rows[0]).toEqual({
      interactions: 2,
      locations: 1,
      characters: 1,
      interaction_characters: 1,
      stat_definitions: 5,
      stat_assignments: 5,
      interaction_stat_effects: 4,
      interaction_item_effects: 1,
      triggers: 2,
      inputs: 1,
      conditions: 9,
    });
  });

  it('round-trips the complete demo catalog without cross-story id collisions', async () => {
    const now = new Date().toISOString();
    const demos = createDemoStories(now, (kind) => `postgres-demo-${kind}-${randomUUID()}`);
    storyIds.push(...demos.map(({ id }) => id));

    await repository.saveMany(demos, ownerId);

    const reloaded = await Promise.all(demos.map(({ id }) => repository.find(id, ownerId)));
    expect(reloaded.map((story) => story?.title)).toEqual(demos.map(({ title }) => title));
    expect(reloaded[2]?.stats).toHaveLength(3);
    expect(reloaded[3]?.characters?.[0].items).toHaveLength(2);
    expect(
      reloaded[4]?.characters?.[0].items?.some((item) => item.relationshipType === 'equipped'),
    ).toBe(true);
    expect(reloaded[4]?.itemDefinitions?.some((definition) => definition.stats?.length === 2)).toBe(
      true,
    );
  });
});

async function waitForPostgres(pool: Pool) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw lastError;
}
