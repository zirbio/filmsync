"use client";

import { GENRE_CATEGORIES } from "@/types";
import type { GenreCategory } from "@/types";

interface GenreFilterProps {
  selected: GenreCategory[];
  onChange: (categories: GenreCategory[]) => void;
}

const categories = Object.keys(GENRE_CATEGORIES) as GenreCategory[];

export function GenreFilter({ selected = [], onChange }: GenreFilterProps) {
  const toggle = (category: GenreCategory) => {
    if (selected.includes(category)) {
      onChange(selected.filter((c) => c !== category));
    } else {
      onChange([...selected, category]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => {
        const isSelected = selected.includes(category);
        return (
          <button
            key={category}
            onClick={() => toggle(category)}
            className={`focus-ring rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
              isSelected
                ? "bg-primary text-background"
                : "bg-background-subtle text-foreground-muted hover:bg-border hover:text-foreground"
            }`}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}
