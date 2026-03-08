"use client";

import { STREAMING_PROVIDERS, type StreamingProviderKey } from "@/types";

interface PlatformFilterProps {
  selected: StreamingProviderKey[];
  onChange: (providers: StreamingProviderKey[]) => void;
}

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
              className={`focus-ring rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
                isSelected
                  ? "bg-foreground text-background"
                  : "bg-background-subtle text-foreground-muted hover:bg-border hover:text-foreground"
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
