// src/popup.tsx
// EOS Focus popup UI.

import React, { useState, useEffect, useCallback } from 'react'
import { createRoot } from 'react-dom/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DomainStat {
  domain:       string
  durationSecs: number
  category:     string
  lastSeen:     string
}

interface Status {
  isConnected:    boolean
  userId:         string | null
  autoTracking:   boolean
  activeSession:  { domain: string; title: string; started_at: string } | null
  eventsToday:    number
  lastSync:       string | null
  todayBreakdown: DomainStat[]
  ignoredDomains: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function elapsed(startedAt: string): string {
  const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`
  return `${sec}s`
}

function fmtDur(secs: number): string {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function msg(type: string, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra })
}

const CATEGORY_COLORS: Record<string, string> = {
  deep_work: '#1B6EF3', meetings: '#7C3AED',
  admin: '#F59E0B', communication: '#EF4444', other: '#94A3B8',
}
const CATEGORY_ICONS: Record<string, string> = {
  deep_work: '🎯', meetings: '📅', admin: '📋', communication: '💬', other: '⏱',
}

function computeInsight(breakdown: DomainStat[], totalSecs: number): string | null {
  if (!breakdown.length || totalSecs < 1800) return null
  const sum  = (cat: string) => breakdown.filter(d => d.category === cat).reduce((a, d) => a + d.durationSecs, 0)
  const commPct = Math.round((sum('communication') / totalSecs) * 100)
  const deepPct = Math.round((sum('deep_work')     / totalSecs) * 100)
  const meetPct = Math.round((sum('meetings')      / totalSecs) * 100)
  if (commPct >= 50) return `⚠️ ${commPct}% in communication — deep work is being displaced`
  if (meetPct >= 40) return `⚠️ ${meetPct}% in meetings — consider auditing which are necessary`
  if (deepPct >= 50) return `✅ ${deepPct}% in deep work — you're in a great rhythm today`
  return null
}

// ── Styles ────────────────────────────────────────────────────────────────────

const css = {
  header: {
    background: 'linear-gradient(135deg,#0A2540,#1B6EF3)',
    padding: '13px 14px', display: 'flex', alignItems: 'center', gap: '10px',
  } as React.CSSProperties,
  logo: {
    width: 34, height: 34, borderRadius: '9px',
    background: 'rgba(255,255,255,0.15)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '19px', flexShrink: 0,
  } as React.CSSProperties,
  body: { padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: '9px' } as React.CSSProperties,
  card: { background: 'white', border: '1px solid #E8ECF2', borderRadius: '11px', padding: '11px 13px' } as React.CSSProperties,
  label: { color: '#6B7A99', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' } as React.CSSProperties,
  btn: (bg: string, light?: boolean): React.CSSProperties => ({
    width: '100%', padding: '8px', borderRadius: '9px', border: 'none', cursor: 'pointer',
    background: light ? `${bg}18` : bg, color: light ? bg : 'white',
    fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
  }),
}

// ── Component ─────────────────────────────────────────────────────────────────

function Popup() {
  const [status, setStatus] = useState<Status | null>(null)
  const [, setTick]         = useState(0)

  const fetchStatus = useCallback(async () => {
    const s = await msg('GET_STATUS')
    setStatus(s)
  }, [])

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 5000)
    return () => clearInterval(id)
  }, [fetchStatus])

  useEffect(() => {
    if (!status?.activeSession) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [status?.activeSession?.started_at])

  if (!status) return (
    <div>
      <div style={css.header}>
        <div style={css.logo}>⏱</div>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>Loading...</p>
      </div>
    </div>
  )

  const dot = (color: string) => (
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }}/>
  )

  const statusColor = !status.isConnected ? '#EF4444' : status.autoTracking ? '#10b981' : '#F59E0B'
  const statusLabel = !status.isConnected ? 'Not connected' : status.autoTracking ? 'Active' : 'Paused'

  return (
    <div>
      {/* Header */}
      <div style={css.header}>
        <div style={css.logo}>⏱</div>
        <div style={{ flex: 1 }}>
          <p style={{ color: 'white', fontSize: '13px', fontWeight: 700 }}>EOS Focus</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1px' }}>
            {dot(statusColor)}
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '11px' }}>{statusLabel}</p>
          </div>
        </div>
        {status.eventsToday > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '3px 8px', textAlign: 'center' }}>
            <p style={{ color: 'white', fontSize: '15px', fontWeight: 800, lineHeight: 1 }}>{status.eventsToday}</p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '9px' }}>today</p>
          </div>
        )}
      </div>

      <div style={css.body}>
        {/* Not connected */}
        {!status.isConnected && (
          <div style={{ ...css.card, background: '#FEF3C7', border: '1px solid #FDE68A' }}>
            <p style={{ color: '#78350F', fontSize: '12px', lineHeight: 1.5 }}>
              Open <strong>EOS Hub → Time Tracking</strong> and click "Connect Extension".
            </p>
          </div>
        )}

        {/* Active session */}
        {status.isConnected && status.activeSession && (
          <div style={{ ...css.card, borderLeft: '3px solid #10b981' }}>
            <p style={css.label}>Active session</p>
            <p style={{ color: '#0A2540', fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
              {elapsed(status.activeSession.started_at)}
            </p>
            <p style={{ color: '#6B7A99', fontSize: '11px', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🌐 {status.activeSession.domain}
            </p>
          </div>
        )}

        {/* Stats + sync */}
        {status.isConnected && status.lastSync && (
          <div style={{ ...css.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={css.label}>Last sync</p>
              <p style={{ color: '#0A2540', fontSize: '12px', fontWeight: 600, marginTop: '2px' }}>
                {new Date(status.lastSync).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={css.label}>Events today</p>
              <p style={{ color: '#0A2540', fontSize: '16px', fontWeight: 800, marginTop: '2px' }}>{status.eventsToday}</p>
            </div>
          </div>
        )}

        {/* Today breakdown */}
        {status.isConnected && status.todayBreakdown && status.todayBreakdown.length > 0 && (() => {
          const top     = status.todayBreakdown.slice(0, 5)
          const total   = status.todayBreakdown.reduce((a, d) => a + d.durationSecs, 0)
          const insight = computeInsight(status.todayBreakdown, total)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ ...css.card, padding: '10px 13px' }}>
                <p style={{ ...css.label, marginBottom: '8px' }}>TODAY — {fmtDur(total)} total</p>
                {top.map(d => {
                  const pct   = Math.round((d.durationSecs / total) * 100)
                  const color = CATEGORY_COLORS[d.category] ?? '#94A3B8'
                  const icon  = CATEGORY_ICONS[d.category]  ?? '⏱'
                  return (
                    <div key={d.domain} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                      <span style={{ fontSize: '11px', flexShrink: 0 }}>{icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span style={{ color: '#0A2540', fontSize: '11px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>{d.domain}</span>
                          <span style={{ color: '#6B7A99', fontSize: '10px', fontWeight: 600 }}>{fmtDur(d.durationSecs)}</span>
                        </div>
                        <div style={{ height: '3px', background: '#EEF2FF', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px' }}/>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {insight && (
                <div style={{ background: insight.startsWith('✅') ? '#F0FDF4' : '#FEF3C7', border: `1px solid ${insight.startsWith('✅') ? '#BBF7D0' : '#FDE68A'}`, borderRadius: '10px', padding: '8px 12px' }}>
                  <p style={{ color: insight.startsWith('✅') ? '#065F46' : '#78350F', fontSize: '11px', lineHeight: 1.4 }}>{insight}</p>
                </div>
              )}
            </div>
          )
        })()}

        {/* Actions */}
        {status.isConnected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button
              onClick={async () => { await msg('SET_AUTO_TRACKING', { enabled: !status.autoTracking }); fetchStatus() }}
              style={css.btn(status.autoTracking ? '#F59E0B' : '#10b981')}>
              {status.autoTracking ? '⏸ Pause tracking' : '▶ Resume tracking'}
            </button>
            {status.activeSession && (
              <button onClick={async () => { await msg('FLUSH_NOW'); fetchStatus() }} style={css.btn('#6B7A99', true)}>
                ⬆ Send current session
              </button>
            )}
            <button
              onClick={() => chrome.tabs.create({ url: 'https://eos-update2.pages.dev/?tab=time' })}
              style={css.btn('#1B6EF3', true)}>
              📊 View in EOS Hub
            </button>
          </div>
        )}

        <p style={{ color: '#B0BAD0', fontSize: '10px', textAlign: 'center' }}>
          EOS Focus v{chrome.runtime.getManifest().version}
        </p>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Popup/>)
