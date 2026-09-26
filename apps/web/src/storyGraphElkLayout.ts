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
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';

const triggerNodeSize = 20;

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
  const edges: ElkExtendedEdge[] = [];

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

      const triggerNodeId = getTriggerNodeId(
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
        layoutWidth: triggerNodeSize,
        layoutHeight: triggerNodeSize,
      });

      for (const inputId of group.inputInteractionIds) {
        if (!knownInteractionIds.has(inputId)) continue;

        edges.push({
          id: `${triggerNodeId}-${inputId}`,
          sources: [`${interactionKey(inputId)}:output`],
          targets: [triggerKey],
        });
      }

      edges.push({
        id: `${triggerNodeId}-output`,
        sources: [triggerKey],
        targets: [`${interactionKey(target.id)}:input`],
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

      'elk.edgeRouting': 'ORTHOGONAL',


      // Équivalents approximatifs de tes constantes actuelles.
      'elk.spacing.nodeNode': '140',
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',

      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': '260',

      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.nodePlacement.favorStraightEdges': 'true',
    },

    children: vertices.map((vertex): ElkNode => {
      const width = vertex.layoutWidth;
      const height = vertex.layoutHeight;

      const node: ElkNode = {
        id: vertex.key,
        width,
        height,
      };

      if (vertex.kind === 'interaction') {
        node.layoutOptions = {
          'elk.portConstraints': 'FIXED_POS',
        };

        node.ports = [
          {
            id: `${vertex.key}:input`,
            x: width / 2,
            y: 0,
            width: 0,
            height: 0,
            layoutOptions: {
              'elk.port.side': 'NORTH',
            },
          },
          {
            id: `${vertex.key}:output`,
            x: width / 2,
            y: height,
            width: 0,
            height: 0,
            layoutOptions: {
              'elk.port.side': 'SOUTH',
            },
          },
        ];
      }

      return node;
    }),

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

    elkPositions.set(vertex.key, {
      x: child.x,
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

  const edgeRoutes = new Map<
    string,
    readonly { x: number; y: number }[]
  >();

  for (const edge of result.edges ?? []) {
    const section = edge.sections?.[0];

    if (
      !section?.startPoint ||
      !section.endPoint
    ) {
      continue;
    }

    const points = [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ].map((point) => ({
      x: Math.round(point.x + offset.x),
      y: Math.round(point.y + offset.y),
    }));

    if (points.length >= 2) {
      edgeRoutes.set(edge.id, points);
    }
  }

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
    edgeRoutes,
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