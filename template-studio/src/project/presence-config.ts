// Where the board's presence server lives (party/board.ts).
//
// Empty until the server has been deployed: `npx partykit login`, then `npm run party:deploy` from
// template-studio/, and put the host it prints here, like `scugnizzi-board.switchyards.partykit.dev`.
// With nothing here presence stays off, unless the Canvas menu names a host for this browser, which is how
// `npm run party` on `localhost:1999` is tried out.
export const DEFAULT_PRESENCE_HOST = '';
