"use client";

import { GENRE_CATEGORIES } from "@/types";

interface GenreFilterProps {
  selected: string[];
  onChange: (categories: string[]) => void;
}

export function GenreFilter({ selected = [], onChange }: GenreFilterProps) {
  const categories = Object.keys(GENRE_CATEGORIES);

  const toggle = (category: string) => {
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
