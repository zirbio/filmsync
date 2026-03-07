"use client";

interface GenreFilterProps {
  genres: string[];
  selected: string[];
  onChange: (genres: string[]) => void;
}

export function GenreFilter({ genres, selected, onChange }: GenreFilterProps) {
  const toggle = (genre: string) => {
    if (selected.includes(genre)) {
      onChange(selected.filter((g) => g !== genre));
    } else {
      onChange([...selected, genre]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {genres.map((genre) => {
        const isSelected = selected.includes(genre);
        return (
          <button
            key={genre}
            onClick={() => toggle(genre)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
              isSelected
                ? "bg-amber-500 text-white"
                : "bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300"
            }`}
          >
            {genre}
          </button>
        );
      })}
    </div>
  );
}
