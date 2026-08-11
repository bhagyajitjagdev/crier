import { queryOptions } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type {
  Analytics,
  Config,
  DlqEntry,
  EventType,
  Health,
  LogLine,
  Me,
  TemplateDetail,
  TemplateInfo,
} from "@/lib/types"

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: () => api.get<Me>("/api/auth/me"),
  staleTime: 60_000,
})

export const healthQuery = queryOptions({
  queryKey: ["health"],
  queryFn: () => api.get<Health>("/health"),
  refetchInterval: 15_000,
})

export const templatesQuery = queryOptions({
  queryKey: ["templates"],
  queryFn: () => api.get<TemplateInfo[]>("/api/templates"),
})

export const templateQuery = (name: string) =>
  queryOptions({
    queryKey: ["templates", name],
    queryFn: () => api.get<TemplateDetail>(`/api/templates/${name}`),
  })

export const eventsQuery = queryOptions({
  queryKey: ["events"],
  queryFn: () => api.get<EventType[]>("/api/events"),
})

export const sampleQuery = (eventType: string) =>
  queryOptions({
    queryKey: ["events", eventType, "sample"],
    queryFn: async () => {
      try {
        return await api.get<Record<string, unknown>>(
          `/api/events/${eventType}/sample`,
        )
      } catch {
        return null
      }
    },
  })

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: () => api.get<Config>("/api/settings"),
})

export const logsQuery = (filters: { status?: string; type?: string }) =>
  queryOptions({
    queryKey: ["logs", filters],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.status) params.set("status", filters.status)
      if (filters.type) params.set("type", filters.type)
      params.set("limit", "200")
      return api.get<LogLine[]>(`/api/logs?${params}`)
    },
    refetchInterval: 10_000,
  })

export const analyticsQuery = queryOptions({
  queryKey: ["logs", "analytics"],
  queryFn: () => api.get<Analytics>("/api/logs/analytics"),
  refetchInterval: 15_000,
})

export const dlqQuery = queryOptions({
  queryKey: ["dlq"],
  queryFn: () => api.get<DlqEntry[]>("/api/dlq"),
  refetchInterval: 15_000,
})
