import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type Agent, type Command, emptyCatalog, type Skill } from '@ai-office/core'
import type { EntityActivity } from '../src/claude-code/proven.ts'
import { renderPoster } from '../src/render/poster.ts'

const skills = (n: number): Skill[] =>
  Array.from({ length: n }, (_, i) => ({ id: `skill:x/user/s${i}`, name: `s${i}` }) as Skill)
const command = (name: string): Command => ({ id: `command:x/user/${name}`, name }) as Command

const input = (n: number, activity = new Map<string, EntityActivity>(), extra = {}) => ({
  catalog: {
    ...emptyCatalog(),
    agents: [{ id: 'agent:x/user/a', name: 'a' } as Agent],
    skills: skills(n),
    commands: [command('usado'), command('nuevo')],
  },
  activity,
  activeRatio: 0.5,
  declared: 1,
  proven: 1,
  descriptionTokens: 12345,
  deadDescriptionTokens: 100,
  ...extra,
})

const height = (svg: string) => Number(/height="(\d+)"/.exec(svg)?.[1])

test('con pocas skills el cartel mide lo de siempre; con muchas crece en vez de solaparse', () => {
  assert.equal(height(renderPoster(input(10))), 800)
  const grande = renderPoster(input(200))
  assert.ok(height(grande) > 800)
  // La banda del ratio cuelga del final y la última fila de skills queda por encima.
  const ys = [...grande.matchAll(/<text x="64" y="(\d+)"[^>]*>RATIO ACTIVO/g)].map((m) =>
    Number(m[1]),
  )
  const rects = [...grande.matchAll(/<rect x="\d+" y="(\d+)" width="25" height="25"/g)].map((m) =>
    Number(m[1]),
  )
  assert.ok(Math.max(...rects) + 25 < ys[0]!, 'la rejilla de skills no pisa la banda del ratio')
})

test('los comandos usados salen rellenos', () => {
  const activity = new Map<string, EntityActivity>([
    [
      'command:x/user/usado',
      {
        id: 'command:x/user/usado',
        name: 'usado',
        uses: 3,
        sessions: 1,
        projects: 1,
        lastUsedAt: 1,
        grade: 'tried',
        active: false,
      },
    ],
  ])
  const svg = renderPoster(input(3, activity))
  assert.match(svg, /1 no se han ejecutado nunca/)
  const cards = [
    ...svg.matchAll(/<rect x="[\d-]+" y="\d+" width="36" height="19"[^>]*fill="(#[0-9a-f]+)"/g),
  ]
  assert.deepEqual(
    cards.map((m) => m[1]),
    ['#23201c', '#f6f4f0'],
  )
})

test('con ventana de historial, "nunca" dice en cuántos días', () => {
  const svg = renderPoster(input(3, new Map(), { historyWindowDays: 30 }))
  assert.match(svg, /no han trabajado en los últimos 30 días/)
  assert.match(svg, /~12\.345 tokens/)
})
