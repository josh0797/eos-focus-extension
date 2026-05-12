// src/utils.ts
// Domain helpers and category mapping for EOS Focus.

type TimeCategory = 'deep_work' | 'meetings' | 'admin' | 'communication' | 'other'

const DOMAIN_MAP: Record<string, TimeCategory> = {
  // Communication
  'gmail.com': 'communication', 'mail.google.com': 'communication',
  'outlook.com': 'communication', 'outlook.live.com': 'communication',
  'outlook.office.com': 'communication', 'slack.com': 'communication',
  'app.slack.com': 'communication', 'discord.com': 'communication',
  'teams.microsoft.com': 'communication', 'whatsapp.com': 'communication',
  'web.whatsapp.com': 'communication', 'telegram.org': 'communication',
  'web.telegram.org': 'communication', 'mail.yahoo.com': 'communication',
  // Meetings
  'calendar.google.com': 'meetings', 'meet.google.com': 'meetings',
  'zoom.us': 'meetings', 'app.zoom.us': 'meetings',
  'teams.live.com': 'meetings', 'whereby.com': 'meetings',
  'loom.com': 'meetings', 'calendly.com': 'meetings',
  // Deep work
  'github.com': 'deep_work', 'gitlab.com': 'deep_work',
  'vercel.com': 'deep_work', 'netlify.com': 'deep_work',
  'supabase.com': 'deep_work', 'app.supabase.com': 'deep_work',
  'npmjs.com': 'deep_work', 'figma.com': 'deep_work',
  'notion.so': 'deep_work', 'docs.google.com': 'deep_work',
  'drive.google.com': 'deep_work', 'stackoverflow.com': 'deep_work',
  'linear.app': 'deep_work', 'miro.com': 'deep_work',
  'developer.mozilla.org': 'deep_work',
  // Admin
  'stripe.com': 'admin', 'dashboard.stripe.com': 'admin',
  'quickbooks.com': 'admin', 'hubspot.com': 'admin',
  'app.hubspot.com': 'admin', 'salesforce.com': 'admin',
  'monday.com': 'admin', 'asana.com': 'admin',
  'trello.com': 'admin', 'clickup.com': 'admin',
  'paypal.com': 'admin',
  // EOS Hub — do not track
  'eos-update2.pages.dev': 'other',
  'colma.odoo.com': 'other',
  'localhost': 'other',
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').replace(/:\d+$/, '')
  } catch { return '' }
}

export function getCategoryForDomain(domain: string): TimeCategory {
  const n = domain.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '')
  if (DOMAIN_MAP[n]) return DOMAIN_MAP[n]
  const parts = n.split('.')
  if (parts.length > 2) {
    const root = parts.slice(-2).join('.')
    if (DOMAIN_MAP[root]) return DOMAIN_MAP[root]
  }
  if (/^(mail|inbox)\./.test(n))      return 'communication'
  if (/^(meet|call|video)\./.test(n)) return 'meetings'
  if (/^(docs|wiki|help)\./.test(n))  return 'deep_work'
  if (/^(admin|billing)\./.test(n))   return 'admin'
  return 'other'
}

export function secondsBetween(isoA: string, isoB: string): number {
  return Math.floor((new Date(isoB).getTime() - new Date(isoA).getTime()) / 1000)
}

export function isInternalUrl(url: string): boolean {
  const d = extractDomain(url)
  return (
    d === 'eos-update2.pages.dev'    ||
    d === 'colma.odoo.com'           ||
    d === 'localhost'                ||
    url.startsWith('chrome://')      ||
    url.startsWith('chrome-extension://')
  )
}
