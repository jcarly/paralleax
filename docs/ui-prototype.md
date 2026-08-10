# Paralleax UI prototype

The isolated UX prototype is available at:

`http://localhost:5173/prototype/paralleax`

From the repository root, start only the web workspace:

```sh
npm run dev -w @paralleax/web
```

The prototype uses local sample data, does not require the API or an account, and does not modify stories. It is intentionally separate from the production editor and player routes.

Useful interactions to try:

- collapse and reopen the left sidebar, then reload the page to verify its persisted state;
- select graph cards, the intermediate trigger node, or context entities to switch inspectors;
- inspect nested character and item inventory trees;
- open **Simulate**, then enable **Force unavailable options** to test a blocked choice.
