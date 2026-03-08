"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, AlertCircle, CheckCircle } from "lucide-react";

interface SetupPanelProps {
  onComplete: () => void;
}

type SetupStep = "idle" | "enriching" | "done" | "error";

export function SetupPanel({ onComplete }: SetupPanelProps) {
  const [step, setStep] = useState<SetupStep>("idle");
  const [message, setMessage] = useState("");

  const runSetup = async () => {
    try {
      setStep("enriching");
      setMessage("Enriqueciendo tus valoraciones con datos de TMDB...");
      const enrichRes = await fetch("/api/enrich", { method: "POST" });
      const enrichData = await enrichRes.json();
      if (!enrichRes.ok) throw new Error(enrichData.error);

      setStep("done");
      setMessage(`${enrichData.total} películas enriquecidas correctamente.`);
      setTimeout(onComplete, 1500);
    } catch (error) {
      setStep("error");
      setMessage(
        error instanceof Error ? error.message : "Error desconocido"
      );
    }
  };

  return (
    <motion.div
      className="mx-auto max-w-xl px-4 py-24 text-center"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
    >
      <h2 className="font-display text-4xl tracking-tight text-foreground md:text-5xl">
        Configuracion inicial
      </h2>
      <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-foreground-muted">
        Necesitamos enriquecer tus valoraciones de FilmAffinity con datos de
        TMDB. Esto solo se hace una vez.
      </p>

      <div className="mt-12">
        <AnimatePresence mode="wait">
          {step === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <button
                onClick={runSetup}
                className="focus-ring inline-flex items-center gap-2.5 rounded-full bg-primary px-8 py-3.5 font-semibold text-background transition-all duration-200 hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98]"
              >
                <Sparkles size={18} strokeWidth={1.5} />
                Iniciar configuracion
              </button>
            </motion.div>
          )}

          {step === "enriching" && (
            <motion.div
              key="loading"
              className="space-y-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-foreground-muted">{message}</p>
            </motion.div>
          )}

          {step === "done" && (
            <motion.div
              key="done"
              className="flex items-center justify-center gap-2 text-success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <CheckCircle size={20} strokeWidth={1.5} />
              <span className="font-medium">{message}</span>
            </motion.div>
          )}

          {step === "error" && (
            <motion.div
              key="error"
              className="space-y-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center justify-center gap-2 text-error">
                <AlertCircle size={20} strokeWidth={1.5} />
                <span>{message}</span>
              </div>
              <button
                onClick={() => setStep("idle")}
                className="focus-ring rounded-full bg-background-elevated px-5 py-2.5 text-sm font-medium text-foreground-muted transition-colors duration-200 hover:bg-background-subtle hover:text-foreground"
              >
                Reintentar
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
