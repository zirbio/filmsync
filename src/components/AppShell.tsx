"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Compass, Library } from "lucide-react";

type Tab = "discover" | "library";

interface AppShellProps {
  discoverView: React.ReactNode;
  libraryView: React.ReactNode;
}

export function AppShell({
  discoverView,
  libraryView,
}: AppShellProps) {
  const [activeTab, setActiveTab] = useState<Tab>("discover");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "discover",
      label: "Descubrir",
      icon: <Compass size={20} strokeWidth={1.5} />,
    },
    {
      id: "library",
      label: "Mi Biblioteca",
      icon: <Library size={20} strokeWidth={1.5} />,
    },
  ];

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      {/* Desktop header */}
      <header className="sticky top-0 z-40 hidden border-b border-border bg-background/80 backdrop-blur-md md:block">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-4">
          <h1 className="font-display text-2xl tracking-tight text-foreground">
            FilmSync
          </h1>
          <nav className="relative flex gap-1" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`focus-ring relative rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                  activeTab === tab.id
                    ? "text-foreground"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute inset-x-2 -bottom-[17px] h-0.5 bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content — both views always mounted */}
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-16">
        <motion.div
          animate={{
            opacity: activeTab === "discover" ? 1 : 0,
            x: activeTab === "discover" ? 0 : -20,
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={{ display: activeTab === "discover" ? "block" : "none" }}
        >
          {discoverView}
        </motion.div>
        <motion.div
          animate={{
            opacity: activeTab === "library" ? 1 : 0,
            x: activeTab === "library" ? 0 : 20,
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={{ display: activeTab === "library" ? "block" : "none" }}
        >
          {libraryView}
        </motion.div>
      </main>

      {/* Mobile bottom bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background-elevated md:hidden"
        role="tablist"
      >
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`focus-ring flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors duration-200 ${
                activeTab === tab.id
                  ? "text-primary"
                  : "text-foreground-muted"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
