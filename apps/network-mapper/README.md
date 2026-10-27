# Network Map — personal network mapping simulator

An interactive map of your personal and professional connections, with **you at the centre**. Add as many people as you like, connect anyone to anyone, track each person's annual CTC, and watch connection levels and analytics update live. Everything is saved automatically in your browser. There's no account, backend or API key.

## Run it

```bash
cd apps/network-mapper
bun install
bun run dev        # http://localhost:5173
```

Production build: `bun run build`, then `bun run preview` (or host the static `dist/` folder anywhere).

| Command                             | What it does                                                     |
| ----------------------------------- | ---------------------------------------------------------------- |
| `bun run dev`                       | Vite dev server                                                  |
| `bun run build`                     | Type-check + production build into `dist/`                       |
| `bun run typecheck`                 | TypeScript only                                                  |
| `bun run test`                      | Unit tests (graph model, analytics, import/export, IndexedDB)    |
| `bun run build && bun run test:e2e` | Browser acceptance run (needs Playwright + Chromium) — see below |

## Publishing as a claude.ai Artifact

`bun run build:artifact` packs the app into one self-contained page, `dist-artifact/network-map.html`, for publishing as a claude.ai Artifact with the `db`, `user` and `downloads` capabilities. In that frame the app saves to the viewer's private Artifact storage (readable only by that viewer, on any device they sign in from) instead of IndexedDB, and exports go through the viewer's save dialog. Run anywhere else, it keeps using IndexedDB and plain downloads.

## Using it

- **Add a person**: use the _People_ tab on the left. Only the name is required. The CTC is optional and is entered in **LPA** by default (switch the unit to Cr or ₹). "Connect to" starts as _you_. Remove that chip to add someone unconnected, or search to connect them to anyone. While you type a name, people with similar names are listed so you don't create duplicates.
- **Connect two people**: click a person, then **Connect to another person**. Click the second person on the map or search for them. Hold **Shift** while clicking to connect several in a row. You can also search in _Direct connections_ on any profile. Duplicate and self-connections are blocked.
- **Profiles**: click a node to see name, CTC, category, connection level, the path from you, direct connections and notes, with Edit, Connect and Delete (which asks first). Remove a single connection with the × next to it, or click a line on the map. Both people are always kept.
- **Explore**: the top search dims everyone who doesn't match. _Filter & paths_ filters by level (direct, ≤2, ≤3, or a custom number), CTC range, category and "has CTC", and finds the **shortest path** between any two people. Selecting someone highlights their connections and dims the rest.
- **Layouts**: force-directed (the default), radial (you at the centre, one ring per level), hierarchical, and circle. You can drag nodes anywhere, and positions are saved. ⟳ re-arranges everyone, ⤢ fits the map to the screen.
- **Insights**: total people, direct connections, total connections, average, median and highest CTC, average CTC of your direct connections, people per level, the most connected people, and who isn't connected to you. Every CTC figure shows how many profiles it was computed from.
- **Undo and redo**: Ctrl/⌘ + Z and Shift + Ctrl/⌘ + Z, plus the Undo button on each toast.
- **Shortcuts**: `/` search · `N` add person · `C` connect · `E` edit · `Del` delete · `F` fit · `Esc` cancel.

## Data and privacy

- Every change is written to **IndexedDB** straight away. The top bar shows the save status. If IndexedDB is unavailable, the app falls back to `localStorage`, and if storage is blocked entirely it warns you to export.
- Each person has a permanent unique ID. Connections are stored separately as an ID pair, so renaming someone never breaks a link.
- Under **Export / Import** you can:
  - export a **JSON backup** (people, CTCs, categories, connections, positions and settings) and re-import it to restore everything,
  - export a **CSV** of people with CTC, level, connection count and names,
  - export the map as **PNG** or **SVG**.
- Your data never leaves your browser unless you export it.

## Code layout

```
src/
  model/       pure, unit-tested logic: types, reducer, BFS levels and shortest paths,
               analytics, filters, CTC formatting, JSON/CSV import–export, sample data
  storage/     IndexedDB persistence (incremental writes) + localStorage/memory fallbacks
  state/       useNetworkStore (undo/redo history, auto-save) and the app context
  components/  GraphCanvas (Cytoscape.js + fcose), panels, forms, pickers, overlays
  export/      SVG builder and download helpers
tests/         Vitest unit tests
e2e/           Playwright acceptance script covering the brief's acceptance tests
```

The graph is drawn with [Cytoscape.js](https://js.cytoscape.org/) on canvas, with the [fcose](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose) force layout. It stays usable with a thousand people. _Settings → Stress test_ generates 300 or 1,000 random people so you can try it.

### Acceptance run

`e2e/acceptance.mjs` starts `vite preview`, then drives Chromium through the brief's acceptance tests: the ME → A → X → Y chain, connecting Y to ME, level updates, any-to-any and circular connections, CTC editing, analytics values, refresh persistence, JSON export/clear/import round-trip, connection and person deletion, a 1,000-person stress test and a mobile layout check. Screenshots go to `e2e/output/`. It loads Playwright with `require("playwright")`, so install it first if it isn't already available (`bun add -d playwright && bunx playwright install chromium`).
