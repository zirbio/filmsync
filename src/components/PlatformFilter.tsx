"use client";

import { STREAMING_PROVIDERS, type StreamingProviderKey } from "@/types";

interface PlatformFilterProps {
  selected: StreamingProviderKey[];
  onChange: (providers: StreamingProviderKey[]) => void;
}

const PROVIDER_COLORS: Record<StreamingProviderKey, string> = {
  netflix: "bg-red-600",
  hbo: "bg-purple-700",
  prime: "bg-blue-500",
  disney: "bg-blue-700",
  apple: "bg-gray-800",
};

export function PlatformFilter({ selected, onChange }: PlatformFilterProps) {
  const toggle = (key: StreamingProviderKey) => {
    if (selected.includes(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(STREAMING_PROVIDERS) as StreamingProviderKey[]).map(
        (key) => {
          const provider = STREAMING_PROVIDERS[key];
          const isSelected = selected.includes(key);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                isSelected
                  ? `${PROVIDER_COLORS[key]} text-white shadow-lg`
                  : "bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              {provider.name}
            </button>
          );
        }
      )}
    </div>
  );
}
