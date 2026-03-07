"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  SyncItem,
  SyncDiff,
  SyncResult,
  TraktWatchlistItem,
  StreamingProviderKey,
} from "@/types";
import { STREAMING_PROVIDERS } from "@/types";

type SyncStatus =
  | "idle"
  | "scraping"
  | "diff-ready"
  | "confirming"
  | "done"
  | "error";

const PROVIDER_COLORS: Record<StreamingProviderKey, string> = {
  netflix: "bg-red-600",
  hbo: "bg-purple-700",
  prime: "bg-blue-500",
  disney: "bg-blue-700",
  apple: "bg-gray-800",
};

function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-spin rounded-full border-2 border-amber-500 border-t-transparent ${className}`}
    />
  );
}

function TypeBadge({ type }: { type: "movie" | "tv" | null }) {
  if (!type) return null;
  const label = type === "movie" ? "Pelicula" : "Serie";
  const colors =
    type === "movie"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
      : "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}>
      {label}
    </span>
  );
}

function StarRating({ rating10 }: { rating10: number }) {
  const stars = rating10 / 2;
  const fullStars = Math.floor(stars);
  const hasHalf = stars - fullStars >= 0.5;

  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500">
      {Array.from({ length: 5 }, (_, i) => {
        if (i < fullStars) {
          return (
            <svg key={i} className="h-4 w-4 fill-current" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          );
        }
        if (i === fullStars && hasHalf) {
          return (
            <svg key={i} className="h-4 w-4" viewBox="0 0 20 20">
              <defs>
                <linearGradient id={`half-${i}`}>
                  <stop offset="50%" stopColor="currentColor" />
                  <stop offset="50%" stopColor="transparent" />
                </linearGradient>
              </defs>
              <path
                fill={`url(#half-${i})`}
                stroke="currentColor"
                strokeWidth="0.5"
                d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
              />
            </svg>
          );
        }
        return (
          <svg
            key={i}
            className="h-4 w-4 text-gray-300 dark:text-gray-600"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        );
      })}
      <span className="ml-1 text-xs text-gray-500">({rating10})</span>
    </span>
  );
}

function WatchlistItemCard({ item }: { item: TraktWatchlistItem }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-gray-900 dark:text-white">
            {item.title}
          </h4>
          <span className="text-sm text-gray-500">({item.year})</span>
          <TypeBadge type={item.type} />
        </div>
        {item.genres.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.genres.slice(0, 3).map((genre) => (
              <span
                key={genre}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400"
              >
                {genre}
              </span>
            ))}
          </div>
        )}
        {item.providers.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.providers.map((providerKey) => (
              <span
                key={providerKey}
                className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${PROVIDER_COLORS[providerKey]}`}
              >
                {STREAMING_PROVIDERS[providerKey].name}
              </span>
            ))}
          </div>
        )}
      </div>
      {item.tmdbRating !== null && (
        <div className="flex-shrink-0 rounded-lg bg-amber-100 px-2 py-1 dark:bg-amber-900">
          <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
            {item.tmdbRating.toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
}

function SyncDiffTable({ items }: { items: SyncItem[] }) {
  if (items.length === 0) {
    return (
      <p className="py-4 text-center text-gray-500">
        No hay nuevas valoraciones para sincronizar.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
              Titulo
            </th>
            <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
              Ano
            </th>
            <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
              Valoracion
            </th>
            <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
              Tipo
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {items.map((item) => (
            <tr
              key={`${item.title}-${item.year}`}
              className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                {item.title}
              </td>
              <td className="px-4 py-3 text-gray-500">{item.year}</td>
              <td className="px-4 py-3">
                <StarRating rating10={item.rating10} />
              </td>
              <td className="px-4 py-3">
                <TypeBadge type={item.tmdbType} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SyncPage() {
  const [connected, setConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncDiff, setSyncDiff] = useState<SyncDiff | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [watchlist, setWatchlist] = useState<{
    available: TraktWatchlistItem[];
    unavailable: TraktWatchlistItem[];
  } | null>(null);
  const [watchlistTotal, setWatchlistTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null);
  const [totalSynced, setTotalSynced] = useState<number>(0);

  useEffect(() => {
    async function checkConnection() {
      try {
        const res = await fetch("/api/trakt/status");
        if (res.ok) {
          const data: { connected: boolean; expiresAt?: string } =
            await res.json();
          setConnected(data.connected);
        }
      } catch {
        setConnected(false);
      } finally {
        setCheckingConnection(false);
      }
    }
    checkConnection();
  }, []);

  const handleConnect = () => {
    window.location.href = "/api/trakt/auth";
  };

  const handleSync = useCallback(async () => {
    setSyncStatus("scraping");
    setError(null);
    setSyncDiff(null);
    setSyncResult(null);

    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) {
        const errorData: { error?: string } = await res.json();
        throw new Error(errorData.error ?? "Error al obtener valoraciones");
      }

      const diff: SyncDiff = await res.json();
      setSyncDiff(diff);
      setTotalSynced(diff.totalSynced);
      setSyncStatus("diff-ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setError(message);
      setSyncStatus("error");
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    setSyncStatus("confirming");
    setError(null);

    try {
      const res = await fetch("/api/sync/confirm", { method: "POST" });
      if (!res.ok) {
        const errorData: { error?: string } = await res.json();
        throw new Error(errorData.error ?? "Error al confirmar sincronizacion");
      }

      const result: SyncResult = await res.json();
      setSyncResult(result);
      setLastSyncDate(new Date().toISOString());
      setTotalSynced((prev) => prev + result.syncedCount);
      setSyncStatus("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setError(message);
      setSyncStatus("error");
    }
  }, []);

  const fetchWatchlist = useCallback(async () => {
    setLoadingWatchlist(true);
    try {
      const res = await fetch("/api/trakt/watchlist");
      if (!res.ok) {
        throw new Error("Error al obtener watchlist");
      }

      const data: {
        total: number;
        available: TraktWatchlistItem[];
        unavailable: TraktWatchlistItem[];
      } = await res.json();
      setWatchlist({
        available: data.available,
        unavailable: data.unavailable,
      });
      setWatchlistTotal(data.total);
    } catch {
      // Watchlist fetch failed silently — user can retry
    } finally {
      setLoadingWatchlist(false);
    }
  }, []);

  if (checkingConnection) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-10 w-10 border-4" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Sincronizacion FA &rarr; Trakt
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Sincroniza tus valoraciones de FilmAffinity con tu cuenta de Trakt
        </p>
      </header>

      {/* Connection status */}
      <section className="mb-6 rounded-xl bg-white p-6 shadow-sm dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Conexion con Trakt
        </h2>
        {connected ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Conectado a Trakt
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-500">
              Conecta tu cuenta de Trakt para sincronizar tus valoraciones.
            </p>
            <button
              onClick={handleConnect}
              className="w-fit rounded-lg bg-amber-500 px-4 py-2 font-medium text-white transition-colors hover:bg-amber-600"
            >
              Conectar con Trakt
            </button>
          </div>
        )}
      </section>

      {/* Sync section */}
      {connected && (
        <section className="mb-6 rounded-xl bg-white p-6 shadow-sm dark:bg-gray-900">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Sincronizar valoraciones
          </h2>

          {/* Last sync info */}
          {(lastSyncDate || totalSynced > 0) && (
            <div className="mb-4 flex flex-wrap gap-4 text-sm text-gray-500">
              {lastSyncDate && (
                <span>
                  Ultima sincronizacion:{" "}
                  {new Date(lastSyncDate).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
              {totalSynced > 0 && (
                <span>Total sincronizadas: {totalSynced}</span>
              )}
            </div>
          )}

          {/* Idle state */}
          {syncStatus === "idle" && (
            <button
              onClick={handleSync}
              className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-white transition-colors hover:bg-amber-600"
            >
              Sincronizar con FilmAffinity
            </button>
          )}

          {/* Scraping state */}
          {syncStatus === "scraping" && (
            <div className="flex items-center gap-3">
              <Spinner className="h-5 w-5" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Obteniendo valoraciones de FilmAffinity...
              </span>
            </div>
          )}

          {/* Diff ready state */}
          {syncStatus === "diff-ready" && syncDiff && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                <span>Total en FilmAffinity: {syncDiff.totalFA}</span>
                <span>Ya sincronizadas: {syncDiff.totalSynced}</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  Nuevas: {syncDiff.newRatings.length}
                </span>
              </div>

              <SyncDiffTable items={syncDiff.newRatings} />

              {syncDiff.newRatings.length > 0 && (
                <div className="flex gap-3">
                  <button
                    onClick={handleConfirm}
                    className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-white transition-colors hover:bg-amber-600"
                  >
                    Confirmar sincronizacion
                  </button>
                  <button
                    onClick={() => {
                      setSyncStatus("idle");
                      setSyncDiff(null);
                    }}
                    className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {syncDiff.newRatings.length === 0 && (
                <button
                  onClick={() => setSyncStatus("idle")}
                  className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Volver
                </button>
              )}
            </div>
          )}

          {/* Confirming state */}
          {syncStatus === "confirming" && (
            <div className="flex items-center gap-3">
              <Spinner className="h-5 w-5" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Sincronizando con Trakt...
              </span>
            </div>
          )}

          {/* Done state */}
          {syncStatus === "done" && syncResult && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/30">
                <p className="font-medium text-green-800 dark:text-green-300">
                  Sincronizacion completada
                </p>
                <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                  {syncResult.syncedCount} valoraciones sincronizadas
                  {syncResult.removedFromWatchlist > 0 &&
                    `, ${syncResult.removedFromWatchlist} quitadas de watchlist`}
                </p>
              </div>
              <button
                onClick={() => {
                  setSyncStatus("idle");
                  setSyncDiff(null);
                  setSyncResult(null);
                }}
                className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Volver al inicio
              </button>
            </div>
          )}

          {/* Error state */}
          {syncStatus === "error" && error && (
            <div className="space-y-4">
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/30">
                <p className="font-medium text-red-800 dark:text-red-300">
                  Error
                </p>
                <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                  {error}
                </p>
              </div>
              <button
                onClick={() => {
                  setError(null);
                  setSyncStatus("idle");
                }}
                className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-white transition-colors hover:bg-amber-600"
              >
                Reintentar
              </button>
            </div>
          )}
        </section>
      )}

      {/* Watchlist section */}
      {connected && (
        <section className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-900">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Mi Watchlist de Trakt
              </h2>
              {watchlist && (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {watchlistTotal}
                </span>
              )}
            </div>
            <button
              onClick={fetchWatchlist}
              disabled={loadingWatchlist}
              className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {loadingWatchlist ? (
                <span className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  Cargando...
                </span>
              ) : (
                "Actualizar watchlist"
              )}
            </button>
          </div>

          {!watchlist && !loadingWatchlist && (
            <p className="text-sm text-gray-500">
              Pulsa &ldquo;Actualizar watchlist&rdquo; para cargar tu watchlist
              de Trakt.
            </p>
          )}

          {watchlist && (
            <div className="space-y-6">
              {/* Available */}
              {watchlist.available.length > 0 && (
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Disponibles ({watchlist.available.length})
                  </h3>
                  <div className="space-y-2">
                    {watchlist.available.map((item) => (
                      <WatchlistItemCard
                        key={`${item.tmdbId}-${item.type}`}
                        item={item}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Unavailable */}
              {watchlist.unavailable.length > 0 && (
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    <span className="h-2 w-2 rounded-full bg-gray-400" />
                    No disponibles ({watchlist.unavailable.length})
                  </h3>
                  <div className="space-y-2">
                    {watchlist.unavailable.map((item) => (
                      <WatchlistItemCard
                        key={`${item.tmdbId}-${item.type}`}
                        item={item}
                      />
                    ))}
                  </div>
                </div>
              )}

              {watchlist.available.length === 0 &&
                watchlist.unavailable.length === 0 && (
                  <p className="py-4 text-center text-gray-500">
                    Tu watchlist esta vacia.
                  </p>
                )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
