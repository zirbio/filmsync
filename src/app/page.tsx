"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { AppShell } from "@/components/AppShell";
import { DiscoverView } from "@/components/DiscoverView";
import { LibraryView } from "@/components/LibraryView";
import { ImportModal } from "@/components/ImportModal";

export default function Home() {
  const [hasData, setHasData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    async function checkSetup() {
      try {
        const res = await fetch("/api/enrich");
        if (res.ok) {
          setHasData(true);
        } else {
          setImportOpen(true);
        }
      } catch {
        setImportOpen(true);
      } finally {
        setLoading(false);
      }
    }
    checkSetup();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </motion.div>
      </div>
    );
  }

  const handleImportComplete = () => {
    setHasData(true);
    setImportOpen(false);
  };

  return (
    <>
      <AppShell
        discoverView={
          <DiscoverView
            hasData={hasData}
            onNeedImport={() => setImportOpen(true)}
          />
        }
        libraryView={
          <LibraryView onImport={() => setImportOpen(true)} />
        }
      />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={handleImportComplete}
      />
    </>
  );
}
