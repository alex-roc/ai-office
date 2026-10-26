#!/usr/bin/env bash
# Monta la página del proyecto (GitHub Pages) en `_site/`:
#
#   _site/            <- site/ (la landing, HTML+CSS+JS sin build)
#   _site/sprites/    <- apps/web/public/sprites (una sola copia del arte, la de la interfaz)
#   _site/demo/       <- la interfaz compilada en modo demo estático (VITE_DEMO=1), con el
#                        snapshot de la instalación ficticia generado en este mismo momento
#
# El snapshot se genera en cada build y no se versiona: el grado de una skill caduca a 90 días,
# así que una demo congelada se iría apagando sola hasta quedar toda en gris.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"
OUT="$ROOT/_site"

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$ROOT/site/." "$OUT/"
mkdir -p "$OUT/sprites"
cp "$ROOT"/apps/web/public/sprites/*.png "$OUT/sprites/"

echo "==> demo estática de la interfaz"
SNAP_DIR="$(mktemp -d)"
node "$ROOT/scripts/demo-snapshot.ts" "$SNAP_DIR/snapshot.json"
VITE_DEMO=1 pnpm --filter @ai-office/web exec vite build --base ./ --outDir "$OUT/demo" --emptyOutDir
mkdir -p "$OUT/demo/demo"
cp "$SNAP_DIR/snapshot.json" "$OUT/demo/demo/snapshot.json"
rm -rf "$SNAP_DIR"

touch "$OUT/.nojekyll"
echo "✓ página montada en _site/ (sírvela con: npx serve _site, o python3 -m http.server -d _site)"
