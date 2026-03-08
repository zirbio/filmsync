import Anthropic from "@anthropic-ai/sdk";
import type { EnrichedRating, ClaudeRecommendation } from "@/types";

function getClient(): Anthropic {
  return new Anthropic();
}

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  return text.trim();
}

export async function generateRecommendations(
  filteredRatings: EnrichedRating[],
  filters: {
    type: "movie" | "tv";
    genreCategories: string[];
    platforms: string[];
  }
): Promise<ClaudeRecommendation[]> {
  const client = getClient();

  const typeLabel = filters.type === "movie" ? "películas" : "series";
  const genreLabel =
    filters.genreCategories.length > 0
      ? filters.genreCategories.join(", ")
      : "todos los géneros";
  const platformLabel = filters.platforms.join(", ");

  const ratingsText = filteredRatings
    .map(
      (r) =>
        `- "${r.title}" (${r.year}) — Director: ${r.directors} — Nota: ${r.rating10}/10`
    )
    .join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `Eres un crítico de cine experto con conocimiento enciclopédico del cine y las series. Tu tarea es recomendar ${typeLabel} a un usuario basándote en su historial de valoraciones.

HISTORIAL DEL USUARIO (${filteredRatings.length} títulos de ${genreLabel} que ha valorado, ordenados de mayor a menor nota):

${ratingsText}

INSTRUCCIONES:
- Recomienda exactamente 20 ${typeLabel} del género ${genreLabel} que estén disponibles en streaming en España (${platformLabel}).
- Basa tus recomendaciones en tu propio conocimiento cinematográfico. NO inventes títulos que no existan.
- Prioriza títulos que compartan ADN con los que el usuario puntuó más alto: mismo director, misma escuela cinematográfica, temáticas afines, tono similar.
- NO recomiendes documentales, stand-ups, conciertos, especiales de TV ni programas de telerrealidad.
- NO recomiendes ningún título que aparezca en el historial del usuario.
- En la explicación, referencia títulos concretos del historial del usuario. Ejemplo: "Si te gustó Goodfellas por su retrato del crimen organizado, esta te enganchará por...".
- Sé honesto: si no estás seguro de que un título esté disponible en streaming en España, inclúyelo igualmente con un score más bajo.
- El tono de las explicaciones debe ser entre cinéfilo y casual, como un amigo que sabe mucho de cine.

Responde SOLO con un JSON array con esta estructura exacta:
[
  {
    "title": "Título exacto de la película/serie",
    "year": 2024,
    "director": "Nombre del director",
    "reason": "Explicación personalizada de por qué le gustará",
    "score": 90
  }
]

Ordena de mayor a menor score. Responde SOLO con el JSON, sin texto adicional.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  return JSON.parse(extractJSON(content.text)) as ClaudeRecommendation[];
}
