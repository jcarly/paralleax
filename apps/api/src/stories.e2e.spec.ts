import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import type { Story } from '@paralleax/shared';
import { AppModule } from './app.module';
import { DatabaseMigrator } from './database.migrator';
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
    const response = await request(httpServer)
      .post(`/api/stories/${storyId}/interactions`)
      .send(input)
      .expect(201);

    return response.body as Story;
  }

  it('GET /api/stories lists stories', async () => {
    const response = await request(httpServer).get('/api/stories').expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toHaveProperty('id');
    expect(response.body[0]).toHaveProperty('interactions');
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

  it('DELETE /api/stories/:storyId deletes a story', async () => {
    const story = await createStory('Story to delete');

    await request(httpServer).delete(`/api/stories/${story.id}`).expect(204);

    await request(httpServer).get(`/api/stories/${story.id}`).expect(404);
  });

  it('POST /api/stories/:storyId/interactions creates a root interaction', async () => {
    const story = await createStory();

    const response = await request(httpServer)
      .post(`/api/stories/${story.id}/interactions`)
      .send({ position: { x: 10, y: 20 } })
      .expect(201);

    expect(response.body.interactions).toHaveLength(1);
    expect(response.body.interactions[0]).toMatchObject({
      title: 'New interaction',
      position: { x: 10, y: 20 },
    });
    expect(response.body.interactions[0].triggers[0].inputInteractionIds).toEqual([]);
  });

  it('POST /api/stories/:storyId/interactions creates a child interaction linked to its parent', async () => {
    const story = await createStory();
    const withRoot = await createInteraction(story.id);
    const parent = withRoot.interactions[0];

    const response = await request(httpServer)
      .post(`/api/stories/${story.id}/interactions`)
      .send({ parentId: parent.id, position: { x: 100, y: 120 } })
      .expect(201);

    const child = (response.body as Story).interactions.find((item) => item.id !== parent.id);
    expect(child).toBeDefined();
    expect(child?.triggers[0].inputInteractionIds).toEqual([parent.id]);
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
      })
      .expect(200);

    expect(response.body.interactions[0]).toMatchObject({
      id: interaction.id,
      title: 'Renamed interaction',
      body: 'New content',
      position: { x: 42, y: 84 },
    });
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
    expect(response.body.interactions[0]).toMatchObject({
      title: interaction.title,
      body: '',
      position: interaction.position,
    });
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

    expect(response.body.interactions[0].triggers).toHaveLength(2);
    expect(response.body.interactions[0].triggers[1]).toMatchObject({
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

    const updatedChild = (response.body as Story).interactions.find(
      (item) => item.id === child.id,
    )!;
    expect(updatedChild.triggers[0].inputInteractionIds).toEqual([parent.id]);
    expect(updatedChild.triggers[0].conditions).toEqual([
      { interactionId: parent.id, hasBeenVisited: true },
    ]);
  });

  it('DELETE /api/stories/:storyId/interactions/:interactionId/triggers/:triggerId deletes a trigger', async () => {
    const story = await createStory();
    const withInteraction = await createInteraction(story.id);
    const interaction = withInteraction.interactions[0];
    const withSecondTrigger = await request(httpServer)
      .post(`/api/stories/${story.id}/interactions/${interaction.id}/triggers`)
      .expect(201);
    const updatedInteraction = (withSecondTrigger.body as Story).interactions[0];
    const trigger = updatedInteraction.triggers[0];

    const response = await request(httpServer)
      .delete(`/api/stories/${story.id}/interactions/${interaction.id}/triggers/${trigger.id}`)
      .expect(200);

    expect(response.body.interactions[0].triggers).toHaveLength(1);
    expect(response.body.interactions[0].triggers[0].id).not.toBe(trigger.id);
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
});
