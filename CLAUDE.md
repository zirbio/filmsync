# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personalized movie/series recommendation app. Users import their FilmAffinity ratings (CSV), the system enriches them via TMDB API, Claude AI generates a taste profile, then recommends titles available on Spanish streaming platforms (Netflix, HBO Max, Prime Video, Disney+, Apple TV+).

## Commands

```bash
npm run dev          # Start dev server (Next.js + Turbopack)
npm run build        # Production build
npm run lint         # ESLint (flat config, next/core-web-vitals + typescript)
npm test             # Run all tests (vitest)
npm run test:watch   # Watch mode
npx vitest run src/lib/__tests__/cache.test.ts  # Run single test file
tsc --noEmit         # Type check (strict mode, must pass with 0 errors)
```

## Architecture

```
UI (React client components) --> Next.js API Routes --> External APIs + Local JSON cache
                                      |
                        +-------------+-------------+
                        v             v             v
                   TMDB API v3   Claude API    CSV Parser (papaparse)
```

**No database.** All persistent data lives as JSON files in `data/`, gitignored except `filmaffinity_ratings.csv`.

### Data Pipeline (sequential, each step depends on the previous)

1. **Enrich** (`POST /api/enrich`): Parses `data/filmaffinity_ratings.csv` via `lib/csv-parser.ts`, enriches each rating with TMDB metadata (genres, cast, keywords, poster). Saves to `data/enriched_ratings.json`. Includes 100ms throttle between TMDB calls.

2. **Profile** (`POST /api/profile`): Sends all enriched ratings to Claude (`lib/claude.ts` -> `generateTasteProfile`). Claude returns a structured `TasteProfile` JSON. Saved to `data/taste_profile.json`.

3. **Streaming catalog** (`POST /api/streaming`): Uses TMDB discover API to find titles available on selected Spanish streaming providers. Enriches top 100 with director/cast details. Saves to `data/streaming_catalog.json`. Includes 80ms throttle.

4. **Recommendations** (`POST /api/recommendations`): Filters the streaming catalog by user criteria, sends top 100 to Claude with the taste profile. Claude ranks and explains top 20. Cached in `data/recommendations_cache.json`.

### Key Modules

- `src/lib/tmdb.ts` — TMDB API client. All requests go through `tmdbFetch<T>()`. Region hardcoded to `ES`, language to `es-ES`.
- `src/lib/claude.ts` — Claude API integration. Uses `claude-sonnet-4-5-20250929`. `extractJSON()` handles markdown-wrapped JSON responses. Two functions: `generateTasteProfile` and `generateRecommendations`.
- `src/lib/cache.ts` — Read/write JSON files in `data/` directory. Generic `readCache<T>` and `writeCache<T>`.
- `src/lib/csv-parser.ts` — Parses FilmAffinity CSV export. Expected columns: `Title`, `Year`, `Directors`, `WatchedDate`, `Rating`, `Rating10`.
- `src/types/index.ts` — All TypeScript types and the `STREAMING_PROVIDERS` constant (provider IDs for TMDB API).

### API Routes (all in `src/app/api/`)

Each route supports both GET (read cached data) and POST (generate/refresh):

| Route | GET | POST |
|---|---|---|
| `/api/enrich` | Status + sample | Parse CSV + enrich via TMDB |
| `/api/profile` | Cached profile | Generate taste profile via Claude |
| `/api/streaming` | Cached catalog | Discover streaming titles via TMDB |
| `/api/recommendations` | Cached recommendations | Generate via Claude |
| `/api/genres` | TMDB genre list | — |
| `/api/watched` | Watched list | Add title to watched |

### UI Flow

`page.tsx` is a single client component with three states: `loading` -> `setup` (if no profile) -> `ready`. Setup triggers the enrich + profile pipeline. Ready state shows filters + recommendation cards.

## Environment Variables

Required in `.env.local`:
- `TMDB_API_KEY` — TMDB API v3 key
- `ANTHROPIC_API_KEY` — Anthropic API key (read automatically by `@anthropic-ai/sdk`)

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19**, TypeScript strict
- **Tailwind CSS v4** (via `@tailwindcss/postcss`)
- **Vitest** for testing
- **ESLint** flat config (`eslint-config-next`)
- Path alias: `@/*` maps to `./src/*`

## Frontend Development Rules

### Anti-Slop Design (mandatory)

- **Banned fonts**: Inter, Roboto, Arial, system-ui, sans-serif, Helvetica, Space Grotesk
- **Banned colors**: pure `#000000`, pure `#ffffff`, default Tailwind palette without customization
- **Banned patterns**: `rounded-xl shadow-lg` card combo, hero + 3-col + CTA layout, purple-to-blue gradients
- Define palette via HSL CSS variables in `globals.css`. Use layered shadows, not single `shadow-lg`
- Icons: `lucide-react` exclusively with `strokeWidth={1.5}`

### Typography

- Max 2 font families. Approved sans: Geist, Satoshi, General Sans, Instrument Sans, Cabinet Grotesk, Outfit, Plus Jakarta Sans, Sora
- Weight contrast: 400 body, 600-700 headings. Avoid 500
- Headings: `tracking-tight`. Body max-width: `max-w-prose`

### Animation (Framer Motion)

- Duration: 150-300ms interactions, max 500ms page transitions. Never `linear` easing
- Add motion last — get static layout right first
- Staggered entrance on page load, `whileInView` for below-fold
- Every button/link needs hover feedback. Every focusable element needs visible focus ring
- Respect `prefers-reduced-motion`

### Component Libraries

- **Base**: shadcn/ui in `src/components/ui/` — `npx shadcn@latest add [component]`
- **Animated effects**: Magic UI — `npx shadcn@latest add "https://magicui.design/r/[name]"`
- **Premium effects**: Aceternity UI — copy from docs into `src/components/aceternity/`
- **Community**: 21st.dev — search here before building custom components

### Component Creation Workflow

1. Search existing libraries (Magic UI, Aceternity, 21st.dev) before building custom
2. Define aesthetic direction before coding
3. Build static first, add motion last
4. Run anti-slop audit before delivering

### React & TypeScript Standards

- Functional components only, named exports
- `"use client"` only on components that need it; prefer server components
- Component structure: Types -> Component -> Hooks -> Handlers -> Derived state -> Early returns -> Render
- File naming: `kebab-case.tsx` for components, `use-[name].ts` for hooks
- Import order: React/Next -> External libs -> Internal components -> Internal utils/hooks/types

### Accessibility

- Semantic HTML (`<nav>`, `<main>`, `<section>`, etc.)
- Color contrast: min 4.5:1 body, 3:1 large text (WCAG AA)
- All images need descriptive `alt`. Keyboard navigation for all interactive elements

### Backend Integration

- API client in `src/lib/api.ts` with typed responses
- Zod for runtime validation of external data
- Consistent error shape: `{ error: string, code: string, details?: unknown }`

### Performance

- Images: `next/image` with `priority` for LCP
- Fonts: `next/font` with `display: swap`
- Dynamic imports for heavy components
- `useMemo` for expensive computations, `useCallback` for stable refs

## Project Structure Convention

```
src/
  app/           # Next.js App Router (pages, layouts, API routes)
  components/
    ui/          # shadcn/ui base components
    magicui/     # Magic UI animated components
    aceternity/  # Aceternity UI effects
    layout/      # Header, footer, sidebar, navigation
    [feature]/   # Feature-specific composed components
  hooks/         # Custom hooks (use-*.ts)
  lib/           # Utilities, API clients, validators
  types/         # Shared TypeScript types
  config/        # Site metadata, navigation config
```
