"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Undo2 } from "lucide-react";
import { TitleCard } from "@/components/TitleCard";
import type { WatchedItem } from "@/types";

export function WatchedList() {
  const [items, setItems] = useState<WatchedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/watched");
        if (res.ok) {
          const data = await res.json();
          setItems(data.watched ?? []);
        }
      } catch {
        // Failed to load
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleRestore = async (tmdbId: number, type: string) => {
    await fetch("/api/watched", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId, type, action: "remove" }),
    });
    setItems((prev) =>
      prev.filter(
        (item) => `${item.tmdbId}-${item.type}` !== `${tmdbId}-${type}`
      )
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="font-display text-xl text-foreground-subtle">
          Cuando descartes una recomendación con &ldquo;Ya la vi&rdquo;,
          aparecerá aquí
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-8 font-display text-xl text-foreground">
        {items.length} títulos vistos
      </h2>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item, index) => (
          <motion.div
            key={`${item.tmdbId}-${item.type}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.4,
              delay: Math.min(index * 0.05, 0.4),
              ease: "easeOut",
            }}
          >
            <TitleCard
              poster={item.posterPath}
              title={item.title}
              year={item.year}
              directors={item.directors}
              genres={item.genres}
              type={item.type}
              tmdbScore={item.tmdbRating ?? undefined}
            >
              <button
                onClick={() => handleRestore(item.tmdbId, item.type)}
                className="focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-foreground-muted transition-all duration-200 hover:bg-background-elevated hover:text-foreground"
              >
                <Undo2 size={14} strokeWidth={1.5} />
                Restaurar
              </button>
            </TitleCard>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
