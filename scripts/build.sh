#!/usr/bin/env bash
# Build reproducible del paquete npm `ai-office` (packages/cli).
#
# Tres pasos, en orden: compila la interfaz web con Vite, transpila el CLI (con
# core+providers+daemon inlinados) con tsdown en modo `unbundle`, y copia sin tocar lo que no
# debe pasar por ningún bundler: el relay de hooks y los estáticos de la web ya compilados.
#
# `unbundle` preserva la profundidad de carpetas del monorepo dentro de `packages/cli/dist/`
# porque dos archivos calculan rutas relativas a mano con `import.meta.url`
# (`packages/daemon/src/server.ts` para servir la web, `packages/cli/src/commands/hooks.ts` para
# encontrar el relay) y no se tocan aquí: ver tsdown.config.ts para el porqué.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"

fail() {
  echo "✗ $1" >&2
  exit 1
}

echo "==> [1/3] interfaz web (vite build)"
pnpm --filter @ai-office/web build
[ -f "$ROOT/apps/web/dist/index.html" ] || fail "apps/web/dist/index.html no existe tras el build de la web"

echo "==> [2/3] CLI (tsdown --unbundle: core+providers+daemon+cli -> JS, preservando la estructura)"
rm -rf "$ROOT/packages/cli/dist"
pnpm exec tsdown

CLI_BIN="$ROOT/packages/cli/dist/packages/cli/src/index.mjs"
[ -f "$CLI_BIN" ] || fail "tsdown no generó $CLI_BIN"
[ -f "$ROOT/packages/cli/dist/packages/daemon/src/server.mjs" ] || fail "falta packages/daemon/src/server.mjs en el dist"

echo "==> [3/3] copiar tal cual lo que no pasa por ningún bundler"

# El relay: JavaScript plano sin dependencias, es lo que Claude Code ejecuta en cada hook.
mkdir -p "$ROOT/packages/cli/dist/packages/hook-relay/bin"
cp "$ROOT/packages/hook-relay/bin/ai-office-hook.mjs" \
  "$ROOT/packages/cli/dist/packages/hook-relay/bin/ai-office-hook.mjs"

# Los estáticos de la web: ya compilados por vite en el paso 1.
mkdir -p "$ROOT/packages/cli/dist/apps/web"
rm -rf "$ROOT/packages/cli/dist/apps/web/dist"
cp -R "$ROOT/apps/web/dist" "$ROOT/packages/cli/dist/apps/web/dist"

# README y LICENSE: `files` en package.json solo puede listar rutas dentro de packages/cli/, así
# que se copian aquí las del repo (que ya se leen igual en GitHub y en el registro de npm).
cp "$ROOT/README.md" "$ROOT/packages/cli/README.md"
cp "$ROOT/LICENSE" "$ROOT/packages/cli/LICENSE"

echo "✓ build listo: packages/cli/dist/ (ejecuta scripts/verificar-paquete.sh para comprobarlo)"
