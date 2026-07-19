# React Best Practices

This page adapts the Vercel React performance guidance to Paralleax's React,
Vite, and React Flow architecture. It is a prioritization guide, not a mandate to
apply every optimization preemptively.

Primary reference: [Vercel React Best Practices](https://vercel.com/blog/introducing-react-best-practices)
and its [rule catalog](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices).

## Optimization Order

Review performance in this order:

1. Remove avoidable network waterfalls.
2. Reduce the initial JavaScript bundle and defer heavy route-only code.
3. Fix client fetching duplication or unnecessary global subscriptions.
4. Measure React and React Flow rerenders with the React Profiler.
5. Optimize rendering or JavaScript loops only after a measured bottleneck.

Do not justify `useMemo`, `useCallback`, `React.memo`, caching, or a new state
library only as a general best practice. Each should protect a demonstrated
identity boundary, expensive computation, or frequently rerendered subtree.

## Paralleax Rules

### Avoid Network Waterfalls

- Run independent requests concurrently with `Promise.all`.
- Keep dependent operations sequential when the second operation genuinely
  requires the first result.
- When a common editor action requires several dependent HTTP calls, prefer one
  atomic API command over client-side orchestration. Creating a trigger and then
  assigning its inputs is the current candidate to review.
- Preserve optimistic updates and stale-response protection when consolidating
  commands.

### Control Bundle Size

- Lazy-load route-only pages with literal `import()` paths. `StoryEditor` and its
  React Flow dependency are the first candidates because they are not required
  on sign-in or the story list.
- Use a small `Suspense` fallback that preserves the application shell.
- Consider preloading the editor chunk on an explicit edit-link hover or focus
  only after route splitting is measured.
- Avoid broad application barrel files. Import project features from their
  owning module. Before deep-importing a third-party package, verify that Vite
  cannot already tree-shake it and that the subpath publishes TypeScript types.

### Keep State Ownership Clear

- Derive simple values during render rather than copying them into effects and
  state.
- Use functional state updates whenever the next story depends on the current
  story, especially after asynchronous API responses.
- Keep transient gesture data that should not render the UI in refs.
- Keep interaction logic in event handlers rather than effects.
- Effects should synchronize with external systems, subscriptions, or React
  Flow state; they should not become a general state-transition mechanism.

The editor currently projects a domain `Story` into React Flow nodes and edges.
Because React Flow also owns transient drag state, changes to the
`story -> projected nodes -> React Flow nodes` synchronization require a focused
design and regression tests. Do not remove or duplicate that boundary as a
generic rerender optimization.

### Protect React Flow Rendering

- Keep `nodeTypes`, `edgeTypes`, and other static object props at module scope.
- Keep graph callbacks stable when their identity affects React Flow children,
  while avoiding callbacks whose dependency on the entire story defeats the
  intended stability.
- Build lookup maps when the same large interaction collection is searched
  repeatedly during one projection. Do this only when profiling or representative
  large-story fixtures show a meaningful cost.
- Split memoized projections by their real dependencies: interaction nodes,
  trigger nodes, and edges should not recompute for unrelated UI state where the
  domain boundary permits it.
- Use transitions or deferred values only for non-urgent derived UI such as
  future search, filtering, or whole-graph analysis. Direct typing, dragging,
  selection, and save acknowledgement remain urgent.

## Measurement and Verification

Before an optimization, record the affected scenario and at least one relevant
signal:

- Vite production chunk sizes for bundle work;
- browser network waterfall for request work;
- React Profiler commit counts and duration for rerender work;
- a representative large-story fixture for graph projection work;
- interaction latency for typing, dragging, opening inspectors, and switching
  between list, editor, and reader.

After the change, run the normal frontend unit tests and build. Run Playwright
when routing, loading fallbacks, editor gestures, or save flows change. Keep the
optimization only when the result improves the measured signal without weakening
story semantics or regression coverage.

### Current Bundle Baseline

Measured with the Vite production build on 2026-07-19:

- before route splitting: one `444.06 kB` JavaScript chunk (`142.60 kB` gzip);
- after route splitting: `241.65 kB` of initial JavaScript across the application
  and shared chunks, with `StoryEditor` deferred as `198.69 kB` (`64.45 kB` gzip)
  and `StoryPlayer` deferred as `4.28 kB` (`1.69 kB` gzip);
- editor and reader chunks preload on story-list link hover or keyboard focus.

Use these figures only as a comparison point for the current dependency graph;
future build hashes and exact sizes will change.

## Guidance Not Adopted

The following parts of the upstream catalog do not currently apply:

- Next.js Server Components, Server Actions, hydration, and server rendering;
- Next.js-specific import optimization and dynamic loading APIs;
- cross-request React caches;
- speculative cache, state-management, or rendering libraries without a
  measured Paralleax requirement.

Revisit these exclusions only if the web runtime changes or a measured product
need justifies them.
