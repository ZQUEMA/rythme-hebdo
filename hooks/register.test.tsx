import { expect, test } from 'claude-code/testing'

import { bar, baselineFor, dayPace, dayVerdict, pace, svgBar, verdict } from './register'

const DAY = 24 * 3600 * 1000
const RESET = new Date(2026, 10, 9, 10, 0).toISOString()
const resetMs = new Date(RESET).getTime()

test('mi-semaine à 50 % : dans le rythme', () => {
  const p = pace({ percentUsed: 50, resetsAt: RESET }, resetMs - 3.5 * DAY)

  expect(Math.round(p.expected)).toBe(50)
  expect(verdict(p)).toBe('● dans le rythme')
})

test('lundi soir à 40 % : en avance', () => {
  const p = pace({ percentUsed: 40, resetsAt: RESET }, resetMs - 6 * DAY)

  expect(verdict(p)).toBe("▲ 26 pts d'avance")
})

test('jeudi à 20 % : de la marge', () => {
  const p = pace({ percentUsed: 20, resetsAt: RESET }, resetMs - 3 * DAY)

  expect(verdict(p)).toBe('▼ 37 pts de marge')
})

test("le point de départ du jour est la dernière lecture d'un jour précédent", () => {
  const r = { percentUsed: 42, resetsAt: RESET }

  expect(baselineFor(r, { percentUsed: 30, resetsAt: RESET }, resetMs - 4 * DAY)).toBe(30)
  expect(baselineFor(r, undefined, resetMs - 4 * DAY)).toBe(42)
  expect(baselineFor({ percentUsed: 3, resetsAt: new Date(resetMs + 7 * DAY).toISOString() }, undefined, resetMs + 1000)).toBe(0)
})

test('le budget du jour répartit le reste sur les jours restants', () => {
  const r = { percentUsed: 42, resetsAt: RESET }
  const t = dayPace(r, { date: '', resetsAt: RESET, baseline: 30 }, resetMs - 4 * DAY)

  expect(t.used).toBe(12)
  expect(Math.round(t.budget * 100)).toBe(1585)
  expect(dayVerdict(t)).toBe('reste 3,8 pts')
  expect(dayVerdict({ used: 12, budget: 10, ratio: 1.2 })).toBe('▲ 2 pts au-delà')
})

test('la barre place le repère et un demi-segment', () => {
  const runs = bar(0.25, 0.5)

  expect(runs.map(r => r.text).join('')).toBe('━'.repeat(7) + '─'.repeat(7) + '┃' + '─'.repeat(13))
  expect(bar(0.27).map(r => r.text).join('')).toBe('━━━━━━━╸' + '─'.repeat(20))
})

test('la barre SVG arrondit, remplit et place le repère', () => {
  const svg = svgBar(0.5, 0.25, 'warning', 200)

  expect(svg).toContain('width="100.0"')
  expect(svg).toContain('fill="#f59e0b"')
  expect(svg).toContain('x="49.0"')
  expect(svgBar(0, undefined, 'success', 200)).toContain('width="0.0"')
})

test('les deux barres apparaissent après une mesure hebdo, sur chaque surface', async ($, on) => {
  const kept = new Map<string, unknown>([['last', { percentUsed: 30, resetsAt: RESET }]])

  on('command.register', () => ({ value: { command: 'hebdo' } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [] } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: resetMs - 4 * DAY }))
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => (kept.set(e.key, e.value), { value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: {},
    rateLimits: [{ kind: 'seven_day', percentUsed: 42, resetsAt: RESET }],
    changed: ['rateLimits'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'rythme-hebdo',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false },
    })

    expect((await ui.find({ type: 'Text', text: /42 %/ }))?.text).toBe('42 %')
    expect((await ui.find({ type: 'Text', text: /76 %/ }))?.text).toBe('76 %')
    expect(Boolean(await ui.find({ type: 'Svg' }))).toBe(surface === 'desktop')
    expect(await ui.find({ type: 'Text', text: /marge/ })).toBeUndefined()

    await ui.press({ key: 'rythme' })
    expect((await ui.find({ type: 'Text', text: /marge/ }))?.text).toBe('▼ 1 pts de marge')
    expect((await ui.find({ type: 'Text', text: /reste/ }))?.text).toBe('reste 3,8 pts')

    await ui.press({ key: 'rythme' })
    expect(await ui.find({ type: 'Text', text: /marge/ })).toBeUndefined()
    await ui.unmount()
  }
})
