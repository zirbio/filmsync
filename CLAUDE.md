# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**FilmSync** — Personalized movie/series recommendation app. Users import their FilmAffinity ratings (CSV), the system enriches them via TMDB API, then Claude AI recommends titles available on Spanish streaming platforms (Netflix, Max/HBO, Prime Video, Disney+, Apple TV+). Optionally syncs ratings to Trakt.tv.

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
                        +------+------+------+------+
                        v      v      v      v      v
                     TMDB   Claude  CSV    Trakt  FA Scraper
                    API v3   API   Parser  API    (CLI tool)
```

**No database.** All persistent data lives as JSON files in `data/`, gitignored. The only checked-in data file is `data/filmaffinity_ratings.csv`.

### Data Pipeline

1. **Enrich** (`POST /api/enrich`): Parses FilmAffinity CSV via `lib/csv-parser.ts`, enriches each rating with TMDB metadata (genres, cast, keywords, poster). Saves to `data/enriched_ratings.json`. Includes 100ms throttle between TMDB calls.

2. **Recommend** (`POST /api/recommendations`): Filters enriched ratings by user criteria via `lib/rating-filter.ts`, sends matching ratings to Claude which returns 20 ranked recommendations with personalized reasons. Each recommendation is verified against TMDB for streaming availability. Cached in `data/recommendations_cache.json`.

3. **Trakt Sync** (optional): OAuth flow via `/api/trakt/*` routes. Syncs ratings + watch history to Trakt.tv, can remove synced items from Trakt watchlist. Diff-based: `/api/sync` computes new ratings, `/api/sync/confirm` executes the sync.

### Key Modules

- `src/lib/tmdb.ts` — TMDB API client. All requests go through `tmdbFetch<T>()`. Region hardcoded to `ES`, language to `es-ES`. Functions: `searchMovie`, `searchTV`, `getMovieDetails`, `getTVDetails`, `getGenreList`, `discoverStreamingTitles`, `getWatchProviders`, `verifyRecommendation`.
- `src/lib/claude.ts` — Claude API integration. Uses `claude-sonnet-4-5-20250929`. Single function: `generateRecommendations()`. `extractJSON()` handles markdown-wrapped JSON responses.
- `src/lib/cache.ts` — Read/write JSON files in `data/` directory. Generic `readCache<T>` and `writeCache<T>`.
- `src/lib/csv-parser.ts` — Parses FilmAffinity CSV export. Expected columns: `Title`, `Year`, `Directors`, `WatchedDate`, `Rating`, `Rating10`.
- `src/lib/rating-filter.ts` — Filters enriched ratings by type (movie/tv), genre categories, and minimum year. Used before sending to Claude.
- `src/lib/trakt.ts` — Trakt.tv API client. OAuth token management, sync ratings/history, watchlist operations. Batches requests in chunks of 100.
- `src/lib/fa-scraper.ts` — Calls external `fa-scraper` CLI tool to scrape a user's FilmAffinity profile.
- `src/types/index.ts` — All TypeScript types, plus `STREAMING_PROVIDERS` constant (TMDB provider IDs) and `GENRE_CATEGORIES` mapping.

### API Routes (all in `src/app/api/`)

| Route | GET | POST |
|---|---|---|
| `/api/enrich` | Status + sample | Parse CSV + enrich via TMDB |
| `/api/recommendations` | Cached recommendations | Generate via Claude |
| `/api/watched` | Watched list | Add title to watched |
| `/api/sync` | Compute sync diff | — |
| `/api/sync/confirm` | — | Execute Trakt sync |
| `/api/trakt/auth` | Get OAuth URL | — |
| `/api/trakt/callback` | OAuth callback handler | — |
| `/api/trakt/status` | Check token validity | — |
| `/api/trakt/watchlist` | Get Trakt watchlist | — |

### UI Flow

`page.tsx` is a single client component with three states: `loading` → `setup` (if no enriched data) → `ready`. Setup triggers the enrich pipeline. Ready state shows filters (type, genre, platform) + recommendation cards. A separate `/sync` page handles Trakt integration.

### Components

- `SetupPanel.tsx` — CSV upload/enrichment UI with progress steps
- `Filters.tsx` — Container for filter controls
- `GenreFilter.tsx` — Multi-select genre category picker
- `PlatformFilter.tsx` — Streaming platform toggle buttons
- `RecommendationCard.tsx` — Movie/series card with poster, score, reason
- `MotionProvider.tsx` — Wraps app in `<MotionConfig reducedMotion="user">`

## Environment Variables

Required in `.env.local`:
- `TMDB_API_KEY` — TMDB API v3 key
- `ANTHROPIC_API_KEY` — Anthropic API key (read automatically by `@anthropic-ai/sdk`)

Optional (for Trakt sync):
- `TRAKT_CLIENT_ID` — Trakt OAuth app client ID
- `TRAKT_CLIENT_SECRET` — Trakt OAuth app client secret
- `TRAKT_REDIRECT_URI` — Defaults to `http://localhost:3000/api/trakt/callback`

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19**, TypeScript strict
- **Tailwind CSS v4** (via `@tailwindcss/postcss`, no separate tailwind.config)
- **motion** v12 (import from `"motion/react"`, NOT `"framer-motion"`)
- **Vitest** for testing
- **ESLint 9** flat config (`eslint-config-next`)
- **lucide-react** for icons (use `strokeWidth={1.5}`)
- Path alias: `@/*` maps to `./src/*`

## CI Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs 4 parallel jobs on Node 22:
1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm test`
4. `npm run build` (depends on all above)

Replicate these locally before pushing.

## Frontend Development Rules

### Anti-Slop Design (mandatory)

- **Banned fonts**: Inter, Roboto, Arial, system-ui, sans-serif, Helvetica, Space Grotesk
- **Banned colors**: pure `#000000`, pure `#ffffff`, default Tailwind palette without customization
- **Banned patterns**: `rounded-xl shadow-lg` card combo, hero + 3-col + CTA layout, purple-to-blue gradients
- Palette defined via HSL CSS variables in `globals.css`. Use `.shadow-elevated` / `.shadow-elevated-hover` classes, not single `shadow-lg`

### Current Design System

- **Fonts**: Geist Sans (body, `--font-body`) + Instrument Serif (display, `--font-display`), loaded via `next/font/google`
- **Theme**: Dark cinematic — warm dark backgrounds (`hsl(240 6% 7%)`), warm off-white text (`hsl(40 10% 92%)`), gold accent (`hsl(38 75% 55%)`)
- **Motion**: `motion` package, import from `"motion/react"`. MotionProvider at root respects `prefers-reduced-motion`. Duration: 150-300ms interactions, max 500ms page. Never `linear` easing.

### Typography

- Weight contrast: 400 body, 600-700 headings. Avoid 500
- Headings: `tracking-tight`. Body max-width: `max-w-prose`

### React & TypeScript Standards

- Functional components only, named exports
- `"use client"` only on components that need it; prefer server components
- Component structure: Types → Component → Hooks → Handlers → Derived state → Early returns → Render
- File naming: `kebab-case.tsx` for components, `use-[name].ts` for hooks
- Import order: React/Next → External libs → Internal components → Internal utils/hooks/types

### Accessibility

- Semantic HTML (`<nav>`, `<main>`, `<section>`, etc.)
- Color contrast: min 4.5:1 body, 3:1 large text (WCAG AA)
- All images need descriptive `alt`. Use `.focus-ring` class for visible focus rings
- Every button/link needs hover feedback
