# Rediseño del motor de recomendaciones

## Problema

El pipeline actual construye un catálogo de streaming genérico (TMDB discover ordenado por rating) sin relación con los gustos del usuario. Esto produce recomendaciones irrelevantes: documentales, conciertos K-pop, stand-ups, películas asiáticas de nicho. Claude actúa como un mero rankeador de una lista contaminada.

## Solución

Invertir el pipeline: Claude pasa de rankeador a recomendador real. En vez de construir un catálogo genérico y pedir a Claude que lo ordene, se envía a Claude el histórico filtrado del usuario y se le pide que recomiende desde su propio conocimiento cinematográfico. TMDB se usa solo para verificar disponibilidad en streaming.

## Nuevo pipeline

```
Filtros UI (tipo + género + año + plataformas)
    ↓
Filtrar histórico enriquecido (enriched_ratings.json)
    → Solo títulos que coincidan con tipo + género seleccionado
    → Resultado: ~50-150 ratings relevantes
    ↓
Enviar a Claude con prompt cinéfilo experto
    → Claude recomienda ~20 títulos desde su conocimiento
    → Basándose en el patrón de gustos del usuario
    ↓
Verificación TMDB (por cada recomendación)
    → Buscar título exacto + año → obtener tmdbId
    → Verificar disponibilidad en streaming ES
    → Obtener póster, sinopsis, rating TMDB
    → Descartar los no disponibles o no encontrados
    ↓
Devolver recomendaciones verificadas (~14-16 títulos)
```

## Qué desaparece

- `POST /api/streaming` y `discoverStreamingTitles()` — ya no se construye catálogo
- `data/streaming_catalog.json` — eliminado
- `generateTasteProfile()` y `POST /api/profile` — el perfil se construye implícitamente con las ratings filtradas en cada request
- `data/taste_profile.json` — eliminado

## Qué se mantiene

- `POST /api/enrich` — necesario para tener el histórico enriquecido con géneros, directores, keywords
- TMDB como verificador de disponibilidad (`searchMovie`, `searchTV`, `getWatchProviders`)
- Cache de recomendaciones

## Prompt a Claude

Características del nuevo prompt:

- **Rol**: Crítico de cine experto, tono entre cinéfilo y casual
- **Input**: Ratings filtradas del usuario (título, año, director, nota), plataformas, tipo y género
- **Instrucciones clave**:
  - Recomendar desde su conocimiento cinematográfico, no inventar títulos
  - Priorizar títulos que compartan ADN con los mejor puntuados
  - NO recomendar documentales, stand-ups, conciertos, especiales de TV
  - NO recomendar títulos ya vistos por el usuario
  - Explicar por qué cada recomendación encaja, referenciando títulos concretos del histórico
  - Dar 20 recomendaciones con: título exacto, año, director, razón personalizada, score
- **Output**: JSON estructurado

## UI: Filtros simplificados

### Categorías de género (8 en lugar de ~20)

| Categoría UI | Géneros TMDB incluidos |
|---|---|
| Drama | Drama |
| Comedia | Comedia |
| Thriller / Crimen | Crimen, Suspense, Misterio |
| Acción / Aventura | Acción, Aventura |
| Sci-Fi / Fantasía | Ciencia ficción, Fantasía |
| Histórico / Bélico | Historia, Bélica |
| Romance | Romance |
| Animación | Animación |

### Flujo UI

1. Seleccionar tipo: Películas / Series
2. Seleccionar género(s): chips con las 8 categorías
3. Plataformas: chips con las 5 plataformas (preseleccionadas todas)
4. Año mínimo: slider opcional
5. Botón "Recomendar" → loading → resultados con cards

### Filtros eliminados

- `minRating` (TMDB rating) — Claude decide la calidad
- `maxDuration` — poco usado, añade complejidad

## Verificación TMDB

Para cada título recomendado por Claude:

1. Buscar en TMDB por título exacto + año → obtener `tmdbId`
2. Verificar disponibilidad en streaming ES → `getWatchProviders()`
3. Obtener metadata: póster, sinopsis, rating TMDB, runtime
4. Resultados posibles:
   - Encontrado y disponible → se muestra
   - Encontrado pero no disponible → se descarta
   - No encontrado (alucinación) → se descarta

Se piden 20 a Claude asumiendo ~20-30% de descarte → ~14-16 recomendaciones válidas.

## Cache

- Clave: hash de `tipo + géneros + año + plataformas`
- TTL: 7 días (el catálogo de streaming cambia)
- Si el usuario repite la misma búsqueda, no se llama a Claude

## Coste estimado por request

- Input: ~50-150 ratings × ~30 tokens + prompt ~500 tokens = ~2.000-5.000 tokens
- Output: 20 recomendaciones × ~80 tokens = ~1.600 tokens
- Total: ~3.500-6.500 tokens por request (menor que el enfoque actual)
