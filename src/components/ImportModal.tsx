"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, FileUp, Globe, AlertCircle, CheckCircle } from "lucide-react";

type ImportStep = "choose" | "csv" | "scraper" | "progress" | "done" | "error";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function ImportModal({ open, onClose, onComplete }: ImportModalProps) {
  const [step, setStep] = useState<ImportStep>("choose");
  const [userId, setUserId] = useState("");
  const [progress, setProgress] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<{
    total: number;
    notFound: number;
  } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    const timer = setTimeout(() => {
      modalRef.current
        ?.querySelector<HTMLElement>("button, input")
        ?.focus();
    }, 100);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
      triggerRef.current?.focus();
    };
  }, [open, onClose]);

  const reset = useCallback(() => {
    setStep("choose");
    setUserId("");
    setProgress("");
    setErrorMessage("");
    setResult(null);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setErrorMessage("El archivo debe ser un CSV (.csv)");
      setStep("error");
      return;
    }

    setStep("progress");
    setProgress("Subiendo archivo...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/enrich", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Error al procesar el CSV");

      setResult({ total: data.total, notFound: data.notFound ?? 0 });
      setStep("done");
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "El archivo no es un CSV válido de FilmAffinity."
      );
      setStep("error");
    }
  };

  const handleScrape = async () => {
    if (!userId.trim()) return;

    setStep("progress");
    setProgress("Importando desde FilmAffinity...");

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 500 && data.error?.includes("not available")) {
          throw new Error(
            "La herramienta de scraping no está disponible. Usa la opción de subir CSV."
          );
        }
        throw new Error(
          data.error ?? "No se pudo acceder al perfil de FilmAffinity."
        );
      }

      setResult({ total: data.total, notFound: data.notFound ?? 0 });
      setStep("done");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Error desconocido"
      );
      setStep("error");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />

          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-modal-title"
            className="relative w-full max-w-lg rounded-2xl bg-background-elevated p-8 shadow-elevated"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <div className="mb-8 flex items-center justify-between">
              <h2
                id="import-modal-title"
                className="font-display text-2xl tracking-tight text-foreground"
              >
                Importar valoraciones
              </h2>
              <button
                onClick={handleClose}
                className="focus-ring rounded-lg p-2 text-foreground-muted transition-colors duration-200 hover:bg-background-subtle hover:text-foreground"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>

            {step === "choose" && (
              <div className="space-y-4">
                <button
                  onClick={() => setStep("csv")}
                  className="focus-ring flex w-full items-start gap-4 rounded-xl border border-border p-5 text-left transition-all duration-200 hover:border-primary hover:bg-primary-muted/30"
                >
                  <FileUp
                    size={24}
                    strokeWidth={1.5}
                    className="mt-0.5 flex-shrink-0 text-primary"
                  />
                  <div>
                    <h3 className="font-medium text-foreground">
                      Subir archivo CSV
                    </h3>
                    <p className="mt-1 text-sm text-foreground-muted">
                      Exporta tus valoraciones desde FilmAffinity y sube el
                      archivo CSV
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => setStep("scraper")}
                  className="focus-ring flex w-full items-start gap-4 rounded-xl border border-border p-5 text-left transition-all duration-200 hover:border-primary hover:bg-primary-muted/30"
                >
                  <Globe
                    size={24}
                    strokeWidth={1.5}
                    className="mt-0.5 flex-shrink-0 text-primary"
                  />
                  <div>
                    <h3 className="font-medium text-foreground">
                      Importar desde FilmAffinity
                    </h3>
                    <p className="mt-1 text-sm text-foreground-muted">
                      Introduce tu nombre de usuario de FilmAffinity
                    </p>
                  </div>
                </button>
              </div>
            )}

            {step === "csv" && (
              <div className="space-y-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`focus-ring cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200 ${
                    dragActive
                      ? "border-primary bg-primary-muted/20"
                      : "border-border hover:border-foreground-subtle"
                  }`}
                >
                  <FileUp
                    size={32}
                    strokeWidth={1.5}
                    className="mx-auto text-foreground-muted"
                  />
                  <p className="mt-3 text-sm text-foreground-muted">
                    Arrastra tu archivo CSV aquí o haz click para seleccionar
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file);
                    }}
                  />
                </div>
                <button
                  onClick={() => setStep("choose")}
                  className="focus-ring text-sm text-foreground-muted transition-colors duration-200 hover:text-foreground"
                >
                  &larr; Volver
                </button>
              </div>
            )}

            {step === "scraper" && (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="fa-user-id"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Nombre de usuario de FilmAffinity
                  </label>
                  <input
                    id="fa-user-id"
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleScrape()}
                    placeholder="mi_usuario"
                    className="focus-ring w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-foreground-subtle"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setStep("choose")}
                    className="focus-ring text-sm text-foreground-muted transition-colors duration-200 hover:text-foreground"
                  >
                    &larr; Volver
                  </button>
                  <button
                    onClick={handleScrape}
                    disabled={!userId.trim()}
                    className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-background transition-all duration-200 hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Importar
                  </button>
                </div>
              </div>
            )}

            {step === "progress" && (
              <div className="space-y-6 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-foreground-muted">{progress}</p>
              </div>
            )}

            {step === "done" && result && (
              <div className="space-y-6 text-center">
                <div className="flex items-center justify-center gap-2 text-success">
                  <CheckCircle size={20} strokeWidth={1.5} />
                  <span className="font-medium">Importación completada</span>
                </div>
                <p className="text-sm text-foreground-muted">
                  Se importaron {result.total - result.notFound} de{" "}
                  {result.total} títulos.
                  {result.notFound > 0 &&
                    ` ${result.notFound} no se encontraron en TMDB.`}
                </p>
                <button
                  onClick={() => {
                    handleClose();
                    onComplete();
                  }}
                  className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-background transition-all duration-200 hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98]"
                >
                  Ver mi colección
                </button>
              </div>
            )}

            {step === "error" && (
              <div className="space-y-6 text-center">
                <div className="flex items-center justify-center gap-2 text-error">
                  <AlertCircle size={20} strokeWidth={1.5} />
                  <span className="font-medium">Error</span>
                </div>
                <p className="text-sm text-error/80">{errorMessage}</p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={reset}
                    className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-background transition-all duration-200 hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
