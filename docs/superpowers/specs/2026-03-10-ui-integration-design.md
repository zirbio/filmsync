# FilmSync — Full UI Integration Design

## Overview

Integrate all backend functionalities into the UI while maintaining the dark cinematic design system. Transform the app from a single-page with isolated `/sync` route into a cohesive tabbed experience.

## Decisions

| Decision | Choice |
|---|---|
| Navigation | Tabs in header + bottom bar on mobile |
| Import flow | Both CSV upload and FA scraper (modal) |
| Watch history | Dedicated "Mi Biblioteca" tab with restore |
| Enriched ratings | Shown in Biblioteca > "Mi colección" |
| Trakt integration | Inside Biblioteca as subsection |
| Tab structure | 2 tabs: Descubrir + Mi Biblioteca |
| Implementation | Client-side tabs via useState (no Next.js routes) |
| State preservation | Both views stay mounted, toggle visibility |

## Architecture

### AppShell Component

New wrapper replacing `page.tsx` logic. Manages:
- Active tab: `useState<'discover' | 'library'>('discover')`
- Setup detection: if no enriched data, opens ImportModal automatically
- Renders both `<DiscoverView />` and `<LibraryView />`, toggling visibility to preserve state

### Header (desktop >= 768px)
- Logo "FilmSync" in Instrument Serif, left-aligned
- Two tabs right-aligned: **Descubrir** | **Mi Biblioteca**
- Active tab: gold underline (`--primary`) via `motion.div layoutId="tab-indicator"`, text `--foreground`
- Inactive: `--foreground-muted`, hover → `--foreground`
- Spring transition: `stiffness: 500, damping: 35`

### Bottom Bar (mobile < 768px)
- Fixed bottom, `--background-elevated` with `--border` top border
- `z-index: 50` to stay above content
- Two icons with labels: Descubrir (`Compass`) | Biblioteca (`Library`)
- Active icon: `--primary`, inactive: `--foreground-muted`
- Header on mobile shows only logo, no tabs
- Main content area must have `padding-bottom: 5rem` on mobile to prevent last items from being hidden behind the bar

### Tab Transitions

Both views remain mounted at all times to preserve state. Visibility is toggled via motion animations on persistent elements (NOT AnimatePresence, which unmounts children):

```tsx
{/* Both always mounted */}
<motion.div animate={{ opacity: activeTab === 'discover' ? 1 : 0, x: activeTab === 'discover' ? 0 : -20 }}
  style={{ display: activeTab === 'discover' ? 'block' : 'none' }}>
  <DiscoverView />
</motion.div>
<motion.div animate={{ opacity: activeTab === 'library' ? 1 : 0, x: activeTab === 'library' ? 0 : 20 }}
  style={{ display: activeTab === 'library' ? 'block' : 'none' }}>
  <LibraryView />
</motion.div>
```

- Active: `opacity: 1, x: 0`, 300ms, easeOut
- Hidden: `display: none` (after animation completes, via onAnimationComplete callback)

## Tab: Descubrir

### Component: `DiscoverView`

Extracted from current `page.tsx` ready state. Functionally identical, with one fix: existing animations using `duration: 0.6` (600ms) must be reduced to `duration: 0.5` (500ms max) per CLAUDE.md rules.

- Filters: reuses `Filters.tsx`, `GenreFilter.tsx`, `PlatformFilter.tsx` unchanged
- "Generar recomendaciones" button
- Recommendation grid with `RecommendationCard`
- Loading skeleton (6 cards)
- Empty state message
- "Ya la vi" dismiss still calls `POST /api/watched`

## Tab: Mi Biblioteca

### Component: `LibraryView`

Internal navigation via segmented control (3 buttons):
**Mi colección** | **Vistos** | **Trakt**

- Container: `--background-subtle` background
- Active button: `--background-elevated` + `--foreground` text
- Inactive: `--foreground-muted`
- Active pill animates with `motion.div layoutId="library-pill"`

### Subsection: Mi colección (`CollectionGrid`)

All imported + enriched FA ratings.

- **Header**: "{count} títulos importados" + **"Importar"** button (icon `Upload`) → opens ImportModal
- **Filters**: text search by title + type filter (movie/series) + sort by (rating, watch date, year)
- **Grid**: `TitleCard` components showing poster, title, year, FA rating, genres, type badge
- **Empty state**: "Aún no has importado valoraciones" + "Importar ahora" button
- **Data source**: `GET /api/enrich?full=true`

### Subsection: Vistos (`WatchedList`)

Titles dismissed from recommendations.

- **Header**: "{count} títulos vistos"
- **Grid**: `TitleCard` with "Restaurar" button (icon `Undo2`)
- Restore calls `POST /api/watched` with `{ tmdbId, action: 'remove' }`
- **Empty state**: "Cuando descartes una recomendación con 'Ya la vi', aparecerá aquí"

### Subsection: Trakt (`TraktSection`)

Migrated from `/sync/page.tsx`.

- **Disconnected**: Card with Trakt explanation + "Conectar con Trakt" button (gold)
- **Connected** (3 vertical blocks):
  1. **Sync ratings**: "Sincronizar con FA" button, diff table, confirm/cancel, last sync info
  2. **Watchlist available**: titles on Spanish streaming platforms, provider badges
  3. **Watchlist unavailable**: rest of watchlist, muted styling
- Migrated from `sync/page.tsx`: the component extracts the full state machine (`idle` → `scraping` → `diff-ready` → `confirming` → `done` → `error`) and all handlers. Inline sub-components (`TypeBadge`, `StarRating`, `WatchlistItemCard`, `SyncDiffTable`) are extracted to separate files or kept inline in `TraktSection.tsx` if they are only used there. `TypeBadge` and `StarRating` should be extracted to `src/components/` if they are also needed by `TitleCard` or `CollectionGrid`

## ImportModal Component

Triggered from: "Importar" button in Biblioteca, or automatically on first launch (no enriched data).

### Structure
- Overlay: `var(--background) / 0.6` (using the background variable, not hardcoded black) + backdrop-blur
- Card: `--background-elevated`, max-width `32rem`, `shadow-elevated`
- Header: "Importar valoraciones" (Instrument Serif) + close button (`X`)
- **Accessibility**: Escape key to close, focus trap inside modal (cycle tab through interactive elements), return focus to trigger element on close. Use `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the header

### Option 1: "Subir archivo CSV" (icon `FileUp`)
- Drag & drop zone + file input, accepts `.csv` only
- Drop zone: dashed `--border`, hover → `--primary` border + `--primary-muted` background
- Submits to modified `POST /api/enrich` (multipart/form-data)

### Option 2: "Importar desde FilmAffinity" (icon `Globe`)
- Text input for FA user ID + "Importar" button
- Calls `POST /api/scrape` with `{ userId }`

### Progress (both paths)
- Animated progress bar: `--primary-muted` → `--primary` gradient
- Message: "Enriqueciendo títulos con TMDB... (34/142)"
- On complete: success summary + "Ver mi colección" button

### Error Handling
- **CSV upload fails** (malformed, wrong format): error message "El archivo no es un CSV válido de FilmAffinity. Asegúrate de exportar desde tu perfil." + retry
- **FA scraper fails** (invalid user ID, tool not installed, timeout): error message "No se pudo acceder al perfil de FilmAffinity. Verifica el nombre de usuario." + retry. If `fa-scraper` CLI is not installed: "La herramienta de scraping no está disponible. Usa la opción de subir CSV."
- **Enrich partially fails** (some titles not found on TMDB): show success with warning: "Se importaron 130 de 142 títulos. 12 no se encontraron en TMDB." The import is considered successful; missing titles are logged but don't block
- All errors show with `--error` color, retry button, and option to try the other import method

### Modal Motion
- Overlay: `opacity: 0 → 1`, 200ms
- Card: `opacity: 0, scale: 0.95, y: 10` → `opacity: 1, scale: 1, y: 0`, 300ms, easeOut
- Close: inverse, 150ms

## Shared Component: TitleCard

Base card component used across Biblioteca. `RecommendationCard` extends it.

**TypeScript interface:**

```typescript
interface TitleCardProps {
  poster: string | null        // TMDB poster path
  title: string
  year: number
  directors?: string
  genres: string[]
  type: 'movie' | 'tv'
  tmdbScore?: number           // 0-10, displayed top-right
  children?: React.ReactNode   // Action slot — rendered below card content
}
```

The action slot uses `children` — the simplest React composition pattern. Each consumer wraps `TitleCard` and passes its specific actions as children.

**Usage by context:**

```tsx
{/* Mi colección */}
<TitleCard {...props}>
  <FARatingBadge rating={item.userRating} />
</TitleCard>

{/* Vistos */}
<TitleCard {...props}>
  <RestoreButton onClick={() => handleRestore(item.tmdbId)} />
</TitleCard>

{/* Watchlist Trakt */}
<TitleCard {...props}>
  <ProviderBadges providers={item.providers} />
</TitleCard>
```

**RecommendationCard refactoring:** The current `RecommendationCard` renders poster, title, year, directors, genres, type badge, and TMDB score inline. These elements move into `TitleCard`. `RecommendationCard` becomes a wrapper that renders `<TitleCard {...baseProps}>` and adds its own unique elements as children: recommendation reason (blockquote), affinity score bar, and "Ya la vi" button

## API Changes

### Modified: `POST /api/enrich`
- Now accepts `multipart/form-data` with CSV file attachment
- Saves file to `data/filmaffinity_ratings.csv`, then enriches
- Backwards compatible: if no file in body, reads local CSV

### Modified: `GET /api/enrich`
- New query param `?full=true` returns `{ total, notFound, ratings: EnrichedRating[] }` — the full enriched array inside a `ratings` field
- Without param: returns existing summary response `{ total, notFound, sample }`

### Modified: `POST /api/watched`
- New optional field `action: 'add' | 'remove'` (default `'add'`)
- With `action: 'remove'` + `tmdbId`: removes from `watched.json`

### New: `POST /api/scrape`
- Receives `{ userId: string }`
- Calls `fa-scraper` CLI tool
- Saves result as CSV in `data/`, triggers enrich
- **Success** (200): same format as `POST /api/enrich` — `{ total, newlyEnriched, notFound }`
- **Error** (400): `{ error: "userId is required" }` if missing
- **Error** (404): `{ error: "User not found on FilmAffinity" }` if scraper returns empty/error
- **Error** (500): `{ error: "fa-scraper tool not available" }` if CLI not installed
- **Error** (504): `{ error: "Scraping timed out" }` if scraper exceeds 120s

### Unchanged
- `GET/POST /api/recommendations`
- `GET /api/watched`
- `POST /api/sync` (computes diff of new FA ratings), `POST /api/sync/confirm` (executes Trakt sync)
- All `/api/trakt/*` routes (auth, callback, status, watchlist)

### Deletions
- `src/app/sync/page.tsx` — migrated to TraktSection component

## Client Directive Guidance

All new components are interactive (useState, event handlers, motion) and need `"use client"`:
- `AppShell.tsx` — manages tab state
- `DiscoverView.tsx` — filters state, API calls
- `LibraryView.tsx` — subsection state
- `ImportModal.tsx` — modal state, file upload, form
- `TitleCard.tsx` — motion animations, hover effects
- `CollectionGrid.tsx` — search/filter state, API calls
- `WatchedList.tsx` — restore handlers, API calls
- `TraktSection.tsx` — full state machine, OAuth flow

No new server components are introduced. The existing server component boundary is at `layout.tsx`.

## File Structure

**Note:** CLAUDE.md specifies `kebab-case.tsx` for components. The existing codebase uses PascalCase (`SetupPanel.tsx`, `RecommendationCard.tsx`). New files follow the existing PascalCase convention for consistency within the project. If a kebab-case migration is desired, it should be a separate chore.

```
src/
├── app/
│   ├── layout.tsx              (unchanged)
│   ├── page.tsx                (simplified: renders AppShell)
│   ├── globals.css             (fix: remove system-ui from font-family fallback — it's a banned font)
│   └── api/
│       ├── enrich/route.ts     (modified: multipart support)
│       ├── watched/route.ts    (modified: add/remove action)
│       ├── scrape/route.ts     (NEW)
│       ├── recommendations/    (unchanged)
│       ├── sync/               (unchanged)
│       └── trakt/              (unchanged)
├── components/
│   ├── AppShell.tsx            (NEW)
│   ├── DiscoverView.tsx        (NEW — extracted from page.tsx)
│   ├── LibraryView.tsx         (NEW)
│   ├── ImportModal.tsx         (NEW)
│   ├── TitleCard.tsx           (NEW)
│   ├── CollectionGrid.tsx      (NEW)
│   ├── WatchedList.tsx         (NEW)
│   ├── TraktSection.tsx        (NEW — from sync/page.tsx)
│   ├── RecommendationCard.tsx  (modified: uses TitleCard)
│   ├── Filters.tsx             (unchanged)
│   ├── GenreFilter.tsx         (unchanged)
│   ├── PlatformFilter.tsx      (unchanged)
│   ├── SetupPanel.tsx          (DELETED — replaced by ImportModal)
│   └── MotionProvider.tsx      (unchanged)
└── types/index.ts              (minor additions if needed)
```

## Motion Summary

| Element | Animation | Duration | Easing |
|---|---|---|---|
| Tab content switch | opacity + x on persistent elements (no unmount) | 300ms | easeOut |
| Tab indicator (header) | layoutId spring | spring | stiffness 500, damping 35 |
| Library pill | layoutId spring | spring | stiffness 500, damping 35 |
| ImportModal overlay | opacity | 200ms | easeOut |
| ImportModal card | opacity + scale + y | 300ms in / 150ms out | easeOut |
| TitleCard grid entry | opacity + y with stagger | index * 50ms, max 400ms | easeOut |
| TitleCard hover | scale 1.02 | 200ms | easeOut |
| Progress bar | width | 300ms | easeOut |
| Button tap | scale 0.95 | instant | — |

## Design System Compliance

All new components must follow CLAUDE.md rules:
- Colors via HSL CSS variables only (no hardcoded hex, no Tailwind defaults)
- `.shadow-elevated` / `.shadow-elevated-hover` (no `shadow-lg`)
- Semantic HTML (`<nav>`, `<main>`, `<section>`, `<button>`)
- WCAG AA contrast: 4.5:1 body, 3:1 large text
- `.focus-ring` on all interactive elements
- Hover feedback on all buttons/links
- `lucide-react` icons with `strokeWidth={1.5}`
- Fonts: Geist Sans (body) + Instrument Serif (display headings)
- Motion: `"motion/react"` imports, never `linear`, respect reduced-motion
- No banned patterns: no `rounded-xl shadow-lg`, no Inter/Roboto/Arial, no pure #000/#fff
