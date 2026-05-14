// src/content.ts
// Runs ONLY on eos-update2.pages.dev and colma.odoo.com.
// world: "MAIN" in manifest.json → same JS context as the page.

const SUPABASE_URL = 'https://ukootpnechabpmwsmxsi.supabase.co'
const SIGNATURE    = 'eos_focus_v1'   // must match useChromeExtensionStatus.ts
const UPDATE_EVENT = 'EOS_EXTENSION_UPDATE'

// ── Step 1: SYNCHRONOUS signal — runs before any async call ──────────────────
// The hook detects us on the first render cycle, even before auth is resolved.
const initialSignal = {
  signature:      SIGNATURE,
  version:        '1.0.0',
  userId:         null,
  autoTracking:   true,
  lastSync:       null,
  eventsToday:    0,
  todayBreakdown: [],
  ignoredDomains: [],
}
;(window as any).__EOS_EXTENSION__ = initialSignal
window.postMessage({ type: UPDATE_EVENT, payload: initialSignal }, '*')

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSignal(status: any) {
  const ver = (typeof chrome !== 'undefined' && chrome?.runtime?.getManifest?.()?.version) || '1.0.0'
  return {
    signature:      SIGNATURE,
    version:        ver,
    userId:         status.userId         ?? null,
    autoTracking:   status.autoTracking   ?? true,
    lastSync:       status.lastSync       ?? null,
    eventsToday:    status.eventsToday    ?? 0,
    todayBreakdown: status.todayBreakdown ?? [],
    ignoredDomains: status.ignoredDomains ?? [],
  }
}

async function broadcastStatus() {
  try {
    const status  = await chrome.runtime.sendMessage({ type: 'GET_STATUS' })
    const payload = buildSignal(status)
    ;(window as any).__EOS_EXTENSION__ = payload
    window.postMessage({ type: UPDATE_EVENT, payload }, '*')
  } catch (err) {
    console.warn('[EOS Focus] broadcastStatus error:', err)
  }
}

// ── Expose direct connect function on window ──────────────────────────────────
// Since we run in MAIN world, the React app can call window.__EOS_CONNECT()
// directly — no postMessage needed, no timing issues.
;(window as any).__EOS_CONNECT = async (token: string, userId: string, supabaseUrl: string) => {
  try {
    await chrome.runtime.sendMessage({ type: 'SET_AUTH', userId, accessToken: token, supabaseUrl })
    await broadcastStatus()
    console.log('[EOS Focus] Connected via __EOS_CONNECT, userId:', userId)
    return true
  } catch (err) {
    console.warn('[EOS Focus] __EOS_CONNECT failed:', err)
    return false
  }
}

// ── Step 2: fetch real auth status, auto-connect if needed ──────────────────
async function tryAutoConnect(): Promise<boolean> {
  // Try all possible Supabase v2 localStorage key formats
  const projectRef = SUPABASE_URL.split('//')[1]?.split('.')[0] ?? ''
  const candidates = [
    `sb-${projectRef}-auth-token`,          // standard v2
    `supabase.auth.token`,                  // older format
    `sb-${projectRef}-auth-token-code-verifier`,
  ]

  for (const key of candidates) {
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      // v2 stores it as { access_token, refresh_token, user } OR { currentSession: {...} }
      const token  = parsed.access_token ?? parsed.currentSession?.access_token
      const userId = parsed.user?.id     ?? parsed.currentSession?.user?.id
      if (!token || !userId) continue
      await chrome.runtime.sendMessage({
        type: 'SET_AUTH', userId, accessToken: token, supabaseUrl: SUPABASE_URL,
      })
      console.log('[EOS Focus] Auto-connected from localStorage key:', key)
      return true
    } catch { continue }
  }

  // Last resort: scan all localStorage keys for anything that looks like a Supabase session
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.includes('supabase') && !key?.includes('sb-')) continue
    try {
      const raw    = localStorage.getItem(key)!
      const parsed = JSON.parse(raw)
      const token  = parsed.access_token ?? parsed.currentSession?.access_token
      const userId = parsed.user?.id     ?? parsed.currentSession?.user?.id
      if (!token || !userId) continue
      await chrome.runtime.sendMessage({
        type: 'SET_AUTH', userId, accessToken: token, supabaseUrl: SUPABASE_URL,
      })
      console.log('[EOS Focus] Auto-connected from localStorage scan, key:', key)
      return true
    } catch { continue }
  }

  return false
}

;(async () => {
  await new Promise(r => setTimeout(r, 150))  // let service worker wake up

  // Get current status — if not connected, try auto-connect from localStorage
  const initialStatus = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }).catch(() => null)
  if (initialStatus && !initialStatus.userId) {
    const connected = await tryAutoConnect()
    if (connected) console.log('[EOS Focus] Auto-connected from existing session')
  }

  await broadcastStatus()

  // ── Listen for messages from the app ───────────────────────────────────────
  window.addEventListener('message', async (event) => {
    if (!event.data?.type) return

    if (event.data.type === 'EOS_EXTENSION_PING') {
      await broadcastStatus()
      return
    }

    switch (event.data.type) {

      case 'EOS_RECONNECT': {
        const token       = event.data.token       as string | undefined
        const userId      = event.data.userId      as string | undefined
        const supabaseUrl = event.data.supabaseUrl as string ?? SUPABASE_URL
        let activeToken = token, activeUserId = userId

        if (!activeToken) {
          const key = `sb-${SUPABASE_URL.split('//')[1].split('.')[0]}-auth-token`
          const raw = localStorage.getItem(key)
          if (!raw) { window.postMessage({ type: 'EOS_EXTENSION_AUTH_ERROR', reason: 'no_session' }, '*'); return }
          try { const p = JSON.parse(raw); activeToken = p.access_token; activeUserId = activeUserId ?? p.user?.id }
          catch { window.postMessage({ type: 'EOS_EXTENSION_AUTH_ERROR', reason: 'parse_error' }, '*'); return }
        }

        if (!activeToken || !activeUserId) {
          window.postMessage({ type: 'EOS_EXTENSION_AUTH_ERROR', reason: 'no_token' }, '*'); return
        }

        await chrome.runtime.sendMessage({ type: 'SET_AUTH', userId: activeUserId, accessToken: activeToken, supabaseUrl })
        await broadcastStatus()
        break
      }

      case 'EOS_SET_AUTO_TRACKING':
        await chrome.runtime.sendMessage({ type: 'SET_AUTO_TRACKING', enabled: !!event.data.enabled })
        await broadcastStatus()
        break

      case 'EOS_ADD_IGNORED_DOMAIN':
        if (event.data.domain) { await chrome.runtime.sendMessage({ type: 'ADD_IGNORED_DOMAIN', domain: event.data.domain }); await broadcastStatus() }
        break

      case 'EOS_REMOVE_IGNORED_DOMAIN':
        if (event.data.domain) { await chrome.runtime.sendMessage({ type: 'REMOVE_IGNORED_DOMAIN', domain: event.data.domain }); await broadcastStatus() }
        break
    }
  })

  setInterval(broadcastStatus, 30_000)
})()