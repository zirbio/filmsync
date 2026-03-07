# Recomendador de Peliculas - Design Document

## Objetivo

Sistema de recomendacion de peliculas y series personalizado basado en las valoraciones del usuario en FilmAffinity (743 ratings en CSV). Las recomendaciones se limitan a titulos disponibles actualmente en servicios de streaming espanoles.

## Stack tecnologico

- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS** para estilos
- **Claude API** (Anthropic SDK) como motor de recomendacion
- **TMDB API** para metadatos y disponibilidad en streaming

## Arquitectura

```
Next.js App
  UI (React) -> API Routes (/api/*) -> Data Layer
                     |
         +-----------+-----------+
         v           v           v
    TMDB API    Claude API    CSV Parser
```

Sin base de datos. Los datos se cachean en archivos JSON locales en `/data/`.

## Fuente de datos

### CSV de FilmAffinity

Columnas: `Title`, `Year`, `Directors`, `WatchedDate`, `Rating` (1-5), `Rating10` (1-10)

### TMDB API

- Enriquecimiento de ratings: busqueda por titulo + anyo -> generos, sinopsis, keywords, reparto, poster, nota media
- Catalogo streaming: `/discover/movie` y `/discover/tv` con `watch_region=ES` y `with_watch_providers`
- Proveedores: Netflix=8, Prime=119, HBO Max=384, Disney+=337, Apple TV+=350

## Motor de recomendacion: LLM directo (Claude)

### Fase 1: Perfil de gustos (se ejecuta una vez, se cachea)

Enviar a Claude las 743 valoraciones enriquecidas con metadatos TMDB. Claude genera un perfil de gustos estructurado:

```json
{
  "preferred_genres": ["thriller psicologico", "drama", "sci-fi"],
  "preferred_directors": ["PTA", "Bong Joon-ho", "Kubrick"],
  "preferred_themes": ["dilemas morales", "personajes complejos"],
  "preferred_decades": ["2020s", "1990s"],
  "avoid_patterns": ["comedias romanticas genericas"],
  "taste_summary": "Texto libre describiendo el perfil..."
}
```

Se guarda en `data/taste_profile.json`.

### Fase 2: Recomendacion (por cada consulta)

1. Pre-filtrar catalogo de streaming via TMDB (por plataformas seleccionadas, generos preferidos, filtros del usuario)
2. Enviar a Claude: perfil de gustos + lista de ~50-100 titulos disponibles
3. Claude devuelve ranking de 20 mejores con explicacion personalizada de por que cada uno encaja

### Cache

Las recomendaciones se cachean. Solo se recalculan si:
- Cambian las plataformas seleccionadas
- El usuario pulsa "Refrescar recomendaciones"
- Se actualiza el CSV de valoraciones

## Interfaz de usuario

### Filtros

- **Plataformas:** Toggles con logos (Netflix, HBO Max, Prime Video, Apple TV+, Disney+)
- **Tipo:** Peliculas / Series / Todo
- **Genero:** Multi-select con generos TMDB
- **Anyo minimo:** Selector
- **Nota minima TMDB:** Slider (ej: >= 7.0)
- **Duracion:** Corta (<90min) / Media / Larga (>150min) - solo peliculas

### Cards de recomendacion

Cada card muestra:
- Poster (desde TMDB)
- Titulo
- Nota TMDB
- Plataforma de streaming (con logo)
- Generos, anyo, director
- Explicacion personalizada de por que se recomienda
- Boton "Ya la vi" para excluir de futuras recomendaciones

### Responsive

Diseno adaptable a movil y desktop.

## Estructura del proyecto

```
recomendador-peliculas/
  src/
    app/
      page.tsx                    # Pagina principal
      layout.tsx                  # Layout
      api/
        recommendations/          # Generar recomendaciones
        enrich/                   # Enriquecer CSV con TMDB
        profile/                  # Generar perfil de gustos
        streaming/                # Consultar catalogo streaming
    components/
      RecommendationCard.tsx
      PlatformFilter.tsx
      GenreFilter.tsx
      Filters.tsx
    lib/
      tmdb.ts                    # Cliente TMDB
      claude.ts                  # Cliente Claude
      csv-parser.ts              # Parsear FilmAffinity CSV
      cache.ts                   # Gestion de cache JSON
    types/
      index.ts                   # Tipos TypeScript
  data/
    filmaffinity_ratings.csv
    enriched_ratings.json
    taste_profile.json
    recommendations_cache.json
  .env.local                     # TMDB_API_KEY, ANTHROPIC_API_KEY
  package.json
```

## Flujo de usuario

1. Primera vez: ejecutar enriquecimiento (CSV -> TMDB) + generar perfil de gustos (Claude)
2. Abrir la app -> ver recomendaciones cacheadas o generar nuevas
3. Seleccionar plataformas y filtros -> pulsar "Generar recomendaciones"
4. Claude analiza perfil + catalogo filtrado -> 20 recomendaciones rankeadas con explicacion
5. Marcar "Ya la vi" para excluir titulos de futuras recomendaciones

## Actualizacion

Manual bajo demanda. El usuario decide cuando refrescar datos de streaming y recalcular recomendaciones.
