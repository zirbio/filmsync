"use client";

import { useState } from "react";

interface SetupPanelProps {
  onComplete: () => void;
}

type SetupStep = "idle" | "enriching" | "profiling" | "done" | "error";

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
      setMessage(
        `Enriquecidas ${enrichData.total} peliculas (${enrichData.notFound} no encontradas en TMDB).`
      );

      setStep("profiling");
      setMessage("Generando tu perfil de gustos con IA...");
      const profileRes = await fetch("/api/profile", { method: "POST" });
      const profileData = await profileRes.json();
      if (!profileRes.ok) throw new Error(profileData.error);

      setStep("done");
      setMessage("Perfil generado correctamente.");
      setTimeout(onComplete, 1500);
    } catch (error) {
      setStep("error");
      setMessage(
        error instanceof Error ? error.message : "Error desconocido"
      );
    }
  };

  return (
    <div className="mx-auto max-w-lg rounded-xl bg-white p-8 text-center shadow-lg dark:bg-gray-900">
      <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
        Configuracion inicial
      </h2>
      <p className="mb-6 text-gray-600 dark:text-gray-400">
        Necesitamos enriquecer tus valoraciones de FilmAffinity con datos de
        TMDB y generar tu perfil de gustos. Esto solo se hace una vez.
      </p>

      {step === "idle" && (
        <button
          onClick={runSetup}
          className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-8 py-3 font-semibold text-white shadow-lg transition-all hover:shadow-xl"
        >
          Iniciar configuracion
        </button>
      )}

      {(step === "enriching" || step === "profiling") && (
        <div className="space-y-3">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
          <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
        </div>
      )}

      {step === "done" && (
        <p className="font-medium text-green-600">{message}</p>
      )}

      {step === "error" && (
        <div className="space-y-3">
          <p className="text-red-600">{message}</p>
          <button
            onClick={() => setStep("idle")}
            className="rounded-lg bg-gray-200 px-4 py-2 text-sm dark:bg-gray-700"
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
