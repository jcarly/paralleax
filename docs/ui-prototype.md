# Paralleax UI prototype

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
