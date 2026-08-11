export type Me = { user: string | null; authDisabled: boolean }

export type TemplateInfo = {
  name: string
  has_draft: boolean
  has_published: boolean
}

export type TemplateDetail = {
  name: string
  draft: string | null
  published: string | null
}

export type EventType = {
  type: string
  template: string
  subject: string
  max_age_seconds: number | null
  enabled: boolean
  // Empty/absent = the global sender identity from Settings.
  from_address?: string
  from_name?: string
  has_sample: boolean
  template_published: boolean
}

export type SmtpConfig = {
  host: string
  port: number
  username: string
  password: string
  use_tls: boolean
  start_tls: boolean
  password_set?: boolean
}

export type Config = {
  from_address: string
  from_name: string
  smtp: SmtpConfig
}

export const STATUSES = [
  "sent",
  "failed",
  "skipped_unmapped",
  "skipped_expired",
  "skipped_duplicate",
  "test_sent",
] as const

export type Status = (typeof STATUSES)[number]

export type LogLine = {
  ts: string
  status: Status
  event_id?: string
  type?: string
  to?: string
  subject?: string
  error?: string
  template?: string
  payload?: Record<string, unknown>
}

export type Analytics = {
  days: { date: string; counts: Record<string, number> }[]
  types: { type: string; counts: Record<string, number> }[]
  totals: Record<string, number>
}

export type DlqEntry = {
  id: string
  reason: string | null
  failed_at: string | null
  event: {
    event_id?: string
    type?: string
    to?: string
    payload?: Record<string, unknown>
    created_at?: string
  } | null
}

export type RenderResult = {
  html: string
  subject: string
  used: string[]
  missing: string[]
  unused: string[]
}

export type Health = {
  status: string
  redis: boolean
  consumer_alive: boolean
  last_beat: string | null
}
