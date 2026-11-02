import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, ThemeKey } from 'claude-code'

import type { Day, Reading } from '../types'

const DAY_MS = 24 * 3600 * 1000
const WEEK_MS = 7 * DAY_MS
const BAR_CELLS = 28
const COMPACT_CELLS = 10
const CARD_CELLS = 46
const COMPACT_PX = 72
const CARD_PX = 340
const BAR_PX = 6

const FILL: Record<ThemeKey & ('success' | 'warning' | 'error'), string> = {
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
}

export const svgBar = (ratio: number, mark: number | undefined, tone: ThemeKey, px: number): string => {
  const h = BAR_PX
  const clamped = Math.min(Math.max(ratio, 0), 1)
  const fill = clamped > 0 ? Math.max(clamped * px, h) : 0
  const fillColor = FILL[tone as keyof typeof FILL] ?? FILL.success
  const tick =
    mark === undefined
      ? ''
      : `<rect x="${Math.min(Math.max(mark * px - 1, 0), px - 2).toFixed(1)}" y="0" width="2" height="${h + 6}" rx="1" fill="rgba(128,128,128,0.95)"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${h + 6}" viewBox="0 0 ${px} ${h + 6}"><rect x="0" y="3" width="${px}" height="${h}" rx="${h / 2}" fill="rgba(128,128,128,0.25)"/><rect x="0" y="3" width="${fill.toFixed(1)}" height="${h}" rx="${h / 2}" fill="${fillColor}"/>${tick}</svg>`
}

const reading = atom({ plugin: 'rythme-hebdo', key: 'reading' } as const, null)
const day = atom({ plugin: 'rythme-hebdo', key: 'day' } as const, null)
const isHidden = atom({ plugin: 'rythme-hebdo', key: 'isHidden' } as const, false)
const isOpen = atom({ plugin: 'rythme-hebdo', key: 'isOpen' } as const, false)

export type Pace = { used: number; expected: number; delta: number; days: number; resetsAt: Date }

export type DayPace = { used: number; budget: number; ratio: number }

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })

const startOfDay = (now: number) => {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)

  return d.getTime()
}

const dateKey = (now: number) => new Date(now).toLocaleDateString('sv-SE')

export const pace = (r: Reading, now: number): Pace => {
  const resetsAt = new Date(r.resetsAt)
  const left = Math.min(Math.max(resetsAt.getTime() - now, 0), WEEK_MS)
  const expected = ((WEEK_MS - left) / WEEK_MS) * 100
  const delta = r.percentUsed - expected

  return { used: r.percentUsed, expected, delta, days: (delta / 100) * 7, resetsAt }
}

export const verdict = (p: Pace): string => {
  const pts = Math.abs(Math.round(p.delta))

  if (pts === 0) {
    return '● dans le rythme'
  }

  return p.delta > 0 ? `▲ ${pts} pts d'avance` : `▼ ${pts} pts de marge`
}

export const baselineFor = (r: Reading, last: Reading | undefined, now: number): number => {
  if (new Date(r.resetsAt).getTime() - WEEK_MS >= startOfDay(now)) {
    return 0
  }

  return last?.resetsAt === r.resetsAt ? Math.min(last.percentUsed, r.percentUsed) : r.percentUsed
}

export const dayPace = (r: Reading, d: Day, now: number): DayPace => {
  const daysLeft = Math.max((new Date(r.resetsAt).getTime() - startOfDay(now)) / DAY_MS, 1)
  const budget = (100 - d.baseline) / daysLeft
  const used = Math.max(r.percentUsed - d.baseline, 0)

  return { used, budget, ratio: budget > 0 ? used / budget : 1 }
}

export const dayVerdict = (p: DayPace): string =>
  p.ratio > 1 ? `▲ ${fmt(p.used - p.budget)} pts au-delà` : `reste ${fmt(p.budget - p.used)} pts`

const weekTone = (p: Pace): ThemeKey => (p.delta > 5 ? 'error' : p.delta > 0 ? 'warning' : 'success')

const dayTone = (p: DayPace): ThemeKey => (p.ratio > 1 ? 'error' : p.ratio > 0.75 ? 'warning' : 'success')

type Run = { text: string; kind: 'fill' | 'track' | 'mark' }

export const bar = (ratio: number, mark?: number, width = BAR_CELLS): Run[] => {
  const exact = Math.min(Math.max(ratio, 0), 1) * width
  const full = Math.floor(exact)
  const half = full < width && exact - full >= 0.5
  const cells: Run['kind'][] = Array.from({ length: width }, (_, i) => (i < full || (half && i === full) ? 'fill' : 'track'))
  const chars = cells.map((k, i) => (k === 'fill' ? (half && i === full ? '╸' : '━') : '─'))

  if (mark !== undefined) {
    const at = Math.min(Math.round(Math.min(Math.max(mark, 0), 1) * width), width - 1)
    cells[at] = 'mark'
    chars[at] = '┃'
  }

  return cells.reduce<Run[]>((runs, kind, i) => {
    const prev = runs[runs.length - 1]

    if (prev?.kind === kind) {
      prev.text += chars[i]
    } else {
      runs.push({ text: chars[i], kind })
    }

    return runs
  }, [])
}

const resetLabel = (d: Date) => d.toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })

const weekly = (limits: SessionRateLimit[]): Reading | null => {
  const w = limits.find(l => l.kind === 'seven_day')

  return w?.resetsAt ? { percentUsed: w.percentUsed, resetsAt: w.resetsAt } : null
}

async function store($: EngineInterface, limits: SessionRateLimit[]) {
  const r = weekly(limits)

  if (!r) {
    return
  }

  const now = await $.clock.now()
  const today = dateKey(now)
  let d = (await $.store.get('day')) as Day | undefined

  if (d?.date !== today || d.resetsAt !== r.resetsAt) {
    d = { date: today, resetsAt: r.resetsAt, baseline: baselineFor(r, (await $.store.get('last')) as Reading | undefined, now) }
    await $.store.set('day', d)
  }

  await $.store.set('last', r)
  const fixed = d
  await update($, reading, () => r)
  await update($, day, () => fixed)

  const w = pace(r, now)
  const t = dayPace(r, d, now)
  $.ui.status(`Sem. ${Math.round(w.used)} % ${w.delta >= 0 ? '▲' : '▼'}${Math.abs(Math.round(w.delta))} · Jour ${Math.round(t.ratio * 100)} %`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'hebdo',
      description: 'Affiche ou masque les barres du quota (semaine et jour)',
    })
    await store($, (await $.session.usage()).rateLimits)

    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await store($, e.rateLimits)
    }

    return next(e)
  })

  on('command.run', { command: 'hebdo' }, async $ => {
    const hidden = await update($, isHidden, v => !v)

    return { text: hidden ? 'Barres du quota masquées.' : 'Barres du quota affichées.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, reading)
    const d = await read($, day)

    if (e.props.hasSurvey || r === null || d === null || (await read($, isHidden))) {
      return next(e)
    }

    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const Svg = 'Svg' in els ? els.Svg : null
    const now = await $.clock.now()
    const w = pace(r, now)
    const t = dayPace(r, d, now)

    const open = await read($, isOpen)
    const wColor = weekTone(w)
    const tColor = dayTone(t)

    const meter = (ratio: number, mark: number | undefined, color: ThemeKey, cells: number, px: number) =>
      Svg ? (
        <Svg source={svgBar(ratio, mark, color, px)} alt={`${Math.round(ratio * 100)} %`} width={px} />
      ) : (
        <Text>
          {bar(ratio, mark, cells).map(run =>
            run.kind === 'fill' ? (
              <Text color={color}>{run.text}</Text>
            ) : run.kind === 'mark' ? (
              <Text color="text" weight="bold">{run.text}</Text>
            ) : (
              <Text dimColor>{run.text}</Text>
            ),
          )}
        </Text>
      )

    const toned = (color: ThemeKey, text: string) => <Text color={color}>{text}</Text>

    const compact = (
      <Box gap={1} alignItems="center">
        <Text color={wColor}>●</Text>
        <Text dimColor>Semaine</Text>
        {meter(w.used / 100, w.expected / 100, wColor, COMPACT_CELLS, COMPACT_PX)}
        <Text color={wColor} weight="semibold" tabular>{`${Math.round(w.used)} %`}</Text>
        {toned(wColor, `${w.delta >= 0 ? '▲' : '▼'}${Math.abs(Math.round(w.delta))}`)}
        <Text dimColor>·</Text>
        <Text color={tColor}>●</Text>
        <Text dimColor>Jour</Text>
        {meter(t.ratio, undefined, tColor, COMPACT_CELLS, COMPACT_PX)}
        <Text color={tColor} weight="semibold" tabular>{`${Math.round(t.ratio * 100)} %`}</Text>
        <Button key="rythme" plain dimColor hotkey="u" label={open ? 'Masquer' : 'Détails'} onPress={() => update($, isOpen, v => !v)} />
      </Box>
    )

    if (!open) {
      return compact
    }

    const section = (title: string, right: string, meterEl: ReturnType<typeof meter>, color: ThemeKey, verdictText: string, detail: string) => (
      <Box flexDirection="column" rowGap={Svg ? 1 : 0}>
        <Box justifyContent="space-between" gap={3}>
          <Text weight="semibold">
            <Text color={color}>● </Text>
            {title}
          </Text>
          <Text dimColor tabular>{right}</Text>
        </Box>
        {meterEl}
        <Box gap={1}>
          {toned(color, verdictText)}
          <Text dimColor>{detail}</Text>
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column" alignItems="flex-start" rowGap={Svg ? 1 : 0}>
        {compact}
        <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={Svg ? 2 : 1} paddingY={Svg ? 1 : 0} rowGap={1} width={Svg ? undefined : CARD_CELLS + 4}>
          <Text dimColor>Rythme du quota Claude</Text>
          {section(
            'Hebdomadaire',
            `Réinitialisation ${resetLabel(w.resetsAt)}   ${Math.round(w.used)} %`,
            meter(w.used / 100, w.expected / 100, wColor, CARD_CELLS, CARD_PX),
            wColor,
            verdict(w),
            `≈ ${fmt(Math.abs(w.days))} j · rythme ${Math.round(w.expected)} %`,
          )}
          {section(
            "Aujourd'hui",
            `${fmt(t.used)} / ${fmt(t.budget)} pts   ${Math.round(t.ratio * 100)} %`,
            meter(t.ratio, undefined, tColor, CARD_CELLS, CARD_PX),
            tColor,
            dayVerdict(t),
            'reste du quota ÷ jours restants',
          )}
        </Box>
      </Box>
    )
  })
}
