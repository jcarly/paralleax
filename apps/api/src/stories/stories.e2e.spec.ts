import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import type {
  CharacterMutationResult,
  CharacterItemMutationResult,
  CharacterStatMutationResult,
  InteractionMutationResult,
  ItemDefinitionMutationResult,
  LocationMutationResult,
  StatDefinitionMutationResult,
  Story,
  TriggerMutationResult,
} from '@paralleax/shared';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { DatabaseMigrator } from '../database/database.migrator';
import { InMemoryStoriesRepository } from './stories.repository.memory';
import { StoriesRepository } from './stories.repository';

describe('Stories API', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StoriesRepository)
      .useClass(InMemoryStoriesRepository)
      .overrideProvider(DatabaseMigrator)
      .useValue({ run: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(AuthService)
      .useValue({
        userForToken: jest.fn((token?: string) =>
          Promise.resolve({
            id: token === 'user-two' ? 'user-2' : token === 'user-one' ? 'user-1' : 'test-user',
            email: `${token ?? 'test'}@paralleax.invalid`,
            createdAt: '2026-01-01T00:00:00.000Z',
          }),
        ),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    await app.init();
    httpServer = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  async function createStory(title = 'Test story'): Promise<Story> {
    const response = await request(httpServer).post('/api/stories').send({ title }).expect(201);

    return response.body as Story;
  }

  async function createInteraction(
    storyId: string,
    input: Record<string, unknown> = {},
  ): Promise<Story> {
    await request(httpServer).post(`/api/stories/${storyId}/interactions`).send(input).expect(201);

    const response = await request(httpServer).get(`/api/stories/${storyId}`).expect(200);
    return response.body as Story;
  }

  it('GET /api/stories lists stories', async () => {
    const response = await request(httpServer).get('/api/stories').expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toEqual([]);
  });

  it('POST /api/stories creates a story', async () => {
    const response = await request(httpServer)
      .post('/api/stories')
      .send({ title: 'New API story' })
      .expect(201);

    expect(response.body).toMatchObject({
      title: 'New API story',
      interactions: [],
    });
    expect(response.body.id).toEqual(expect.any(String));
  });

  it('POST /api/stories requires a non-null title', async () => {
    await request(httpServer).post('/api/stories').send({}).expect(400);
    await request(httpServer).post('/api/stories').send({ title: null }).expect(400);
    await request(httpServer).post('/api/stories').send({ title: '' }).expect(400);
    await request(httpServer)
      .post('/api/stories')
      .send({ title: 'x'.repeat(201) })
      .expect(400);
  });

  it('POST /api/stories/demo creates a populated demo story', async () => {
    const response = await request(httpServer).post('/api/stories/demo').send({}).expect(201);
    const story = response.body as Story;

    expect(story).toMatchObject({
      title: 'Demo: branching investigation',
    });
    expect(story.id).toEqual(expect.any(String));
    expect(story.interactions).toHaveLength(9);
    expect(
      story.interactions.some((interaction) =>
        interaction.triggers.some((trigger) => trigger.inputInteractionIds.length > 1),
      ),
    ).toBe(true);
    expect(
      story.interactions.some((interaction) =>
        interaction.triggers.some((trigger) => trigger.conditions.length > 0),
      ),
    ).toBe(true);

    const listResponse = await request(httpServer).get('/api/stories').expect(200);
    expect((listResponse.body as Story[]).some((item) => item.id === story.id)).toBe(true);
  });

  it('GET /api/stories/:storyId returns a story', async () => {
    const story = await createStory('Story to read');

    const response = await request(httpServer).get(`/api/stories/${story.id}`).expect(200);

    expect(response.body).toMatchObject({
      id: story.id,
      title: 'Story to read',
    });
  });

  it('PATCH /api/stories/:storyId renames a story', async () => {
    const story = await createStory('Old title');

    const response = await request(httpServer)
      .patch(`/api/stories/${story.id}`)
      .send({ title: 'Renamed title' })
      .expect(200);

    expect(response.body.title).toBe('Renamed title');
  });

  it('updates and validates the story-local start date and time', async () => {
    const story = await createStory('Timed story');

    const response = await request(httpServer)
      .patch(`/api/stories/${story.id}`)
      .send({ startDateTime: '2026-07-27T09:30' })
      .expect(200);

    expect(response.body.startDateTime).toBe('2026-07-27T09:30');
    await request(httpServer)
      .patch(`/api/stories/${story.id}`)
      .send({ startDateTime: '2026-02-30T09:30' })
      .expect(400);
  });

  it('DELETE /api/stories/:storyId deletes a story', async () => {
    const story = await createStory('Story to delete');

    await request(httpServer).delete(`/api/stories/${story.id}`).expect(204);

    await request(httpServer).get(`/api/stories/${story.id}`).expect(404);
  });

  it('saves, resumes, reconciles, and resets reader progress', async () => {
    const story = await createStory('Progress story');
    await request(httpServer)
      .patch(`/api/stories/${story.id}`)
      .send({ startDateTime: '2026-07-27T09:00' })
      .expect(200);
    const withRoot = await createInteraction(story.id);
    const root = withRoot.interactions[0];
    const withChild = await createInteraction(story.id, { parentId: root.id });
    const child = withChild.interactions.find(({ id }) => id !== root.id)!;

    const definition = await request(httpServer)
      .post(`/api/stories/${story.id}/stat-definitions`)
      .send({ name: 'Trust' })
      .expect(201);
    const character = await request(httpServer)
      .post(`/api/stories/${story.id}/characters`)
      .send({ name: 'Mira' })
      .expect(201);
    const stat = await request(httpServer)
      .post(`/api/stories/${story.id}/characters/${character.body.character.id}/stats`)
      .send({ statDefinitionId: definition.body.statDefinition.id, initialValue: 1 })
      .expect(201);
    const itemDefinition = await request(httpServer)
      .post(`/api/stories/${story.id}/item-definitions`)
      .send({ name: 'Key' })
      .expect(201);
    const item = await request(httpServer)
      .post(`/api/stories/${story.id}/characters/${character.body.character.id}/items`)
      .send({ itemDefinitionId: itemDefinition.body.itemDefinition.id })
      .expect(201);
    await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${root.id}`)
      .send({
        durationMinutes: 15,
        statEffects: [{ statId: stat.body.stat.id, operation: 'add', value: 2 }],
        itemEffects: [{ itemId: item.body.item.id, operation: 'obtain' }],
      })
      .expect(200);

    const saved = await request(httpServer)
      .patch(`/api/stories/${story.id}/progress`)
      .send({
        journeyInteractionIds: [root.id, child.id, root.id],
        ownedItemIds: [item.body.item.id],
        currentDateTime: '2099-01-01T00:00',
        statValues: { forged: 999 },
      })
      .expect(400);

    expect(saved.body.message).toEqual(
      expect.arrayContaining([
        'property currentDateTime should not exist',
        'property statValues should not exist',
      ]),
    );

    const progress = await request(httpServer)
      .patch(`/api/stories/${story.id}/progress`)
      .send({
        journeyInteractionIds: [root.id, child.id, root.id],
        ownedItemIds: [item.body.item.id],
      })
      .expect(200);
    expect(progress.body.state).toMatchObject({
      version: 1,
      journeyInteractionIds: [root.id, child.id, root.id],
      currentInteractionId: root.id,
      visitedInteractionIds: [root.id, child.id],
      currentDateTime: '2026-07-27T09:30',
      statValues: { [stat.body.stat.id]: 5 },
      ownedItemIds: [item.body.item.id],
    });

    await expect(
      request(httpServer).get(`/api/stories/${story.id}/progress`).expect(200),
    ).resolves.toMatchObject({ body: { progress: { state: progress.body.state } } });
    await request(httpServer).delete(`/api/stories/${story.id}/progress`).expect(204);
    await request(httpServer)
      .get(`/api/stories/${story.id}/progress`)
      .expect(200)
      .expect({ progress: null });
  });

  it('POST /api/stories/:storyId/interactions creates a root interaction', async () => {
    const story = await createStory();

    const response = await request(httpServer)
      .post(`/api/stories/${story.id}/interactions`)
      .send({ position: { x: 10, y: 20 } })
      .expect(201);

    const result = response.body as InteractionMutationResult;
    expect(result.interaction).toMatchObject({
      title: 'New interaction',
      position: { x: 10, y: 20 },
    });
    expect(result.interaction.triggers[0].inputInteractionIds).toEqual([]);
    expect(result.revision).toBe(2);
  });

  it('POST /api/stories/:storyId/interactions creates a child interaction linked to its parent', async () => {
    const story = await createStory();
    const withRoot = await createInteraction(story.id);
    const parent = withRoot.interactions[0];

    const response = await request(httpServer)
      .post(`/api/stories/${story.id}/interactions`)
      .send({ parentId: parent.id, position: { x: 100, y: 120 } })
      .expect(201);

    const result = response.body as InteractionMutationResult;
    expect(result.interaction.triggers[0].inputInteractionIds).toEqual([parent.id]);
  });

  it('PATCH /api/stories/:storyId/interactions/:interactionId updates an interaction', async () => {
    const story = await createStory();
    const withInteraction = await createInteraction(story.id);
    const interaction = withInteraction.interactions[0];

    const response = await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({
        title: 'Renamed interaction',
        body: 'New content',
        position: { x: 42, y: 84 },
        durationMinutes: 45,
      })
      .expect(200);

    expect((response.body as InteractionMutationResult).interaction).toMatchObject({
      id: interaction.id,
      title: 'Renamed interaction',
      body: 'New content',
      position: { x: 42, y: 84 },
      durationMinutes: 45,
    });
    await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({ durationMinutes: -1 })
      .expect(400);
  });

  it('keeps persisted title and content when PATCH updates only an interaction position', async () => {
    const story = await createStory();
    const withInteraction = await createInteraction(story.id);
    const interaction = withInteraction.interactions[0];

    await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({ position: { x: 240, y: 360 } })
      .expect(200);

    const response = await request(httpServer).get(`/api/stories/${story.id}`).expect(200);

    expect(response.body.interactions[0]).toMatchObject({
      id: interaction.id,
      title: interaction.title,
      body: interaction.body,
      position: { x: 240, y: 360 },
    });
  });

  it('serializes concurrent partial updates without losing either field', async () => {
    const story = await createStory();
    const withInteraction = await createInteraction(story.id);
    const interaction = withInteraction.interactions[0];
    const path = `/api/stories/${story.id}/interactions/${interaction.id}`;

    await Promise.all([
      request(httpServer).patch(path).send({ title: 'Concurrent title' }).expect(200),
      request(httpServer).patch(path).send({ body: 'Concurrent content' }).expect(200),
    ]);

    const response = await request(httpServer).get(`/api/stories/${story.id}`).expect(200);
    expect(response.body.interactions[0]).toMatchObject({
      title: 'Concurrent title',
      body: 'Concurrent content',
    });
  });

  it('rejects null interaction titles and positions but normalizes a null body', async () => {
    const story = await createStory();
    const withInteraction = await createInteraction(story.id);
    const interaction = withInteraction.interactions[0];
    const path = `/api/stories/${story.id}/interactions/${interaction.id}`;

    await request(httpServer).patch(path).send({ title: null }).expect(400);
    await request(httpServer).patch(path).send({ position: null }).expect(400);

    const response = await request(httpServer).patch(path).send({ body: null }).expect(200);
    expect((response.body as InteractionMutationResult).interaction).toMatchObject({
      title: interaction.title,
      body: '',
      position: interaction.position,
    });
  });

  it('sanitizes rich interaction content while preserving supported media', async () => {
    const story = await createStory();
    const withInteraction = await createInteraction(story.id);
    const interaction = withInteraction.interactions[0];
    const body =
      '<h2>Arrival</h2><p><strong>Hello</strong></p>' +
      '<img src="https://media.example/scene.gif" onerror="alert(1)">' +
      '<video src="https://media.example/scene.mp4"></video>' +
      '<div data-conditional-text-target="next" onclick="alert(1)">' +
      '<button type="button" contenteditable="false" data-conditional-text-link="next">Next</button>' +
      '<p>Conditional clue</p></div>' +
      '<iframe src="https://www.youtube-nocookie.com/embed/video-1"></iframe>' +
      '<iframe src="https://evil.example/embed"></iframe><script>alert(1)</script>';

    const response = await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({ body })
      .expect(200);
    const sanitized = (response.body as InteractionMutationResult).interaction.body;

    expect(sanitized).toContain('<h2>Arrival</h2>');
    expect(sanitized).toContain('https://media.example/scene.gif');
    expect(sanitized).toContain('https://media.example/scene.mp4');
    expect(sanitized).toContain('data-conditional-text-target="next"');
    expect(sanitized).toContain('data-conditional-text-link="next"');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).toContain('https://www.youtube-nocookie.com/embed/video-1');
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).not.toContain('evil.example');
    expect(sanitized).not.toContain('<script');
  });

  it('rejects unknown interaction patch fields', async () => {
    const story = await createStory();
    const withInteraction = await createInteraction(story.id);
    const interaction = withInteraction.interactions[0];

    await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({ unexpected: true })
      .expect(400);
  });

  it('DELETE /api/stories/:storyId/interactions/:interactionId deletes an interaction and turns orphaned triggers into root triggers', async () => {
    const story = await createStory();
    const withParent = await createInteraction(story.id);
    const parent = withParent.interactions[0];
    const withChild = await createInteraction(story.id, { parentId: parent.id });
    const child = withChild.interactions.find((item) => item.id !== parent.id)!;

    const response = await request(httpServer)
      .delete(`/api/stories/${story.id}/interactions/${parent.id}`)
      .expect(200);

    expect(response.body.interactions).toHaveLength(1);
    expect(response.body.interactions[0].id).toBe(child.id);
    expect(response.body.interactions[0].triggers[0]).toMatchObject({
      inputInteractionIds: [],
      conditions: [],
    });
  });

  it('DELETE /api/stories/:storyId/interactions/:interactionId keeps triggers that still have other inputs', async () => {
    const story = await createStory();
    const withFirstParent = await createInteraction(story.id);
    const firstParent = withFirstParent.interactions[0];
    const withSecondParent = await createInteraction(story.id);
    const secondParent = withSecondParent.interactions.find((item) => item.id !== firstParent.id)!;
    const withChild = await createInteraction(story.id, { parentId: firstParent.id });
    const child = withChild.interactions.find(
      (item) => item.id !== firstParent.id && item.id !== secondParent.id,
    )!;
    const trigger = child.triggers[0];

    await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${child.id}/triggers/${trigger.id}`)
      .send({
        inputInteractionIds: [firstParent.id, secondParent.id],
        conditions: [{ interactionId: firstParent.id, hasBeenVisited: true }],
      })
      .expect(200);

    const response = await request(httpServer)
      .delete(`/api/stories/${story.id}/interactions/${firstParent.id}`)
      .expect(200);

    const updatedChild = (response.body as Story).interactions.find(
      (item) => item.id === child.id,
    )!;
    expect(updatedChild.triggers).toHaveLength(1);
    expect(updatedChild.triggers[0].inputInteractionIds).toEqual([secondParent.id]);
    expect(updatedChild.triggers[0].conditions).toEqual([]);
  });

  it('POST /api/stories/:storyId/interactions/:interactionId/triggers adds a trigger', async () => {
    const story = await createStory();
    const withInteraction = await createInteraction(story.id);
    const interaction = withInteraction.interactions[0];

    const response = await request(httpServer)
      .post(`/api/stories/${story.id}/interactions/${interaction.id}/triggers`)
      .expect(201);

    const result = response.body as TriggerMutationResult;
    expect(result.interactionId).toBe(interaction.id);
    expect(result.trigger).toMatchObject({
      inputInteractionIds: [],
      conditions: [],
    });
  });

  it('PATCH /api/stories/:storyId/interactions/:interactionId/triggers/:triggerId updates a trigger', async () => {
    const story = await createStory();
    const withParent = await createInteraction(story.id);
    const parent = withParent.interactions[0];
    const withChild = await createInteraction(story.id, { parentId: parent.id });
    const child = withChild.interactions.find((item) => item.id !== parent.id)!;
    const trigger = child.triggers[0];

    const response = await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${child.id}/triggers/${trigger.id}`)
      .send({
        inputInteractionIds: [parent.id, parent.id],
        conditions: [{ interactionId: parent.id, hasBeenVisited: true }],
      })
      .expect(200);

    const result = response.body as TriggerMutationResult;
    expect(result.interactionId).toBe(child.id);
    expect(result.trigger.inputInteractionIds).toEqual([parent.id]);
    expect(result.trigger.conditions).toEqual([{ interactionId: parent.id, hasBeenVisited: true }]);
  });

  it('stores several temporal dates, weekdays, and time slots on a trigger', async () => {
    const story = await createStory();
    const graph = await createInteraction(story.id);
    const interaction = graph.interactions[0];
    const trigger = interaction.triggers[0];
    const temporal = {
      dates: ['2026-08-15'],
      dateRanges: [{ startDate: '2026-09-01', endDate: '2026-09-03' }],
      weekdays: ['monday', 'tuesday'],
      timeSlots: [
        { startTime: '09:00', endTime: '12:00' },
        { startTime: '22:00', endTime: '02:00' },
      ],
    };

    const response = await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}/triggers/${trigger.id}`)
      .send({ inputInteractionIds: [], conditions: [{ temporal }] })
      .expect(200);

    expect((response.body as TriggerMutationResult).trigger.conditions).toEqual([{ temporal }]);
    await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}/triggers/${trigger.id}`)
      .send({
        inputInteractionIds: [],
        conditions: [{ temporal: { timeSlots: [{ startTime: '09:00', endTime: '09:00' }] } }],
      })
      .expect(400);
  });

  it('rejects trigger references to interactions from another story', async () => {
    const first = await createStory('First story');
    const firstGraph = await createInteraction(first.id);
    const target = firstGraph.interactions[0];
    const second = await createStory('Second story');
    const secondGraph = await createInteraction(second.id);
    const foreign = secondGraph.interactions[0];

    await request(httpServer)
      .patch(`/api/stories/${first.id}/interactions/${target.id}/triggers/${target.triggers[0].id}`)
      .send({
        inputInteractionIds: [foreign.id],
        conditions: [{ interactionId: foreign.id, hasBeenVisited: true }],
      })
      .expect(400);
  });

  it('creates and updates locations, then assigns one to an interaction', async () => {
    const story = await createStory();
    const withInteraction = await createInteraction(story.id);
    const interaction = withInteraction.interactions[0];

    const created = await request(httpServer)
      .post(`/api/stories/${story.id}/locations`)
      .send({ name: 'Harbor', description: 'A quiet harbor.' })
      .expect(201);
    const location = (created.body as LocationMutationResult).location;

    const updated = await request(httpServer)
      .patch(`/api/stories/${story.id}/locations/${location.id}`)
      .send({ name: 'Old harbor' })
      .expect(200);
    expect((updated.body as LocationMutationResult).location).toMatchObject({
      id: location.id,
      name: 'Old harbor',
      description: 'A quiet harbor.',
    });

    const assigned = await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({ locationId: location.id })
      .expect(200);
    expect((assigned.body as InteractionMutationResult).interaction.locationId).toBe(location.id);
  });

  it('stores optional images for locations, characters, stats, and items', async () => {
    const story = await createStory();
    const resources = [
      {
        path: 'locations',
        create: { name: 'Harbor', imageUrl: 'https://images.example/harbor.png' },
        resultKey: 'location',
      },
      {
        path: 'characters',
        create: { name: 'Mira', imageUrl: 'https://images.example/mira.png' },
        resultKey: 'character',
      },
      {
        path: 'stat-definitions',
        create: { name: 'Trust', imageUrl: 'https://images.example/trust.svg' },
        resultKey: 'statDefinition',
      },
      {
        path: 'item-definitions',
        create: { name: 'Key', imageUrl: 'https://images.example/key.png' },
        resultKey: 'itemDefinition',
      },
    ] as const;

    for (const resource of resources) {
      const created = await request(httpServer)
        .post(`/api/stories/${story.id}/${resource.path}`)
        .send(resource.create)
        .expect(201);
      const entity = created.body[resource.resultKey] as { id: string; imageUrl: string };
      expect(entity.imageUrl).toBe(resource.create.imageUrl);

      const imageUrl = `${resource.create.imageUrl}?version=2`;
      const updated = await request(httpServer)
        .patch(`/api/stories/${story.id}/${resource.path}/${entity.id}`)
        .send({ imageUrl })
        .expect(200);
      expect(updated.body[resource.resultKey].imageUrl).toBe(imageUrl);
    }
  });

  it('validates location references in interactions and trigger conditions', async () => {
    const first = await createStory('First story');
    const firstGraph = await createInteraction(first.id);
    const target = firstGraph.interactions[0];
    const second = await createStory('Second story');
    const foreignLocationResponse = await request(httpServer)
      .post(`/api/stories/${second.id}/locations`)
      .send({ name: 'Foreign place' })
      .expect(201);
    const foreignLocation = (foreignLocationResponse.body as LocationMutationResult).location;

    await request(httpServer)
      .patch(`/api/stories/${first.id}/interactions/${target.id}`)
      .send({ locationId: foreignLocation.id })
      .expect(400);

    await request(httpServer)
      .patch(`/api/stories/${first.id}/interactions/${target.id}/triggers/${target.triggers[0].id}`)
      .send({
        conditions: [{ locationId: foreignLocation.id, isCurrentLocation: true }],
      })
      .expect(400);

    await request(httpServer)
      .patch(`/api/stories/${first.id}/interactions/${target.id}/triggers/${target.triggers[0].id}`)
      .send({
        conditions: [
          {
            interactionId: target.id,
            hasBeenVisited: true,
            locationId: foreignLocation.id,
            isCurrentLocation: true,
          },
        ],
      })
      .expect(400);
  });

  it('creates and updates characters, then assigns several to an interaction', async () => {
    const story = await createStory();
    const withInteraction = await createInteraction(story.id);
    const interaction = withInteraction.interactions[0];

    const created = await request(httpServer)
      .post(`/api/stories/${story.id}/characters`)
      .send({ name: 'Mira', description: 'An investigator.' })
      .expect(201);
    const character = (created.body as CharacterMutationResult).character;

    const updated = await request(httpServer)
      .patch(`/api/stories/${story.id}/characters/${character.id}`)
      .send({ name: 'Mira Vale' })
      .expect(200);
    expect((updated.body as CharacterMutationResult).character).toMatchObject({
      id: character.id,
      name: 'Mira Vale',
      description: 'An investigator.',
    });

    const second = await request(httpServer)
      .post(`/api/stories/${story.id}/characters`)
      .send({ name: 'Luc', isPlayable: true })
      .expect(201);
    expect(second.body.character.isPlayable).toBe(true);
    const selected = await request(httpServer)
      .patch(`/api/stories/${story.id}/characters/${character.id}`)
      .send({ isPlayable: true })
      .expect(200);
    expect(selected.body.character.isPlayable).toBe(true);
    const reloaded = await request(httpServer).get(`/api/stories/${story.id}`).expect(200);
    expect(
      reloaded.body.characters.filter(({ isPlayable }: { isPlayable?: boolean }) => isPlayable),
    ).toEqual([expect.objectContaining({ id: character.id })]);

    const assigned = await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({ characterIds: [character.id, character.id] })
      .expect(200);
    expect((assigned.body as InteractionMutationResult).interaction.characterIds).toEqual([
      character.id,
    ]);
  });

  it('creates and updates character stats, then uses them in effects and conditions', async () => {
    const story = await createStory();
    const graph = await createInteraction(story.id);
    const interaction = graph.interactions[0];
    const characterResponse = await request(httpServer)
      .post(`/api/stories/${story.id}/characters`)
      .send({ name: 'Mira' })
      .expect(201);
    const character = (characterResponse.body as CharacterMutationResult).character;
    const definitionResponse = await request(httpServer)
      .post(`/api/stories/${story.id}/stat-definitions`)
      .send({ name: 'Trust' })
      .expect(201);
    const definition = (definitionResponse.body as StatDefinitionMutationResult).statDefinition;
    const changedDefinition = await request(httpServer)
      .patch(`/api/stories/${story.id}/stat-definitions/${definition.id}`)
      .send({ changePerHour: -1.5 })
      .expect(200);
    expect(
      (changedDefinition.body as StatDefinitionMutationResult).statDefinition.changePerHour,
    ).toBe(-1.5);
    await request(httpServer)
      .patch(`/api/stories/${story.id}/stat-definitions/${definition.id}`)
      .send({ changePerHour: 'fast' })
      .expect(400);

    const created = await request(httpServer)
      .post(`/api/stories/${story.id}/characters/${character.id}/stats`)
      .send({ statDefinitionId: definition.id, initialValue: 2 })
      .expect(201);
    const stat = (created.body as CharacterStatMutationResult).stat;
    expect(stat).toMatchObject({ statDefinitionId: definition.id, initialValue: 2 });

    const updated = await request(httpServer)
      .patch(`/api/stories/${story.id}/characters/${character.id}/stats/${stat.id}`)
      .send({ initialValue: 3 })
      .expect(200);
    expect((updated.body as CharacterStatMutationResult).stat.initialValue).toBe(3);

    const withEffect = await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({ statEffects: [{ statId: stat.id, operation: 'add', value: 1 }] })
      .expect(200);
    expect((withEffect.body as InteractionMutationResult).interaction.statEffects).toEqual([
      { statId: stat.id, operation: 'add', value: 1 },
    ]);

    const conditioned = await request(httpServer)
      .patch(
        `/api/stories/${story.id}/interactions/${interaction.id}/triggers/${interaction.triggers[0].id}`,
      )
      .send({
        inputInteractionIds: [],
        conditions: [{ statId: stat.id, operator: 'gte', value: 4 }],
      })
      .expect(200);
    expect((conditioned.body as TriggerMutationResult).trigger.conditions).toEqual([
      { statId: stat.id, operator: 'gte', value: 4 },
    ]);
  });

  it('creates reusable item definitions and several owned instances of the same item', async () => {
    const story = await createStory();
    const characterResponse = await request(httpServer)
      .post(`/api/stories/${story.id}/characters`)
      .send({ name: 'Mira' })
      .expect(201);
    const character = (characterResponse.body as CharacterMutationResult).character;
    const statDefinitionResponse = await request(httpServer)
      .post(`/api/stories/${story.id}/stat-definitions`)
      .send({ name: 'Durability' })
      .expect(201);
    const statDefinition = (statDefinitionResponse.body as StatDefinitionMutationResult)
      .statDefinition;

    const definitionResponse = await request(httpServer)
      .post(`/api/stories/${story.id}/item-definitions`)
      .send({
        name: 'Key',
        description: 'A brass key.',
        stats: [{ statDefinitionId: statDefinition.id, initialValue: 10 }],
      })
      .expect(201);
    const definition = (definitionResponse.body as ItemDefinitionMutationResult).itemDefinition;
    expect(definition).toMatchObject({
      name: 'Key',
      description: 'A brass key.',
      stats: [{ statDefinitionId: statDefinition.id, initialValue: 10 }],
    });

    const updatedDefinition = await request(httpServer)
      .patch(`/api/stories/${story.id}/item-definitions/${definition.id}`)
      .send({ name: 'Archive key' })
      .expect(200);
    expect((updatedDefinition.body as ItemDefinitionMutationResult).itemDefinition.name).toBe(
      'Archive key',
    );

    const first = await request(httpServer)
      .post(`/api/stories/${story.id}/characters/${character.id}/items`)
      .send({ itemDefinitionId: definition.id })
      .expect(201);
    const second = await request(httpServer)
      .post(`/api/stories/${story.id}/characters/${character.id}/items`)
      .send({ itemDefinitionId: definition.id })
      .expect(201);
    const firstItem = (first.body as CharacterItemMutationResult).item;
    const secondItem = (second.body as CharacterItemMutationResult).item;

    expect(firstItem.itemDefinitionId).toBe(definition.id);
    expect(secondItem.itemDefinitionId).toBe(definition.id);
    expect(secondItem.id).not.toBe(firstItem.id);

    const loaded = await request(httpServer).get(`/api/stories/${story.id}`).expect(200);
    expect((loaded.body as Story).characters?.find(({ id }) => id === character.id)?.items).toEqual(
      [firstItem, secondItem],
    );

    const otherStory = await createStory('Other story');
    const foreignDefinitionResponse = await request(httpServer)
      .post(`/api/stories/${otherStory.id}/item-definitions`)
      .send({ name: 'Foreign key' })
      .expect(201);
    const foreignDefinition = (foreignDefinitionResponse.body as ItemDefinitionMutationResult)
      .itemDefinition;
    await request(httpServer)
      .post(`/api/stories/${story.id}/characters/${character.id}/items`)
      .send({ itemDefinitionId: foreignDefinition.id })
      .expect(404);
  });

  it('validates and stores interaction item stat effects', async () => {
    const story = await createStory();
    const interaction = (await createInteraction(story.id)).interactions[0];
    const character = await request(httpServer)
      .post(`/api/stories/${story.id}/characters`)
      .send({ name: 'Mira' })
      .expect(201);
    const statDefinition = await request(httpServer)
      .post(`/api/stories/${story.id}/stat-definitions`)
      .send({ name: 'Durability' })
      .expect(201);
    const itemDefinition = await request(httpServer)
      .post(`/api/stories/${story.id}/item-definitions`)
      .send({
        name: 'Key',
        stats: [
          {
            statDefinitionId: statDefinition.body.statDefinition.id,
            initialValue: 10,
          },
        ],
      })
      .expect(201);
    const item = await request(httpServer)
      .post(`/api/stories/${story.id}/characters/${character.body.character.id}/items`)
      .send({ itemDefinitionId: itemDefinition.body.itemDefinition.id })
      .expect(201);
    const effect = {
      itemId: item.body.item.id,
      statDefinitionId: statDefinition.body.statDefinition.id,
      operation: 'add',
      value: -2,
    };

    const updated = await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({ itemStatEffects: [effect] })
      .expect(200);
    expect(updated.body.interaction.itemStatEffects).toEqual([effect]);

    await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({ itemStatEffects: [effect, { ...effect, value: 1 }] })
      .expect(400);
    await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({
        itemStatEffects: [{ ...effect, statDefinitionId: 'unassigned-stat-definition' }],
      })
      .expect(400);

    await request(httpServer)
      .patch(`/api/stories/${story.id}/item-definitions/${itemDefinition.body.itemDefinition.id}`)
      .send({ stats: [] })
      .expect(200);
    const loaded = await request(httpServer).get(`/api/stories/${story.id}`).expect(200);
    expect(
      (loaded.body as Story).interactions.find(({ id }) => id === interaction.id)?.itemStatEffects,
    ).toEqual([]);
  });

  it('validates and stores interaction item effects', async () => {
    const story = await createStory();
    const interaction = (await createInteraction(story.id)).interactions[0];
    const character = await request(httpServer)
      .post(`/api/stories/${story.id}/characters`)
      .send({ name: 'Mira' })
      .expect(201);
    const definition = await request(httpServer)
      .post(`/api/stories/${story.id}/item-definitions`)
      .send({ name: 'Key' })
      .expect(201);
    const item = await request(httpServer)
      .post(`/api/stories/${story.id}/characters/${character.body.character.id}/items`)
      .send({ itemDefinitionId: definition.body.itemDefinition.id })
      .expect(201);

    const updated = await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({ itemEffects: [{ itemId: item.body.item.id, operation: 'obtain' }] })
      .expect(200);
    expect(updated.body.interaction.itemEffects).toEqual([
      { itemId: item.body.item.id, operation: 'obtain' },
    ]);

    const reusableUpdated = await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({
        itemEffects: [
          {
            itemDefinitionId: definition.body.itemDefinition.id,
            characterId: character.body.character.id,
            operation: 'obtain',
          },
        ],
      })
      .expect(200);
    expect(reusableUpdated.body.interaction.itemEffects).toEqual([
      {
        itemDefinitionId: definition.body.itemDefinition.id,
        characterId: character.body.character.id,
        operation: 'obtain',
      },
    ]);

    const conditioned = await request(httpServer)
      .patch(
        `/api/stories/${story.id}/interactions/${interaction.id}/triggers/${interaction.triggers[0].id}`,
      )
      .send({
        inputInteractionIds: [],
        conditions: [{ itemDefinitionId: definition.body.itemDefinition.id, isOwned: true }],
      })
      .expect(200);
    expect(conditioned.body.trigger.conditions).toEqual([
      { itemDefinitionId: definition.body.itemDefinition.id, isOwned: true },
    ]);

    await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({
        itemEffects: [
          { itemId: item.body.item.id, operation: 'obtain' },
          { itemId: item.body.item.id, operation: 'lose' },
        ],
      })
      .expect(400);
    await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({ itemEffects: [{ itemId: 'foreign-item', operation: 'obtain' }] })
      .expect(400);
    await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({
        itemEffects: [
          {
            itemId: item.body.item.id,
            itemDefinitionId: definition.body.itemDefinition.id,
            operation: 'obtain',
          },
        ],
      })
      .expect(400);
  });

  it('removes character stats and items with their exact-instance references', async () => {
    const story = await createStory();
    const interaction = (await createInteraction(story.id)).interactions[0];
    const character = await request(httpServer)
      .post(`/api/stories/${story.id}/characters`)
      .send({ name: 'Mira' })
      .expect(201);
    const statDefinition = await request(httpServer)
      .post(`/api/stories/${story.id}/stat-definitions`)
      .send({ name: 'Trust' })
      .expect(201);
    const stat = await request(httpServer)
      .post(`/api/stories/${story.id}/characters/${character.body.character.id}/stats`)
      .send({ statDefinitionId: statDefinition.body.statDefinition.id, initialValue: 2 })
      .expect(201);
    const itemDefinition = await request(httpServer)
      .post(`/api/stories/${story.id}/item-definitions`)
      .send({
        name: 'Key',
        stats: [{ statDefinitionId: statDefinition.body.statDefinition.id, initialValue: 10 }],
      })
      .expect(201);
    const item = await request(httpServer)
      .post(`/api/stories/${story.id}/characters/${character.body.character.id}/items`)
      .send({ itemDefinitionId: itemDefinition.body.itemDefinition.id })
      .expect(201);

    await request(httpServer)
      .patch(`/api/stories/${story.id}/interactions/${interaction.id}`)
      .send({
        statEffects: [{ statId: stat.body.stat.id, operation: 'add', value: 1 }],
        itemEffects: [{ itemId: item.body.item.id, operation: 'obtain' }],
        itemStatEffects: [
          {
            itemId: item.body.item.id,
            statDefinitionId: statDefinition.body.statDefinition.id,
            operation: 'add',
            value: -1,
          },
        ],
      })
      .expect(200);
    await request(httpServer)
      .patch(
        `/api/stories/${story.id}/interactions/${interaction.id}/triggers/${interaction.triggers[0].id}`,
      )
      .send({
        inputInteractionIds: [],
        conditions: [{ statId: stat.body.stat.id, operator: 'gte', value: 2 }],
      })
      .expect(200);

    const withoutStat = await request(httpServer)
      .delete(
        `/api/stories/${story.id}/characters/${character.body.character.id}/stats/${stat.body.stat.id}`,
      )
      .expect(200);
    expect(withoutStat.body.characters[0].stats).toEqual([]);
    expect(withoutStat.body.interactions[0].statEffects).toEqual([]);
    expect(withoutStat.body.interactions[0].triggers[0].conditions).toEqual([]);

    const withoutItem = await request(httpServer)
      .delete(
        `/api/stories/${story.id}/characters/${character.body.character.id}/items/${item.body.item.id}`,
      )
      .expect(200);
    expect(withoutItem.body.characters[0].items).toEqual([]);
    expect(withoutItem.body.interactions[0].itemEffects).toEqual([]);
    expect(withoutItem.body.interactions[0].itemStatEffects).toEqual([]);
  });

  it('rejects foreign stat references and duplicate effects', async () => {
    const first = await createStory('First story');
    const firstGraph = await createInteraction(first.id);
    const target = firstGraph.interactions[0];
    const localCharacterResponse = await request(httpServer)
      .post(`/api/stories/${first.id}/characters`)
      .send({ name: 'Local character' })
      .expect(201);
    const localCharacter = (localCharacterResponse.body as CharacterMutationResult).character;
    const localDefinitionResponse = await request(httpServer)
      .post(`/api/stories/${first.id}/stat-definitions`)
      .send({ name: 'Trust' })
      .expect(201);
    const localDefinition = (localDefinitionResponse.body as StatDefinitionMutationResult)
      .statDefinition;
    const localStatResponse = await request(httpServer)
      .post(`/api/stories/${first.id}/characters/${localCharacter.id}/stats`)
      .send({ statDefinitionId: localDefinition.id, initialValue: 0 })
      .expect(201);
    const localStat = (localStatResponse.body as CharacterStatMutationResult).stat;
    const second = await createStory('Second story');
    const characterResponse = await request(httpServer)
      .post(`/api/stories/${second.id}/characters`)
      .send({ name: 'Mira' })
      .expect(201);
    const character = (characterResponse.body as CharacterMutationResult).character;
    const definitionResponse = await request(httpServer)
      .post(`/api/stories/${second.id}/stat-definitions`)
      .send({ name: 'Trust' })
      .expect(201);
    const definition = (definitionResponse.body as StatDefinitionMutationResult).statDefinition;
    const statResponse = await request(httpServer)
      .post(`/api/stories/${second.id}/characters/${character.id}/stats`)
      .send({ statDefinitionId: definition.id, initialValue: 0 })
      .expect(201);
    const stat = (statResponse.body as CharacterStatMutationResult).stat;

    await request(httpServer)
      .patch(`/api/stories/${first.id}/interactions/${target.id}`)
      .send({ statEffects: [{ statId: stat.id, operation: 'add', value: 1 }] })
      .expect(400);
    await request(httpServer)
      .patch(`/api/stories/${first.id}/interactions/${target.id}`)
      .send({
        statEffects: [
          { statId: localStat.id, operation: 'add', value: 1 },
          { statId: localStat.id, operation: 'set', value: 2 },
        ],
      })
      .expect(400);
  });

  it('rejects character references from another story', async () => {
    const first = await createStory('First story');
    const firstGraph = await createInteraction(first.id);
    const target = firstGraph.interactions[0];
    const second = await createStory('Second story');
    const foreignResponse = await request(httpServer)
      .post(`/api/stories/${second.id}/characters`)
      .send({ name: 'Foreign character' })
      .expect(201);
    const foreign = (foreignResponse.body as CharacterMutationResult).character;

    await request(httpServer)
      .patch(`/api/stories/${first.id}/interactions/${target.id}`)
      .send({ characterIds: [foreign.id] })
      .expect(400);

    await request(httpServer)
      .patch(`/api/stories/${first.id}/interactions/${target.id}/triggers/${target.triggers[0].id}`)
      .send({
        inputInteractionIds: [],
        conditions: [{ characterId: foreign.id, isPresent: true }],
      })
      .expect(400);
  });

  it('DELETE /api/stories/:storyId/interactions/:interactionId/triggers/:triggerId deletes a trigger', async () => {
    const story = await createStory();
    const withInteraction = await createInteraction(story.id);
    const interaction = withInteraction.interactions[0];
    const withSecondTrigger = await request(httpServer)
      .post(`/api/stories/${story.id}/interactions/${interaction.id}/triggers`)
      .expect(201);
    const createdTrigger = (withSecondTrigger.body as TriggerMutationResult).trigger;
    const trigger = interaction.triggers[0];

    const response = await request(httpServer)
      .delete(`/api/stories/${story.id}/interactions/${interaction.id}/triggers/${trigger.id}`)
      .expect(200);

    expect(response.body.interactions[0].triggers).toHaveLength(1);
    expect(response.body.interactions[0].triggers[0].id).toBe(createdTrigger.id);
  });

  it('DELETE /api/stories/:storyId/interactions/:interactionId/triggers/:triggerId turns the last trigger into a root trigger', async () => {
    const story = await createStory();
    const withParent = await createInteraction(story.id);
    const parent = withParent.interactions[0];
    const withInteraction = await createInteraction(story.id, { parentId: parent.id });
    const interaction = (withInteraction as Story).interactions.find(
      (item) => item.id !== parent.id,
    )!;
    const trigger = interaction.triggers[0];

    const response = await request(httpServer)
      .delete(`/api/stories/${story.id}/interactions/${interaction.id}/triggers/${trigger.id}`)
      .expect(200);

    const updatedInteraction = (response.body as Story).interactions.find(
      (item) => item.id === interaction.id,
    )!;
    expect(updatedInteraction.triggers).toEqual([
      { id: trigger.id, inputInteractionIds: [], conditions: [] },
    ]);
  });

  it('returns 404 for unknown story ids', async () => {
    await request(httpServer).get('/api/stories/missing-story').expect(404);
  });

  it('isolates stories between authenticated owners', async () => {
    const created = await request(httpServer)
      .post('/api/stories')
      .set('Cookie', 'paralleax_session=user-one')
      .send({ title: 'Private story' })
      .expect(201);

    const otherList = await request(httpServer)
      .get('/api/stories')
      .set('Cookie', 'paralleax_session=user-two')
      .expect(200);
    expect(otherList.body).toEqual([]);

    await request(httpServer)
      .get(`/api/stories/${created.body.id}`)
      .set('Cookie', 'paralleax_session=user-two')
      .expect(404);
  });
});
