import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { updateStoryGraphPositions, type StoryGraphPositionUpdates } from '@paralleax/shared';
import { buildTriggerEdges, getTriggerNodeId } from '../../src/storyGraph';
import {
  complexLayoutStoryMotifs,
  createComplexLayoutStoryFixture,
} from '../../src/test/complexLayoutStoryFixture';
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
  const after = await readSettledLayout(page, connections);
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
  const twoInteractionCycles = complexLayoutStoryMotifs.twoInteractionCycles.map(
    ([first, second]) => {
      const interactionIds = [first!, second!];
      const nodeIds = new Set(interactionIds);
      for (const interaction of story.interactions.filter(({ id }) => nodeIds.has(id))) {
        for (const trigger of interaction.triggers) {
          if (trigger.inputInteractionIds.some((id) => interactionIds.includes(id))) {
            nodeIds.add(getTriggerNodeId(interaction.id, trigger.id));
          }
        }
      }
      const edgeIds = connections
        .filter(({ source, target }) => nodeIds.has(source) && nodeIds.has(target))
        .map(({ id }) => id);
      expect(
        edgeIds,
        `${first} <-> ${second}: both Trigger input/output routes are present`,
      ).toHaveLength(4);
      return {
        interactionIds,
        edgeIds,
        edgeNodeIntersections: afterReport.edgeNodeIntersections.filter(
          ({ edgeId, nodeId }) => edgeIds.includes(edgeId) && interactionIds.includes(nodeId),
        ),
      };
    },
  );
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
  await attach(
    'layout-two-interaction-cycles.json',
    JSON.stringify(twoInteractionCycles, null, 2),
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

  // This focused safety check is blocking, independently of the global crossing target.
  for (const cycle of twoInteractionCycles) {
    expect(
      cycle.edgeNodeIntersections,
      `Cycle ${cycle.interactionIds.join(' <-> ')} must not cross either interaction`,
    ).toEqual([]);
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

test('audits top-input routes in a two-interaction cycle after organization and reload', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1400 });
  // Reuse the same cycle as the stress story, isolated from unrelated branches.
  let story = createComplexLayoutStoryFixture();
  const interactionIds = complexLayoutStoryMotifs.twoInteractionCycles[0]!.slice(0, 2);
  story.interactions = story.interactions.filter(({ id }) => interactionIds.includes(id));
  story.interactions.forEach((interaction, index) => {
    interaction.position = { x: 100, y: 80 + index * 500 };
    for (const trigger of interaction.triggers) delete trigger.position;
  });
  const connections = buildTriggerEdges(story).map(({ id, source, target }) => ({
    id,
    source,
    target,
  }));
  expect(connections).toHaveLength(4);
  await prepareEditorPage(page, () => story);
  let savedPositions: StoryGraphPositionUpdates | undefined;
  await mockGraphPositionUpdates(page, (updates) => {
    savedPositions = updates;
    // All reload projections must return the positions that were actually saved.
    story = { ...updateStoryGraphPositions(story, updates), revision: 2 };
  });
  await page.goto('/stories/story-1/edit');
  const organize = page.getByRole('button', { name: 'Organize graph', exact: true });
  await expect(organize).toBeEnabled();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(4);
  await organize.click();
  await expect.poll(() => savedPositions).toBeDefined();
  await page.locator('.react-flow__controls-fitview').click();
  const organized = await readSettledLayout(page, connections);

  await page.reload();
  await expect(organize).toBeEnabled();
  await page.locator('.react-flow__controls-fitview').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(4);
  const reloaded = await readSettledLayout(page, connections);
  const expectedNodeIds = [
    ...new Set(connections.flatMap(({ source, target }) => [source, target])),
  ].sort();
  for (const layout of [organized, reloaded]) {
    expect(layout.nodes.map(({ id }) => id).sort()).toEqual(expectedNodeIds);
    expect(layout.edges.map(({ id }) => id).sort()).toEqual(connections.map(({ id }) => id).sort());
    for (const interaction of story.interactions) {
      const node = layout.nodes.find(({ id }) => id === interaction.id)!;
      expect(Math.abs(node.x - interaction.position.x)).toBeLessThan(0.25);
      expect(Math.abs(node.y - interaction.position.y)).toBeLessThan(0.25);
    }
  }
  // The regression concerns rerouting the same saved geometry, including Trigger markers.
  for (const node of reloaded.nodes) {
    const original = organized.nodes.find(({ id }) => id === node.id)!;
    for (const coordinate of ['x', 'y', 'width', 'height'] as const) {
      expect(
        Math.abs(node[coordinate] - original[coordinate]),
        `${node.id}: reload preserves ${coordinate}`,
      ).toBeLessThan(0.25);
    }
  }
  const reports = [];
  for (const [phase, layout] of [
    ['organized', organized],
    ['reloaded', reloaded],
  ] as const) {
    const report = analyzeLayoutGeometry(layout.nodes, layout.edges);
    const interactionIntersections = report.edgeNodeIntersections.filter(({ nodeId }) =>
      interactionIds.includes(nodeId),
    );
    reports.push({ phase, ...summarizeLayout(report), interactionIntersections });
    for (const [name, body, contentType] of [
      [
        `cycle-${phase}.json`,
        JSON.stringify({ story, layout, report }, null, 2),
        'application/json',
      ],
      [
        `cycle-${phase}.svg`,
        renderLayoutSvg(layout, report, `Two-interaction cycle: ${phase}`),
        'image/svg+xml',
      ],
    ] as const) {
      const path = testInfo.outputPath(name);
      await writeFile(path, body);
      await testInfo.attach(name, { path, contentType });
    }
  }
  console.info(`TWO_INTERACTION_CYCLE_QUALITY ${JSON.stringify(reports)}`);
  // Intentionally red until fallback routing after reload avoids both cards.
  // Keep this separate from the stress test's expected global crossing failure.
  for (const report of reports) {
    expect(
      report.interactionIntersections,
      `${report.phase}: cycle routes must not cross either interaction, including their source and target`,
    ).toEqual([]);
  }
});

async function readSettledLayout(
  page: Page,
  connections: Parameters<typeof readRenderedLayout>[1],
) {
  // Wait for measured bounds/routes and fitView to settle, without an arbitrary delay.
  let previousGeometry = '';
  await expect
    .poll(async () => {
      const current = JSON.stringify(await readRenderedLayout(page, connections));
      const unchanged = current === previousGeometry;
      previousGeometry = current;
      return unchanged;
    })
    .toBe(true);
  return readRenderedLayout(page, connections);
}
