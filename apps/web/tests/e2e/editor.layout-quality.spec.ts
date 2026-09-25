import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { StoryGraphPositionUpdates } from '@paralleax/shared';
import { buildTriggerEdges, getTriggerNodeId } from '../../src/storyGraph';
import { createComplexLayoutStoryFixture } from '../../src/test/complexLayoutStoryFixture';
import { analyzeLayoutGeometry } from '../../src/test/layoutGeometry';
import { mockGraphPositionUpdates, prepareEditorPage } from './editorTestHarness';
import {
  pathApproximationTolerance,
  readRenderedLayout,
  renderLayoutSvg,
  summarizeLayout,
} from './layoutQualityArtifacts';

test('audits real routes after organizing a tangled 100-interaction story', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  // A tall viewport lets React Flow mount every node even at its minimum zoom.
  await page.setViewportSize({ width: 2400, height: 4000 });
  const story = createComplexLayoutStoryFixture();
  const triggers = story.interactions.flatMap(({ triggers }) =>
    triggers.filter(({ inputInteractionIds }) => inputInteractionIds.length > 0),
  );
  const expectedNodeCount = story.interactions.length + triggers.length;
  const expectedEdgeCount = triggers.reduce(
    (count, trigger) => count + trigger.inputInteractionIds.length + 1,
    0,
  );
  const connections = buildTriggerEdges(story).map(({ id, source, target }) => ({
    id,
    source,
    target,
  }));
  expect(connections).toHaveLength(expectedEdgeCount);
  await prepareEditorPage(page, story);
  let savedPositions: StoryGraphPositionUpdates | undefined;
  await mockGraphPositionUpdates(page, (updates) => {
    savedPositions = updates;
  });
  await page.goto('/stories/story-1/edit');
  const organize = page.getByRole('button', { name: 'Organize graph', exact: true });
  await expect(organize).toBeEnabled();
  await expect(page.locator('.react-flow__node')).toHaveCount(expectedNodeCount);
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(expectedEdgeCount);
  const before = await readRenderedLayout(page, connections);
  const beforeReport = analyzeLayoutGeometry(before.nodes, before.edges);
  expect(beforeReport.nodeOverlaps.length).toBeGreaterThan(0);

  const startedAt = performance.now();
  await organize.click();
  await expect.poll(() => savedPositions).toBeDefined();
  // Explicitly fit the saved result so visibility culling cannot hide defects.
  await page.locator('.react-flow__controls-fitview').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(expectedNodeCount);
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(expectedEdgeCount);
  // Wait for fitView and all measured bounds/routes to settle, not an arbitrary delay.
  let previousGeometry = '';
  await expect
    .poll(async () => {
      const current = JSON.stringify(await readRenderedLayout(page, connections));
      const unchanged = current === previousGeometry;
      previousGeometry = current;
      return unchanged;
    })
    .toBe(true);
  const after = await readRenderedLayout(page, connections);
  const durationMs = Math.round(performance.now() - startedAt);
  expect(after.nodes.map(({ id }) => id).sort()).toEqual(before.nodes.map(({ id }) => id).sort());
  expect(after.edges.map(({ id }) => id).sort()).toEqual(connections.map(({ id }) => id).sort());
  const originalNodes = new Map(before.nodes.map((node) => [node.id, node]));
  for (const node of after.nodes) {
    expect([node.x, node.y, node.width, node.height].every(Number.isFinite)).toBe(true);
    expect(node.width).toBeGreaterThan(0);
    expect(node.height).toBeGreaterThan(0);
    const original = originalNodes.get(node.id)!;
    expect(Math.abs(node.width - original.width), `${node.id}: width is preserved`).toBeLessThan(
      0.25,
    );
    expect(Math.abs(node.height - original.height), `${node.id}: height is preserved`).toBeLessThan(
      0.25,
    );
  }
  for (const edge of after.edges) {
    expect(edge.points.length).toBeGreaterThan(1);
    expect(edge.points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  }
  expect(savedPositions!.interactionUpdates.length).toBeGreaterThan(0);
  const appliedNodes = new Map(after.nodes.map((node) => [node.id, node]));
  const updates = [
    ...savedPositions!.interactionUpdates.map(({ interactionId, position }) => ({
      id: interactionId,
      position,
    })),
    ...savedPositions!.triggerUpdates.flatMap(({ interactionId, triggerIds, position }) =>
      triggerIds.map((triggerId) => ({
        id: getTriggerNodeId(interactionId, triggerId),
        position,
      })),
    ),
  ];
  for (const { id, position } of updates) {
    const applied = appliedNodes.get(id)!;
    expect(applied, `Saved node ${id} must be rendered`).toBeDefined();
    expect(Math.abs(applied.x - position.x), `${id}: saved x is applied`).toBeLessThan(0.25);
    expect(Math.abs(applied.y - position.y), `${id}: saved y is applied`).toBeLessThan(0.25);
  }
  expect(
    updates.some(({ id, position }) => {
      const original = originalNodes.get(id)!;
      return Math.hypot(original.x - position.x, original.y - position.y) > 1;
    }),
  ).toBe(true);
  const afterReport = analyzeLayoutGeometry(after.nodes, after.edges);
  const summary = {
    interactions: story.interactions.length,
    triggers: triggers.length,
    edges: expectedEdgeCount,
    durationMs,
    pathApproximationTolerance,
    before: summarizeLayout(beforeReport),
    after: summarizeLayout(afterReport),
  };
  console.info(`STORY_LAYOUT_QUALITY ${JSON.stringify(summary)}`);
  const attach = async (name: string, body: string, contentType: string) => {
    const path = testInfo.outputPath(name);
    await writeFile(path, body);
    await testInfo.attach(name, { path, contentType });
  };
  await attach(
    'layout-quality.json',
    JSON.stringify({ summary, before: beforeReport, after: afterReport }, null, 2),
    'application/json',
  );
  await attach(
    'layout-story.json',
    JSON.stringify({ story, savedPositions }, null, 2),
    'application/json',
  );
  for (const [name, layout, report] of [
    ['before', before, beforeReport],
    ['after', after, afterReport],
  ] as const) {
    await attach(
      `layout-${name}.svg`,
      renderLayoutSvg(layout, report, `Layout ${name}`),
      'image/svg+xml',
    );
    await attach(`layout-${name}-geometry.json`, JSON.stringify(layout), 'application/json');
  }

  // Only the quality assertion is a known failure. Loading, completeness, saves,
  // and artifact generation above must still pass. An unexpected success asks us
  // to remove this annotation when an improved engine meets the target.
  test.fail(
    process.env.PARALLEAX_LAYOUT_STRICT !== '1',
    'Known routing defects; inspect the geometry report before adopting a new layout engine.',
  );
  expect(summary.after).toEqual({
    nodeOverlaps: 0,
    edgeNodeIntersections: 0,
    edgeCrossings: 0,
    edgeOverlaps: 0,
  });
});
