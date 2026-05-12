// src/content.ts
// Runs ONLY on eos-update2.pages.dev and colma.odoo.com.
// Injects __EOS_EXTENSION__ into window and handles the auth protocol.

const SUPABASE_URL = 'https://ukootpnechabpmwsmxsi.supabase.co'
const SIGNATURE    = 'eos_focus_v1'
const UPDATE_EVENT = 'EOS_EXTENSION_UPDATE'

;(async () => {
  // ── 1. Get status from background ─────────────────────────────────────────
  const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' })

  // ── 2. Inject signal into window ──────────────────────────────────────────
  ;(window as any).__EOS_EXTENSION__ = {
    signature:      SIGNATURE,
    version:        chrome.runtime.getManifest().version,
    userId:         status.userId         ?? null,
    autoTracking:   status.autoTracking   ?? true,
    lastSync:       status.lastSync       ?? null,
    eventsToday:    status.eventsToday    ?? 0,
    todayBreakdown: status.todayBreakdown ?? [],
    ignoredDomains: status.ignoredDomains ?? [],
  }

  window.postMessage({ type: UPDATE_EVENT }, '*')

  // ── 3. Listen for messages from the app ───────────────────────────────────
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return

    switch (event.data?.type) {

      case 'EOS_RECONNECT': {
        const token  = event.data.token       as string | undefined
        const userId = event.data.userId      as string | undefined
        const url    = event.data.supabaseUrl as string | undefined ?? SUPABASE_URL

        let activeToken  = token
        let activeUserId = userId

        // Fallback: read localStorage if token not passed directly
        if (!activeToken) {
          const storageKey = `sb-${SUPABASE_URL.split('//')[1].split('.')[0]}-auth-token`
          const raw = localStorage.getItem(storageKey)
          if (!raw) {
            window.postMessage({ type: 'EOS_EXTENSION_AUTH_ERROR', reason: 'no_session' }, '*')
            return
          }
          try {
            const parsed  = JSON.parse(raw)
            activeToken   = parsed.access_token
            activeUserId  = activeUserId ?? parsed.user?.id
          } catch {
            window.postMessage({ type: 'EOS_EXTENSION_AUTH_ERROR', reason: 'parse_error' }, '*')
            return
          }
        }

        if (!activeToken || !activeUserId) {
          window.postMessage({ type: 'EOS_EXTENSION_AUTH_ERROR', reason: 'no_token' }, '*')
          return
        }

        await chrome.runtime.sendMessage({
          type:        'SET_AUTH',
          userId:      activeUserId,
          accessToken: activeToken,
          supabaseUrl: url,
        })

        ;(window as any).__EOS_EXTENSION__ = {
          ...(window as any).__EOS_EXTENSION__,
          userId:       activeUserId,
          autoTracking: true,
        }
        window.postMessage({ type: UPDATE_EVENT }, '*')
        break
      }

      case 'EOS_SET_AUTO_TRACKING': {
        const enabled = !!event.data.enabled
        await chrome.runtime.sendMessage({ type: 'SET_AUTO_TRACKING', enabled })
        ;(window as any).__EOS_EXTENSION__.autoTracking = enabled
        window.postMessage({ type: UPDATE_EVENT }, '*')
        break
      }

      case 'EOS_ADD_IGNORED_DOMAIN': {
        const domain = event.data.domain as string
        if (domain) {
          await chrome.runtime.sendMessage({ type: 'ADD_IGNORED_DOMAIN', domain })
          ;(window as any).__EOS_EXTENSION__.ignoredDomains = [
            ...((window as any).__EOS_EXTENSION__.ignoredDomains ?? []),
            domain,
          ]
          window.postMessage({ type: UPDATE_EVENT }, '*')
        }
        break
      }

      case 'EOS_REMOVE_IGNORED_DOMAIN': {
        const domain = event.data.domain as string
        if (domain) {
          await chrome.runtime.sendMessage({ type: 'REMOVE_IGNORED_DOMAIN', domain })
          ;(window as any).__EOS_EXTENSION__.ignoredDomains =
            ((window as any).__EOS_EXTENSION__.ignoredDomains ?? []).filter((d: string) => d !== domain)
          window.postMessage({ type: UPDATE_EVENT }, '*')
        }
        break
      }
    }
  })

  // ── 4. Heartbeat — update signal every 30s ────────────────────────────────
  setInterval(async () => {
    const fresh = await chrome.runtime.sendMessage({ type: 'GET_STATUS' })
    ;(window as any).__EOS_EXTENSION__ = {
      ...(window as any).__EOS_EXTENSION__,
      signature:      SIGNATURE,
      autoTracking:   fresh.autoTracking,
      lastSync:       fresh.lastSync,
      eventsToday:    fresh.eventsToday,
      todayBreakdown: fresh.todayBreakdown ?? [],
      ignoredDomains: fresh.ignoredDomains ?? [],
    }
    window.postMessage({ type: UPDATE_EVENT }, '*')
  }, 30_000)

})()
