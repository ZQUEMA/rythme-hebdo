export type Reading = { percentUsed: number; resetsAt: string }

export type Day = { date: string; resetsAt: string; baseline: number }

declare module 'claude-code' {
  interface PluginState {
    'rythme-hebdo': { reading: Reading | null; day: Day | null; isHidden: boolean; isOpen: boolean }
  }
}
