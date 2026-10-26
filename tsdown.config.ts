import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = (p: string) => resolve(here, p)

/**
 * Empaqueta `ai-office` para publicarse como UN SOLO paquete npm.
 *
 * El monorepo declara cinco paquetes (`core`, `providers`, `daemon`, `hook-relay`, `cli`) unidos
 * por `workspace:*`, pero solo `cli` se publica. La estrategia es `unbundle: true`: transpila
 * cada archivo de TypeScript a JavaScript UNO A UNO (sin concatenarlos en un solo bundle) y
 * preserva la estructura de carpetas del monorepo bajo `packages/cli/dist/`, en vez de fundir
 * `core`+`providers`+`daemon`+`cli` en un archivo plano.
 *
 * Esto no es un capricho: `packages/daemon/src/server.ts` (webDist) y
 * `packages/cli/src/commands/hooks.ts` (relayPath) calculan rutas con
 * `dirname(fileURLToPath(import.meta.url))` seguido de una cadena fija de `..` para llegar a
 * `apps/web/dist` y a `packages/hook-relay/bin/` respectivamente. Esas cuentas asumen la
 * profundidad exacta de carpetas del monorepo. Un bundle plano (todo en un `index.js`) pisa esa
 * profundidad y las rompe en silencio; `unbundle` con `root: '.'` la reproduce tal cual dentro de
 * `dist/`, así que ninguno de los dos archivos necesita tocarse. `scripts/build.sh` copia después
 * `apps/web/dist` y `packages/hook-relay/bin/ai-office-hook.mjs` en las mismas rutas relativas
 * dentro de `dist/` para que esas cuentas se encuentren lo que esperan.
 */
export default defineConfig({
  entry: ['packages/cli/src/index.ts'],
  outDir: 'packages/cli/dist',
  root: '.',
  unbundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22.16',
  dts: false,
  sourcemap: false,
  minify: false,
  clean: true,
  // packages/cli/package.json NO declara @ai-office/* como dependencia (no son paquetes npm
  // reales), así que pnpm no le crea el symlink en node_modules. Se resuelven a mano, apuntando
  // directo al código fuente: así el build no depende de que el workspace los tenga enlazados.
  alias: {
    '@ai-office/core': pkg('packages/core/src/index.ts'),
    '@ai-office/providers': pkg('packages/providers/src/index.ts'),
    '@ai-office/daemon': pkg('packages/daemon/src/index.ts'),
  },
  // Los paquetes @ai-office/* no son dependencias reales: se transpilan junto al CLI. Solo estas
  // cuatro (las que quedan en packages/cli/package.json) viajan como paquetes npm de verdad.
  deps: {
    neverBundle: ['yaml', 'fastify', '@fastify/static', '@fastify/websocket'],
  },
})
