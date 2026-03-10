"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2,
  Link as LinkIcon,
  Star,
} from "lucide-react";
import type {
  SyncItem,
  SyncDiff,
  SyncResult,
  TraktWatchlistItem,
} from "@/types";
import { STREAMING_PROVIDERS } from "@/types";

type SyncStatus =
  | "idle"
  | "scraping"
  | "diff-ready"
  | "confirming"
  | "done"
  | "error";

function TypeBadge({ type }: { type: "movie" | "tv" | null }) {
  if (!type) return null;
  const label = type === "movie" ? "Película" : "Serie";
  return (
    <span className="rounded-full bg-background-subtle px-2 py-0.5 text-xs font-medium text-foreground-muted">
      {label}
    </span>
  );
}

function StarRating({ rating10 }: { rating10: number }) {
  const stars = rating10 / 2;
  const fullStars = Math.floor(stars);
  const hasHalf = stars - fullStars >= 0.5;

  return (
    <span className="inline-flex items-center gap-0.5 text-primary">
      {Array.from({ length: 5 }, (_, i) => {
        if (i < fullStars) {
          return (
            <Star
              key={i}
              size={14}
              strokeWidth={1.5}
              className="fill-current"
            />
          );
        }
        if (i === fullStars && hasHalf) {
          return (
            <Star
              key={i}
              size={14}
              strokeWidth={1.5}
              className="fill-current opacity-50"
            />
          );
        }
        return (
          <Star
            key={i}
            size={14}
            strokeWidth={1.5}
            className="text-foreground-subtle"
          />
        );
      })}
      <span className="ml-1 text-xs text-foreground-subtle">({rating10})</span>
    </span>
  );
}

function WatchlistItemCard({ item }: { item: TraktWatchlistItem }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-background-subtle p-3">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-foreground">{item.title}</h4>
          <span className="text-sm text-foreground-subtle">({item.year})</span>
          <TypeBadge type={item.type} />
        </div>
        {item.genres.length > 0 && (
          <p className="mt-1.5 text-xs text-foreground-subtle">
            {item.genres.slice(0, 3).join(" \u00B7 ")}
          </p>
        )}
        {item.providers.length > 0 && (
          <p className="mt-1 text-xs text-foreground-muted">
            {item.providers
              .map((key) => STREAMING_PROVIDERS[key].name)
              .join(", ")}
          </p>
        )}
      </div>
      {item.tmdbRating !== null && (
        <div className="flex-shrink-0 rounded-md bg-primary-muted px-2 py-1">
          <span className="text-sm font-bold text-primary">
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
      <p className="py-8 text-center text-foreground-subtle">
        No hay nuevas valoraciones para sincronizar.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-background-subtle">
          <tr>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-foreground-subtle">
              Título
            </th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-foreground-subtle">
              Año
            </th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-foreground-subtle">
              Valoración
            </th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-foreground-subtle">
              Tipo
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr
              key={`${item.title}-${item.year}`}
              className="transition-colors duration-150 hover:bg-background-subtle"
            >
              <td className="px-4 py-3 font-medium text-foreground">
                {item.title}
              </td>
              <td className="px-4 py-3 text-foreground-muted">{item.year}</td>
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

export function TraktSection() {
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
        throw new Error(errorData.error ?? "Error al confirmar sincronización");
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
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <section className="mb-10 rounded-2xl bg-background-elevated p-8">
        <h2 className="mb-5 font-display text-xl text-foreground">
          Conexión con Trakt
        </h2>
        {connected ? (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="text-sm font-medium text-success">
              Conectado a Trakt
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-foreground-muted">
              Conecta tu cuenta de Trakt para sincronizar tus valoraciones.
            </p>
            <button
              onClick={handleConnect}
              className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-background transition-all duration-200 hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98]"
            >
              <LinkIcon size={16} strokeWidth={1.5} />
              Conectar con Trakt
            </button>
          </div>
        )}
      </section>

      {connected && (
        <section className="mb-10 rounded-2xl bg-background-elevated p-8">
          <h2 className="mb-5 font-display text-xl text-foreground">
            Sincronizar valoraciones
          </h2>

          {(lastSyncDate || totalSynced > 0) && (
            <div className="mb-6 flex flex-wrap gap-4 text-sm text-foreground-muted">
              {lastSyncDate && (
                <span>
                  Última sincronización:{" "}
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

          {syncStatus === "idle" && (
            <button
              onClick={handleSync}
              className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-background transition-all duration-200 hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98]"
            >
              <RefreshCw size={16} strokeWidth={1.5} />
              Sincronizar con FilmAffinity
            </button>
          )}

          {syncStatus === "scraping" && (
            <div className="flex items-center gap-3">
              <Loader2
                size={18}
                strokeWidth={1.5}
                className="animate-spin text-primary"
              />
              <span className="text-sm text-foreground-muted">
                Obteniendo valoraciones de FilmAffinity...
              </span>
            </div>
          )}

          {syncStatus === "diff-ready" && syncDiff && (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-6 text-sm text-foreground-muted">
                <span>Total en FilmAffinity: {syncDiff.totalFA}</span>
                <span>Ya sincronizadas: {syncDiff.totalSynced}</span>
                <span className="font-medium text-foreground">
                  Nuevas: {syncDiff.newRatings.length}
                </span>
              </div>

              <SyncDiffTable items={syncDiff.newRatings} />

              {syncDiff.newRatings.length > 0 && (
                <div className="flex gap-3">
                  <button
                    onClick={handleConfirm}
                    className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-background transition-all duration-200 hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <CheckCircle size={16} strokeWidth={1.5} />
                    Confirmar sincronización
                  </button>
                  <button
                    onClick={() => {
                      setSyncStatus("idle");
                      setSyncDiff(null);
                    }}
                    className="focus-ring rounded-full bg-background-subtle px-5 py-2.5 font-medium text-foreground-muted transition-colors duration-200 hover:bg-border hover:text-foreground"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {syncDiff.newRatings.length === 0 && (
                <button
                  onClick={() => setSyncStatus("idle")}
                  className="focus-ring rounded-full bg-background-subtle px-5 py-2.5 font-medium text-foreground-muted transition-colors duration-200 hover:bg-border hover:text-foreground"
                >
                  Volver
                </button>
              )}
            </div>
          )}

          {syncStatus === "confirming" && (
            <div className="flex items-center gap-3">
              <Loader2
                size={18}
                strokeWidth={1.5}
                className="animate-spin text-primary"
              />
              <span className="text-sm text-foreground-muted">
                Sincronizando con Trakt...
              </span>
            </div>
          )}

          {syncStatus === "done" && syncResult && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 rounded-lg bg-background-subtle p-4">
                <CheckCircle
                  size={20}
                  strokeWidth={1.5}
                  className="mt-0.5 flex-shrink-0 text-success"
                />
                <div>
                  <p className="font-medium text-foreground">
                    Sincronización completada
                  </p>
                  <p className="mt-1 text-sm text-foreground-muted">
                    {syncResult.syncedCount} valoraciones sincronizadas
                    {syncResult.removedFromWatchlist > 0 &&
                      `, ${syncResult.removedFromWatchlist} quitadas de watchlist`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSyncStatus("idle");
                  setSyncDiff(null);
                  setSyncResult(null);
                }}
                className="focus-ring rounded-full bg-background-subtle px-5 py-2.5 font-medium text-foreground-muted transition-colors duration-200 hover:bg-border hover:text-foreground"
              >
                Volver al inicio
              </button>
            </div>
          )}

          {syncStatus === "error" && error && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 rounded-lg bg-error/10 p-4">
                <AlertCircle
                  size={20}
                  strokeWidth={1.5}
                  className="mt-0.5 flex-shrink-0 text-error"
                />
                <div>
                  <p className="font-medium text-error">Error</p>
                  <p className="mt-1 text-sm text-error/80">{error}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setError(null);
                  setSyncStatus("idle");
                }}
                className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-background transition-all duration-200 hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98]"
              >
                Reintentar
              </button>
            </div>
          )}
        </section>
      )}

      {connected && (
        <section className="rounded-2xl bg-background-elevated p-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-xl text-foreground">
                Mi Watchlist de Trakt
              </h2>
              {watchlist && (
                <span className="rounded-full bg-background-subtle px-2.5 py-0.5 text-sm font-medium text-foreground-muted">
                  {watchlistTotal}
                </span>
              )}
            </div>
            <button
              onClick={fetchWatchlist}
              disabled={loadingWatchlist}
              className="focus-ring inline-flex items-center gap-2 rounded-full bg-background-subtle px-4 py-2 text-sm font-medium text-foreground-muted transition-colors duration-200 hover:bg-border hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
            >
              {loadingWatchlist ? (
                <>
                  <Loader2
                    size={14}
                    strokeWidth={1.5}
                    className="animate-spin"
                  />
                  Cargando...
                </>
              ) : (
                <>
                  <RefreshCw size={14} strokeWidth={1.5} />
                  Actualizar watchlist
                </>
              )}
            </button>
          </div>

          {!watchlist && !loadingWatchlist && (
            <p className="text-sm text-foreground-muted">
              Pulsa &ldquo;Actualizar watchlist&rdquo; para cargar tu watchlist
              de Trakt.
            </p>
          )}

          {watchlist && (
            <div className="space-y-8">
              {watchlist.available.length > 0 && (
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-foreground-subtle">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
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

              {watchlist.unavailable.length > 0 && (
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-foreground-subtle">
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground-subtle" />
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
                  <p className="py-8 text-center text-foreground-subtle">
                    Tu watchlist está vacía.
                  </p>
                )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
