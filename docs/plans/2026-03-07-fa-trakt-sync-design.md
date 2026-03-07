# FilmAffinity -> Trakt Sync System Design

## Overview

New `/sync` page that scrapes FilmAffinity ratings using `fa-scraper` (Python CLI) and synchronizes them with Trakt. Also displays the user's Trakt watchlist with streaming availability in Spain.

## Goals

1. Scrape FA ratings via `fa-scraper` CLI (child process)
2. Sync ratings to Trakt (1-10 scale)
3. Mark synced titles as watched in Trakt
4. Remove watched titles from Trakt watchlist
5. Update local enriched ratings for the recommendation engine
6. Show Trakt watchlist with streaming availability (ES)
7. Badge on RecommendationCard for titles in watchlist

## Architecture

```
/sync page (React UI)
    |
    v
API Routes
    /api/trakt/auth         -- initiate OAuth2 flow
    /api/trakt/callback     -- receive OAuth2 callback, store token
    /api/trakt/watchlist    -- read watchlist + cross with TMDB streaming
    /api/sync               -- phase 1: scrape FA + compute diff
    /api/sync/confirm       -- phase 2: push to Trakt + update local state
    |
    v
File cache (data/)
    trakt_token.json        -- OAuth access/refresh token
    last_sync.json          -- titles already synced (baseline)
    watchlist.json          -- cached Trakt watchlist
    enriched_ratings.json   -- updated with new ratings
```

## New Files

| File | Purpose |
|------|---------|
| `src/lib/trakt.ts` | Trakt API client (auth, ratings, history, watchlist) |
| `src/lib/fa-scraper.ts` | Wrapper to execute `fa-scraper` CLI as child process |
| `src/app/api/trakt/auth/route.ts` | Start OAuth -> redirect to Trakt |
| `src/app/api/trakt/callback/route.ts` | Receive OAuth callback -> save token |
| `src/app/api/trakt/watchlist/route.ts` | Read watchlist + streaming availability |
| `src/app/api/sync/route.ts` | Phase 1: scrape + diff |
| `src/app/api/sync/confirm/route.ts` | Phase 2: push to Trakt + update local |
| `src/app/sync/page.tsx` | Sync page UI |

## New Types

```typescript
interface TraktToken {
  access_token: string
  refresh_token: string
  expires_at: number
}

interface SyncDiff {
  newRatings: SyncItem[]
  totalFA: number
  totalSynced: number
}

interface SyncItem {
  title: string
  year: number
  rating10: number
  tmdbId?: number
  tmdbType?: 'movie' | 'tv'
  watchedDate?: string
}

interface TraktWatchlistItem {
  title: string
  year: number
  tmdbId: number
  type: 'movie' | 'tv'
  streaming?: StreamingProvider[]
}
```

## Sync Flow

### Phase 1: Scrape + Diff (user presses "Sync")

1. Execute `fa-scraper 664084 --csv /tmp/fa_ratings.csv --lang en`
2. Parse resulting CSV with existing csv-parser
3. Read `data/last_sync.json` (previously synced titles)
4. Compute diff: new = FA titles - already synced
5. For each new title, search TMDB to get tmdbId
6. Return `SyncDiff { newRatings, totalFA, totalSynced }`

### Phase 2: Confirm (user reviews and accepts)

1. `POST trakt.tv/sync/ratings` (send ratings, batches of 100)
2. `POST trakt.tv/sync/history` (mark as watched)
3. `GET trakt.tv/users/me/watchlist` (read watchlist)
4. Cross watchlist with newly synced titles
5. `POST trakt.tv/sync/watchlist/remove` (remove watched from watchlist)
6. Update `data/last_sync.json` (add new titles)
7. Update `data/enriched_ratings.json` (merge new ratings)
8. Return `{ syncedCount, removedFromWatchlist }`

## First Sync

First time syncs all 743+ existing ratings to Trakt. Subsequent syncs are incremental (only new titles).

## Watchlist + Streaming Availability

### Dedicated section on /sync page

- Reads Trakt watchlist
- For each title, queries TMDB `getWatchProviders()` for Spain
- Groups by: "Available now" (on configured platforms) vs "Not available"
- Configured platforms: Netflix, HBO Max, Prime Video, Disney+, Apple TV+

### Badge on RecommendationCard

- Load watchlist into `data/watchlist.json`
- When generating recommendations, cross-reference with watchlist
- Show "En tu watchlist" badge on matching RecommendationCards

## UI States

| State | Display |
|-------|---------|
| Not connected | "Connect with Trakt" button (starts OAuth) |
| Connected, no prior sync | Sync button, first-time notice |
| Connected, prior sync | Last sync date, total synced, Sync button |
| Scraping in progress | Spinner + "Getting ratings from FilmAffinity..." |
| Diff ready | Table with checkboxes + Confirm button |
| Confirming | Spinner + "Syncing with Trakt..." |
| Sync complete | Summary: "X ratings added, Y removed from watchlist" |
| Error | Descriptive message + retry button |

## Environment Variables

```
FILMAFFINITY_USER_ID=664084
TRAKT_CLIENT_ID=<from trakt app>
TRAKT_CLIENT_SECRET=<from trakt app>
```

## Dependencies

- `fa-scraper` (Python, installed via `pip install fa-scraper`)
- Python 3.9+ on the system
