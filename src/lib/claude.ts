import Anthropic from "@anthropic-ai/sdk";
import type {
  EnrichedRating,
  TasteProfile,
  StreamingTitle,
  Recommendation,
} from "@/types";

function getClient(): Anthropic {
  return new Anthropic();
}

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  return text.trim();
}

export async function generateTasteProfile(
  ratings: EnrichedRating[]
): Promise<TasteProfile> {
  const client = getClient();

  const sorted = [...ratings]
    .filter((r) => r.tmdbId !== null)
    .sort((a, b) => b.rating10 - a.rating10);

  const ratingsText = sorted
    .map(
      (r) =>
        `- "${r.title}" (${r.year}) — Nota: ${r.rating10}/10 — Generos: ${r.genres.join(", ") || "N/A"} — Director: ${r.directors} — Temas: ${r.keywords.slice(0, 5).join(", ") || "N/A"}`
    )
    .join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Eres un experto en cine y series. Analiza las siguientes valoraciones de un usuario y genera un perfil detallado de sus gustos cinematograficos.

VALORACIONES DEL USUARIO (${sorted.length} titulos, ordenados de mayor a menor nota):

${ratingsText}

Genera un perfil de gustos en formato JSON con esta estructura exacta:
{
  "preferred_genres": ["lista de generos preferidos, ordenados por preferencia"],
  "preferred_directors": ["lista de directores favoritos basado en las notas altas"],
  "preferred_themes": ["temas y tematicas recurrentes en sus favoritos"],
  "preferred_decades": ["decadas preferidas"],
  "avoid_patterns": ["patrones que no le gustan, basado en notas bajas"],
  "taste_summary": "Un parrafo describiendo el perfil cinematografico del usuario, su estilo, lo que busca en una pelicula/serie, patrones interesantes"
}

Responde SOLO con el JSON, sin texto adicional.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const profile: TasteProfile = {
    ...JSON.parse(extractJSON(content.text)),
    generated_at: new Date().toISOString(),
  };

  return profile;
}

export async function generateRecommendations(
  profile: TasteProfile,
  availableTitles: StreamingTitle[],
  watchedTitles: string[]
): Promise<Recommendation[]> {
  const client = getClient();

  const titlesText = availableTitles
    .map(
      (t, i) =>
        `${i + 1}. "${t.title}" (${t.year}) — ${t.type === "movie" ? "Pelicula" : "Serie"} — Generos: ${t.genres.join(", ")} — Director: ${t.directors.join(", ")} — TMDB: ${t.tmdbRating}/10 — Plataformas: ${t.providers.join(", ")} — Sinopsis: ${t.overview.slice(0, 150)}`
    )
    .join("\n");

  const watchedText =
    watchedTitles.length > 0
      ? `\nTITULOS YA VISTOS (NO recomendar estos):\n${watchedTitles.join(", ")}`
      : "";

  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `Eres un experto en recomendaciones de cine y series. Basandote en el perfil de gustos de un usuario, recomienda las mejores peliculas y series de la lista disponible.

PERFIL DE GUSTOS DEL USUARIO:
${JSON.stringify(profile, null, 2)}
${watchedText}

TITULOS DISPONIBLES EN STREAMING:
${titlesText}

Selecciona los 20 titulos que MEJOR encajan con los gustos del usuario. Para cada uno, explica brevemente POR QUE le gustaria a este usuario en particular.

Responde en formato JSON con esta estructura exacta:
[
  {
    "index": 1,
    "score": 95,
    "reason": "Explicacion personalizada de por que le gustaria"
  }
]

Donde "index" es el numero del titulo en la lista (empezando en 1), "score" es tu confianza de 0-100 de que le gustara, y "reason" es la explicacion.

Ordena de mayor a menor score. Responde SOLO con el JSON.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const parsed: { index: number; score: number; reason: string }[] = JSON.parse(
    extractJSON(content.text)
  );

  return parsed
    .map((item) => {
      const title = availableTitles[item.index - 1];
      if (!title) return null;
      return {
        title,
        reason: item.reason,
        score: item.score,
      };
    })
    .filter((r): r is Recommendation => r !== null);
}
