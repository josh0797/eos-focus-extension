// src/api.ts
// Sends events to the Supabase Edge Function with automatic retry.

import { Auth } from './storage'

export interface EventPayload {
  started_at:    string
  ended_at:      string
  duration_secs: number
  domain:        string
  url:           string
  title:         string
  favicon_url?:  string
}

export type SendResult =
  | { ok: true;  event_id: string; category: string; skipped?: false }
  | { ok: true;  skipped: true;    reason: string }
  | { ok: false; error: string;    status?: number }

const EDGE_FN_PATH  = '/functions/v1/track-extension-activity'
const RETRY_DELAYS  = [1000, 3000, 8000]

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function sendEvent(payload: EventPayload): Promise<SendResult> {
  const auth = await Auth.get()
  if (!auth) return { ok: false, error: 'Not authenticated' }

  const url = `${auth.supabaseUrl}${EDGE_FN_PATH}`

  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const res  = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${auth.accessToken}`,
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (res.status === 401) {
        await Auth.clear()
        return { ok: false, error: 'Session expired — reconnect in EOS Hub', status: 401 }
      }
      if (!res.ok) {
        if (attempt < 3) { await sleep(RETRY_DELAYS[attempt]); continue }
        return { ok: false, error: data.error ?? 'Unknown error', status: res.status }
      }
      if (data.skipped) return { ok: true, skipped: true, reason: data.reason }
      return { ok: true, event_id: data.event_id, category: data.category }

    } catch (err) {
      if (attempt < 3) { await sleep(RETRY_DELAYS[attempt]); continue }
      return { ok: false, error: `Network error: ${(err as Error).message}` }
    }
  }
  return { ok: false, error: 'Max retries exceeded' }
}

export async function verifyAuth(): Promise<boolean> {
  const auth = await Auth.get()
  if (!auth) return false
  try {
    const res = await fetch(`${auth.supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    })
    return res.ok
  } catch { return false }
}
