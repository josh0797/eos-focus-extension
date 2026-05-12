// src/storage.ts
// Typed wrapper over chrome.storage.local for EOS Focus.

export interface StoredAuth {
  userId:      string
  accessToken: string
  supabaseUrl: string
}

export interface StoredSettings {
  autoTracking:   boolean
  minDuration:    number    // minimum seconds before sending an event (default: 30)
  pausedUntil?:   string    // ISO — temporary pause
  ignoredDomains: string[]  // domains the user has blocked
}

export interface DomainStat {
  domain:       string
  durationSecs: number
  category:     string
  lastSeen:     string  // ISO
}

export interface BrowserSession {
  domain:         string
  url:            string
  title:          string
  favicon_url?:   string
  started_at:     string
  last_active_at: string
}

export interface StoredStats {
  eventsToday:    number
  lastSync:       string
  totalSentWeek:  number
  todayBreakdown: DomainStat[]
}

const KEYS = {
  AUTH:     'eos_auth',
  SETTINGS: 'eos_settings',
  SESSION:  'eos_active_session',
  STATS:    'eos_stats',
} as const

async function get<T>(key: string): Promise<T | null> {
  try {
    const result = await chrome.storage.local.get(key)
    return (result[key] as T) ?? null
  } catch { return null }
}

async function set(key: string, value: unknown): Promise<void> {
  try { await chrome.storage.local.set({ [key]: value }) }
  catch (e) { console.error('[eos:storage.set]', key, e) }
}

async function remove(key: string): Promise<void> {
  try { await chrome.storage.local.remove(key) }
  catch { /* silent */ }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const Auth = {
  get:   ()               => get<StoredAuth>(KEYS.AUTH),
  set:   (v: StoredAuth)  => set(KEYS.AUTH, v),
  clear: ()               => remove(KEYS.AUTH),
}

// ── Settings ──────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: StoredSettings = {
  autoTracking: true, minDuration: 30, ignoredDomains: [],
}

export const Settings = {
  get: async (): Promise<StoredSettings> => {
    const s = await get<StoredSettings>(KEYS.SETTINGS)
    return { ...DEFAULT_SETTINGS, ...s }
  },
  set: (v: Partial<StoredSettings>) =>
    Settings.get().then(curr => set(KEYS.SETTINGS, { ...curr, ...v })),
  reset: () => set(KEYS.SETTINGS, DEFAULT_SETTINGS),
}

// ── Active session ────────────────────────────────────────────────────────────

export const Session = {
  get:   ()                  => get<BrowserSession>(KEYS.SESSION),
  set:   (v: BrowserSession) => set(KEYS.SESSION, v),
  clear: ()                  => remove(KEYS.SESSION),
}

// ── Stats ─────────────────────────────────────────────────────────────────────

const DEFAULT_STATS: StoredStats = {
  eventsToday: 0, lastSync: new Date().toISOString(), totalSentWeek: 0, todayBreakdown: [],
}

export const Stats = {
  get: async (): Promise<StoredStats> => {
    const s = await get<StoredStats>(KEYS.STATS)
    return { ...DEFAULT_STATS, ...s }
  },
  increment: async (domain?: string, durationSecs?: number, category?: string) => {
    const curr = await Stats.get()
    let breakdown = curr.todayBreakdown ?? []

    if (domain && durationSecs) {
      const existing = breakdown.find(d => d.domain === domain)
      if (existing) {
        existing.durationSecs += durationSecs
        existing.lastSeen      = new Date().toISOString()
      } else {
        breakdown = [...breakdown, {
          domain, durationSecs, category: category ?? 'other',
          lastSeen: new Date().toISOString(),
        }]
      }
      breakdown = breakdown.sort((a, b) => b.durationSecs - a.durationSecs).slice(0, 20)
    }

    await set(KEYS.STATS, {
      eventsToday:    curr.eventsToday + 1,
      lastSync:       new Date().toISOString(),
      totalSentWeek:  curr.totalSentWeek + 1,
      todayBreakdown: breakdown,
    })
  },
  resetDaily: async () => {
    const curr = await Stats.get()
    await set(KEYS.STATS, { ...curr, eventsToday: 0, todayBreakdown: [] })
  },
}
