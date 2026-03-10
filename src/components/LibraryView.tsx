"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { CollectionGrid } from "@/components/CollectionGrid";
import { WatchedList } from "@/components/WatchedList";
import { TraktSection } from "@/components/TraktSection";

type LibraryTab = "collection" | "watched" | "trakt";

interface LibraryViewProps {
  onImport: () => void;
}

export function LibraryView({ onImport }: LibraryViewProps) {
  const [activeSection, setActiveSection] =
    useState<LibraryTab>("collection");

  const sections: { id: LibraryTab; label: string }[] = [
    { id: "collection", label: "Mi colección" },
    { id: "watched", label: "Vistos" },
    { id: "trakt", label: "Trakt" },
  ];

  return (
    <div>
      {/* Segmented control */}
      <div className="mb-10 inline-flex rounded-lg bg-background-subtle p-1">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`focus-ring relative rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 ${
              activeSection === section.id
                ? "text-foreground"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {activeSection === section.id && (
              <motion.div
                layoutId="library-pill"
                className="absolute inset-0 rounded-md bg-background-elevated"
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}
            <span className="relative z-10">{section.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeSection === "collection" && (
        <CollectionGrid onImport={onImport} />
      )}
      {activeSection === "watched" && <WatchedList />}
      {activeSection === "trakt" && <TraktSection />}
    </div>
  );
}
