import type { Position, Story } from '@paralleax/shared';
import {
  getLinkedTriggerGroups,
  getTriggerNodeId,
  interactionNodeHeight,
  interactionNodeWidth,
} from './storyGraph';
import type {
  StoryGraphLayoutOptions,
  StoryGraphLayoutResult,
} from './storyGraphLayout';

const triggerNodeSize = 20;

// Ton algo actuel réserve 80 px horizontalement à un trigger,
// même si le marqueur visible ne fait que 20 px.
const triggerLayoutWidth = 80;

interface ElkLayoutVertex {
  key: string;
  nodeId: string;
  kind: 'interaction' | 'trigger';

  interactionId: string;
  triggerIds?: string[];

  width: number;
  height: number;

  // Dimensions transmises à ELK.
  layoutWidth: number;
  layoutHeight: number;
}

async function createElk() {
  // Import dynamique volontaire : voir remarque bundle plus bas.
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  return new ELK();
}

let elkPromise: ReturnType<typeof createElk> | undefined;

function getElk() {
  elkPromise ??= createElk();
  return elkPromise;
}

export async function computeStoryGraphElkLayout(
  story: Story,
  options: StoryGraphLayoutOptions = {},
): Promise<StoryGraphLayoutResult> {
  if (story.interactions.length === 0) {
    return {
      interactionUpdates: [],
      triggerUpdates: [],
      affectedNodeIds: [],
    };
  }

  const vertices: ElkLayoutVertex[] = [];
  const edges: Array<{
    id: string;
    sources: string[];
    targets: string[];
  }> = [];

  const knownInteractionIds = new Set(
    story.interactions.map(({ id }) => id),
  );

  for (const interaction of story.interactions) {
    const measured = options.interactionSizes?.get(interaction.id);

    const width =
      measured?.width && measured.width > 0
        ? Math.ceil(measured.width)
        : interactionNodeWidth;

    const height =
      measured?.height && measured.height > 0
        ? Math.ceil(measured.height)
        : interactionNodeHeight;

    vertices.push({
      key: interactionKey(interaction.id),
      nodeId: interaction.id,
      kind: 'interaction',
      interactionId: interaction.id,
      width,
      height,
      layoutWidth: width,
      layoutHeight: height,
    });
  }

  for (const target of story.interactions) {
    for (const group of getLinkedTriggerGroups(target)) {
      const triggerKey = getTriggerKey(
        target.id,
        group.primaryTrigger.id,
      );

      vertices.push({
        key: triggerKey,
        nodeId: getTriggerNodeId(
          target.id,
          group.primaryTrigger.id,
        ),
        kind: 'trigger',
        interactionId: target.id,
        triggerIds: group.triggers.map(({ id }) => id),
        width: triggerNodeSize,
        height: triggerNodeSize,
        layoutWidth: triggerLayoutWidth,
        layoutHeight: triggerNodeSize,
      });

      for (const inputId of group.inputInteractionIds) {
        if (!knownInteractionIds.has(inputId)) continue;

        edges.push({
          id: `layout:${inputId}:${triggerKey}`,
          sources: [interactionKey(inputId)],
          targets: [triggerKey],
        });
      }

      edges.push({
        id: `layout:${triggerKey}:${target.id}`,
        sources: [triggerKey],
        targets: [interactionKey(target.id)],
      });
    }
  }

  const elk = await getElk();

  const result = await elk.layout({
    id: 'root',

    layoutOptions: {
      'elk.algorithm': 'layered',

      // IMPORTANT : ton interface actuelle est verticale.
      'elk.direction': 'DOWN',

      // Équivalents approximatifs de tes constantes actuelles.
      'elk.spacing.nodeNode': '140',
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',

      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': '260',

      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.nodePlacement.favorStraightEdges': 'true',
    },

    children: vertices.map((vertex) => ({
      id: vertex.key,
      width: vertex.layoutWidth,
      height: vertex.layoutHeight,
    })),

    edges,
  });

  const elkPositions = new Map<string, Position>();

  for (const child of result.children ?? []) {
    if (
      typeof child.x !== 'number' ||
      typeof child.y !== 'number'
    ) {
      continue;
    }

    const vertex = vertices.find(({ key }) => key === child.id);
    if (!vertex) continue;

    // Le trigger réserve 80px à ELK mais le marqueur réel
    // mesure 20px : on le recentre dans cette zone.
    const triggerOffset =
      vertex.kind === 'trigger'
        ? (triggerLayoutWidth - triggerNodeSize) / 2
        : 0;

    elkPositions.set(vertex.key, {
      x: child.x + triggerOffset,
      y: child.y,
    });
  }

  // L'ancien layout conserve globalement l'origine du graphe.
  // On reproduit ce comportement pour éviter que "Organize"
  // fasse sauter tout le scénario vers (0, 0).
  const interactionVertices = vertices.filter(
    (vertex) => vertex.kind === 'interaction',
  );

  const layoutInteractionPositions = interactionVertices.flatMap(
    (vertex) => {
      const position = elkPositions.get(vertex.key);
      return position ? [position] : [];
    },
  );

  if (layoutInteractionPositions.length === 0) {
    return {
      interactionUpdates: [],
      triggerUpdates: [],
      affectedNodeIds: [],
    };
  }

  const currentOrigin = {
    x: Math.min(
      ...story.interactions.map(({ position }) => position.x),
    ),
    y: Math.min(
      ...story.interactions.map(({ position }) => position.y),
    ),
  };

  const elkOrigin = {
    x: Math.min(
      ...layoutInteractionPositions.map(({ x }) => x),
    ),
    y: Math.min(
      ...layoutInteractionPositions.map(({ y }) => y),
    ),
  };

  const offset = {
    x: currentOrigin.x - elkOrigin.x,
    y: currentOrigin.y - elkOrigin.y,
  };

  const positions = new Map(
    [...elkPositions].map(([key, position]) => [
      key,
      {
        x: Math.round(position.x + offset.x),
        y: Math.round(position.y + offset.y),
      },
    ]),
  );

  const interactionUpdates =
    interactionVertices.flatMap((vertex) => {
      const position = positions.get(vertex.key);
      const interaction = story.interactions.find(
        ({ id }) => id === vertex.interactionId,
      );

      if (
        !position ||
        !interaction ||
        positionsEqual(position, interaction.position)
      ) {
        return [];
      }

      return [
        {
          interactionId: vertex.interactionId,
          position,
        },
      ];
    });

  const interactionById = new Map(
    story.interactions.map((interaction) => [
      interaction.id,
      interaction,
    ]),
  );

  const triggerUpdates = vertices.flatMap((vertex) => {
    if (vertex.kind !== 'trigger' || !vertex.triggerIds) {
      return [];
    }

    const position = positions.get(vertex.key);
    if (!position) return [];

    const owner = interactionById.get(vertex.interactionId);

    const changed = vertex.triggerIds.some((triggerId) => {
      const saved = owner?.triggers.find(
        ({ id }) => id === triggerId,
      )?.position;

      return !saved || !positionsEqual(saved, position);
    });

    if (!changed) return [];

    return [
      {
        interactionId: vertex.interactionId,
        triggerIds: vertex.triggerIds,
        position,
      },
    ];
  });

  return {
    interactionUpdates,
    triggerUpdates,
    affectedNodeIds: vertices.map(({ nodeId }) => nodeId),
  };
}

function interactionKey(interactionId: string) {
  return `interaction:${interactionId}`;
}

function getTriggerKey(
  interactionId: string,
  triggerId: string,
) {
  return `trigger:${interactionId}:${triggerId}`;
}

function positionsEqual(
  left: Position,
  right: Position,
) {
  return left.x === right.x && left.y === right.y;
}