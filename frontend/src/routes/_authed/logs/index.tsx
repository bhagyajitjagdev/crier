import { createFileRoute } from "@tanstack/react-router"
import { LogsPage } from "@/components/logs/logs-page"

export const Route = createFileRoute("/_authed/logs/")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === "string" ? { tab: search.tab } : {},
  component: LogsRoute,
})

function LogsRoute() {
  const { tab } = Route.useSearch()
  return <LogsPage initialTab={tab === "dlq" ? "dlq" : "log"} />
}
