#!/usr/bin/env bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────
APP_NAME="FilmSync"
PORT=3000
NODE_MIN=20
URL="http://localhost:${PORT}"

# ── Resolve project root (where this script lives) ───────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colors ────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  BOLD='\033[1m'  DIM='\033[2m'  RESET='\033[0m'
  GREEN='\033[32m'  RED='\033[31m'  YELLOW='\033[33m'  CYAN='\033[36m'
else
  BOLD='' DIM='' RESET='' GREEN='' RED='' YELLOW='' CYAN=''
fi

info()  { printf "${CYAN}${BOLD}▸${RESET} %s\n" "$*"; }
ok()    { printf "${GREEN}${BOLD}✓${RESET} %s\n" "$*"; }
warn()  { printf "${YELLOW}${BOLD}!${RESET} %s\n" "$*"; }
fail()  { printf "${RED}${BOLD}✗${RESET} %s\n" "$*" >&2; exit 1; }

# ── Header ────────────────────────────────────────────────────────
printf "\n${BOLD}  %s${RESET}  ${DIM}v$(node -p "require('./package.json').version" 2>/dev/null || echo '?')${RESET}\n\n" "$APP_NAME"

# ── Prerequisites ─────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || fail "Node.js no encontrado. Instálalo desde https://nodejs.org"
command -v npm  >/dev/null 2>&1 || fail "npm no encontrado."

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if (( NODE_MAJOR < NODE_MIN )); then
  fail "Se requiere Node.js >= ${NODE_MIN} (actual: $(node -v))"
fi
ok "Node $(node -v)"

# ── Environment ───────────────────────────────────────────────────
if [[ ! -f .env.local ]]; then
  fail ".env.local no encontrado. Copia .env.example y rellena las claves."
fi

missing_vars=()
for var in TMDB_API_KEY ANTHROPIC_API_KEY; do
  if ! grep -q "^${var}=.\+" .env.local 2>/dev/null; then
    missing_vars+=("$var")
  fi
done
if (( ${#missing_vars[@]} > 0 )); then
  fail "Variables requeridas sin valor en .env.local: ${missing_vars[*]}"
fi
ok "Variables de entorno"

# ── Dependencies ──────────────────────────────────────────────────
if [[ ! -d node_modules ]] || [[ package.json -nt node_modules/.package-lock.json ]]; then
  info "Instalando dependencias..."
  npm install --loglevel=warn
  ok "Dependencias instaladas"
else
  ok "Dependencias al día"
fi

# ── Port ──────────────────────────────────────────────────────────
if lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  PID=$(lsof -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1)
  CMD=$(ps -p "$PID" -o comm= 2>/dev/null || echo "desconocido")
  warn "Puerto ${PORT} en uso por ${CMD} (PID ${PID})"

  if [[ "$CMD" == *"node"* ]] || [[ "$CMD" == *"next"* ]]; then
    info "Reutilizando servidor existente"
    open "$URL"
    ok "Abierto en ${URL}"
    printf "\n${DIM}  Pulsa cualquier tecla para cerrar esta ventana${RESET}\n"
    read -rsn1
    exit 0
  else
    fail "Puerto ${PORT} ocupado por otro proceso. Libéralo o cambia PORT."
  fi
fi

# ── Graceful shutdown ─────────────────────────────────────────────
cleanup() {
  printf "\n"
  info "Deteniendo ${APP_NAME}..."
  [[ -n "${DEV_PID:-}" ]] && kill "$DEV_PID" 2>/dev/null && wait "$DEV_PID" 2>/dev/null
  ok "Servidor detenido"
  exit 0
}
trap cleanup INT TERM

# ── Launch ────────────────────────────────────────────────────────
info "Iniciando servidor en ${URL}"
npm run dev -- --port "$PORT" &
DEV_PID=$!

# Wait for the server to be ready before opening browser
info "Esperando al servidor..."
for i in $(seq 1 30); do
  if curl -sf "$URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if curl -sf "$URL" >/dev/null 2>&1; then
  ok "Servidor listo"
  open "$URL"
  ok "Abierto en ${URL}"
else
  warn "El servidor tarda en responder — se abrió el navegador igualmente"
  open "$URL"
fi

printf "\n${DIM}  Ctrl+C para detener el servidor${RESET}\n\n"
wait "$DEV_PID"
