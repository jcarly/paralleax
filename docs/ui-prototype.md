# Paralleax UI prototype

## Status 2026-11-19

The code prototype served as a source of mockups, but it is costly to maintain
and to evolve alongside the product. Decision: replace it with a mockup tool,
then remove the prototype routes, components and styles.

- First, validate a mockup tool on one real design topic (the inspector
  legibility item in the
  [design backlog](code-quality-backlog.md#design-and-clarity-2026-11-19)).
  Static HTML reusing the application's design tokens is tried first; design
  tools whose agent integration limits the number of requests are a poor fit.
- Mockups answer a question and are then discarded or archived in
  `docs/mockups/`; they are never maintained alongside the product.
- Design changes ship directly in the production components, with
  `/design-system` as the living catalogue.
- Until the tool is validated, the prototype below stays available.

The isolated UX prototype includes the authoring flow and its surrounding product screens:

- story library: `http://localhost:5173/prototype/paralleax/stories`
- sign in: `http://localhost:5173/prototype/paralleax/login`
- registration: `http://localhost:5173/prototype/paralleax/register`
- story editor and graph: `http://localhost:5173/prototype/paralleax`
- design system reference: `http://localhost:5173/prototype/paralleax/design-system`

From the repository root, start only the web workspace:

```sh
npm run dev -w @paralleax/web
```

The prototype uses local sample data, does not contact the API, does not require an account, and
does not modify persisted stories. It is intentionally separate from the production editor and
player routes. Authentication and story creation interactions are local demonstrations only.

Useful interactions to try:

- collapse and reopen the left sidebar, then reload the page to verify its persisted state;
- move between sign in, registration, the story library, the editor, and the design system;
- search and filter the local story library, change its layout, and create a temporary story card;
- select graph cards, the intermediate trigger node, or context entities to switch inspectors;
- inspect nested character and item inventory trees;
- open **Simulate**, then enable **Force unavailable options** to test a blocked choice.
