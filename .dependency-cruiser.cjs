module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment:
        'New circular dependencies make module ownership and initialization order harder to reason about.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'web-not-api',
      comment: 'The web application must call the API over HTTP.',
      severity: 'error',
      from: { path: '^apps/web/src/' },
      to: { path: '^apps/api/src/' },
    },
    {
      name: 'api-not-web',
      comment: 'The API must not depend on frontend implementations.',
      severity: 'error',
      from: { path: '^apps/api/src/' },
      to: { path: '^apps/web/src/' },
    },
    {
      name: 'shared-public-facade',
      comment: 'Application workspaces must consume the public @paralleax/shared facade.',
      severity: 'error',
      from: { path: '^apps/(web|api)/src/' },
      to: { path: '^packages/shared/src/(?!index\\.ts$)' },
    },
    {
      name: 'controllers-not-persistence',
      comment:
        'Controllers call application services; persistence stays behind the application boundary.',
      severity: 'error',
      from: { path: '^apps/api/src/[^/]+/[^/]+\\.controller\\.ts$' },
      to: {
        path: '^apps/api/src/(?:[^/]+/persistence/|[^/]+/[^/]+\\.repository\\.ts$|database/)',
      },
    },
    {
      name: 'react-flow-only-in-graph',
      comment:
        'React Flow belongs to the graph projection and explicit graph presentation modules.',
      severity: 'error',
      from: {
        path: '^apps/web/src/',
        pathNot:
          '^apps/web/src/(?:pages/(?:ParalleaxPrototype|StoryEditor)\\.tsx|components/(?:InteractionNode|TriggerNode|TriggerEdge)\\.tsx|storyGraph\\.ts|storyConnection\\.ts|features/(?:comments/CommentPinNode|graph-decorations/GraphDecorationNode)\\.tsx|features/story-editor/(?:graph/|navigation/useStoryContextNavigation\\.ts|selection/useStoryEditorSelection\\.ts|persistence/storyGraphPersistence\\.ts)|(?:test/|.*\\.(?:test|spec)\\.tsx?$))',
      },
      to: { path: '^node_modules/@xyflow/react/' },
    },
  ],
  options: {
    combinedDependencies: true,
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'apps/web/tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
