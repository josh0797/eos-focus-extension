// src/background.ts
// EOS Focus service worker.
// Manages active session, tab changes, idle detection and event sending.

import { Auth, Settings, Session, Stats, type BrowserSession } from './storage'
import { sendEvent } from './api'
import { extractDomain, secondsBetween, isInternalUrl, getCategoryForDomain } from './utils'

const IDLE_THRESHOLD_SECS = 3 * 60   // 3 min
const ALARM_FLUSH         = 'eos_flush'
const ALARM_DAILY         = 'eos_daily_reset'

let isSending = false

// ── Flush ─────────────────────────────────────────────────────────────────────

async function flushSession(reason: string): Promise<void> {
  if (isSending) return
  const session = await Session.get()
  if (!session) return

  const endedAt      = new Date().toISOString()
  const durationSecs = secondsBetween(session.started_at, endedAt)
  const settings     = await Settings.get()

  if (durationSecs >= settings.minDuration) {
    isSending = true
    try {
      const category = getCategoryForDomain(session.domain)
      const result = await sendEvent({
        started_at:    session.started_at,
        ended_at:      endedAt,
        duration_secs: durationSecs,
        domain:        session.domain,
        url:           session.url,
        title:         session.title,
        favicon_url:   session.favicon_url,
      })
      if (!result.ok) {
        console.warn(`[eos:flush:${reason}] send failed:`, result.error)
      } else if (!result.skipped) {
        await Stats.increment(session.domain, durationSecs, category)
      }
    } finally {
      isSending = false
    }
  }

  await Session.clear()
}

// ── Start session ─────────────────────────────────────────────────────────────

async function startSession(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.url) return
  if (isInternalUrl(tab.url)) return

  const domain = extractDomain(tab.url)
  if (!domain) return

  const settings = await Settings.get()
  if (!settings.autoTracking) return
  if (settings.pausedUntil && new Date(settings.pausedUntil) > new Date()) return
  if ((settings.ignoredDomains ?? []).includes(domain)) return

  const auth = await Auth.get()
  if (!auth) return

  const session: BrowserSession = {
    domain,
    url:            tab.url,
    title:          tab.title ?? domain,
    favicon_url:    tab.favIconUrl,
    started_at:     new Date().toISOString(),
    last_active_at: new Date().toISOString(),
  }
  await Session.set(session)
}

// ── Tab events ────────────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await flushSession('tab_change')
  chrome.tabs.get(tabId, async tab => {
    if (chrome.runtime.lastError) return
    await startSession(tab)
  })
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!active || active.id !== tabId) return

  const session = await Session.get()
  if (!session) { await startSession(tab); return }

  const newDomain = extractDomain(tab.url ?? '')
  if (newDomain && newDomain !== session.domain) {
    await flushSession('url_change')
    await startSession(tab)
  } else {
    await Session.set({ ...session, title: tab.title ?? session.title, last_active_at: new Date().toISOString() })
  }
})

// ── Idle ──────────────────────────────────────────────────────────────────────

chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECS)

chrome.idle.onStateChanged.addListener(async state => {
  if (state === 'idle' || state === 'locked') {
    await flushSession('idle')
  } else if (state === 'active') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab) await startSession(tab)
  }
})

// ── Alarms ────────────────────────────────────────────────────────────────────

chrome.alarms.create(ALARM_FLUSH, { periodInMinutes: 5 })
chrome.alarms.create(ALARM_DAILY, { periodInMinutes: 60 * 24 })

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === ALARM_FLUSH) {
    const session = await Session.get()
    if (!session) return
    const idleSecs = secondsBetween(session.last_active_at, new Date().toISOString())
    if (idleSecs > IDLE_THRESHOLD_SECS) {
      await flushSession('idle_alarm')
    } else {
      // Periodic flush + restart to avoid data loss if the SW dies
      await flushSession('periodic')
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab) await startSession(tab)
    }
  }
  if (alarm.name === ALARM_DAILY) await Stats.resetDaily()
})

// ── Messages ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handle = async () => {
    switch (msg.type) {
      case 'GET_STATUS': {
        const auth     = await Auth.get()
        const settings = await Settings.get()
        const session  = await Session.get()
        const stats    = await Stats.get()
        return {
          isConnected:    !!auth,
          userId:         auth?.userId ?? null,
          autoTracking:   settings.autoTracking,
          ignoredDomains: settings.ignoredDomains ?? [],
          activeSession:  session,
          eventsToday:    stats.eventsToday,
          lastSync:       stats.lastSync,
          todayBreakdown: stats.todayBreakdown ?? [],
        }
      }
      case 'SET_AUTH':
        await Auth.set({ userId: msg.userId, accessToken: msg.accessToken, supabaseUrl: msg.supabaseUrl })
        return { ok: true }
      case 'CLEAR_AUTH':
        await flushSession('logout')
        await Auth.clear()
        return { ok: true }
      case 'SET_AUTO_TRACKING':
        await Settings.set({ autoTracking: msg.enabled })
        if (!msg.enabled) {
          await flushSession('paused')
        } else {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
          if (tab) await startSession(tab)
        }
        return { ok: true }
      case 'FLUSH_NOW':
        await flushSession('manual')
        return { ok: true }
      case 'GET_STATS':
        return await Stats.get()
      case 'ADD_IGNORED_DOMAIN': {
        const settings = await Settings.get()
        const domains  = new Set(settings.ignoredDomains ?? [])
        domains.add(msg.domain)
        await Settings.set({ ignoredDomains: [...domains] })
        return { ok: true }
      }
      case 'REMOVE_IGNORED_DOMAIN': {
        const settings = await Settings.get()
        const domains  = (settings.ignoredDomains ?? []).filter((d: string) => d !== msg.domain)
        await Settings.set({ ignoredDomains: domains })
        return { ok: true }
      }
      default:
        return { ok: false, error: `Unknown message type: ${msg.type}` }
    }
  }
  handle().then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }))
  return true
})

console.log('[EOS Focus] Service worker ready')
