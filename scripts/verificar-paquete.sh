#!/usr/bin/env bash
# Prueba de verdad de que `npx ai-office` funciona, SIN publicar nada.
#
# `npm pack` genera el tarball tal y como saldría al registro; se audita su contenido (nada de
# node_modules, transcripts, ~/.claude o basura de más) y luego se instala con npm normal (no
# pnpm: así se prueba la resolución de dependencias que va a usar quien lo instale) en un
# directorio temporal, fuera del monorepo, para comprobar que arranca sin el resto del repo
# alrededor.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"
CLI_DIR="$ROOT/packages/cli"

fail() {
  echo "✗ $1" >&2
  exit 1
}
ok() { echo "  ✓ $1"; }

[ -f "$CLI_DIR/dist/packages/cli/src/index.mjs" ] || fail "no hay build: corre 'pnpm build' primero"

echo "==> [1/4] npm pack"
PACK_DIR="$(mktemp -d)"
TARBALL="$(cd "$CLI_DIR" && npm pack --pack-destination "$PACK_DIR" --silent)"
TARBALL_PATH="$PACK_DIR/$TARBALL"
[ -f "$TARBALL_PATH" ] || fail "npm pack no generó un tarball"

SIZE_BYTES="$(stat -f%z "$TARBALL_PATH" 2>/dev/null || stat -c%s "$TARBALL_PATH")"
SIZE_KB=$((SIZE_BYTES / 1024))
FILE_COUNT="$(tar -tzf "$TARBALL_PATH" | wc -l | tr -d ' ')"
echo "  tarball: $TARBALL_PATH"
echo "  tamaño: ${SIZE_KB} KB, ${FILE_COUNT} archivos"

echo "==> [2/4] auditar contenido del tarball"
CONTENTS="$(tar -tzf "$TARBALL_PATH")"

check_absent() {
  local pattern="$1" label="$2"
  if echo "$CONTENTS" | grep -qE "$pattern"; then
    echo "$CONTENTS" | grep -E "$pattern" | sed 's/^/    /'
    fail "el tarball incluye $label (no debería)"
  fi
  ok "sin $label"
}
check_absent '(^|/)node_modules/' "node_modules"
check_absent '(^|/)\.claude(/|$)' "nada de ~/.claude"
check_absent '(^|/)transcripts?/' "transcripts"
check_absent '\.env($|/)' "archivos .env"
check_absent '(^|/)\.git(/|$)' "el .git"
check_absent '(^|/)apps/web/src/' "fuentes de la web (solo debe ir dist/ compilado)"
check_absent '(^|/)packages/.*/test/' "tests"

echo "$CONTENTS" | grep -q 'package/dist/packages/cli/src/index\.mjs$' || fail "falta el bin del CLI en el tarball"
echo "$CONTENTS" | grep -q 'package/dist/packages/hook-relay/bin/ai-office-hook\.mjs$' || fail "falta el relay en el tarball"
echo "$CONTENTS" | grep -q 'package/dist/apps/web/dist/index\.html$' || fail "faltan los estáticos de la web en el tarball"
ok "trae el bin, el relay y los estáticos de la web"

echo "==> [3/4] instalar en un directorio limpio, fuera del monorepo"
INSTALL_DIR="$(mktemp -d)"
(
  cd "$INSTALL_DIR"
  npm init -y --silent >/dev/null
  npm install "$TARBALL_PATH" --silent --no-audit --no-fund
)
[ -d "$INSTALL_DIR/node_modules/ai-office" ] || fail "npm install no dejó ai-office en node_modules"
ok "instalado en $INSTALL_DIR"

echo "==> [4/4] ejecutar el binario instalado, desde fuera del repo"
BIN="$INSTALL_DIR/node_modules/.bin/ai-office"
[ -x "$BIN" ] || fail "no existe (o no es ejecutable) $BIN"

(cd "$INSTALL_DIR" && "$BIN" --help) || fail "'ai-office --help' falló"
ok "'ai-office --help' responde"

(cd "$INSTALL_DIR" && "$BIN" censo) || fail "'ai-office censo' falló"
ok "'ai-office censo' responde"

echo
echo "✓ paquete verificado: ${SIZE_KB} KB, ${FILE_COUNT} archivos, instala y arranca fuera del monorepo."
echo "  (quedan sin borrar, por si quieres inspeccionarlos: $PACK_DIR y $INSTALL_DIR)"
