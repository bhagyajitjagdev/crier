import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { CircleAlert, Inbox } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/status-badge"
import { formatTime } from "@/lib/format"
import {
  analyticsQuery,
  dlqQuery,
  healthQuery,
  logsQuery,
} from "@/lib/queries"

function sum(counts: Record<string, number>, keys: string[]): number {
  return keys.reduce((total, key) => total + (counts[key] ?? 0), 0)
}

export function HomePage() {
  const { data: analytics } = useQuery(analyticsQuery)
  const { data: dlq } = useQuery(dlqQuery)
  const { data: recent } = useQuery(logsQuery({}))
  const { data: health } = useQuery(healthQuery)

  const totals = analytics?.totals ?? {}
  const tiles = [
    { label: "Sent", value: sum(totals, ["sent"]) },
    { label: "Failed", value: sum(totals, ["failed"]) },
    {
      label: "Skipped",
      value: sum(totals, [
        "skipped_unmapped",
        "skipped_expired",
        "skipped_duplicate",
      ]),
    },
    { label: "Test sends", value: sum(totals, ["test_sent"]) },
  ]

  return (
    <>
      <PageHeader
        title="Home"
        action={
          health && health.status !== "ok" ? (
            <Badge variant="destructive" className="gap-1">
              <CircleAlert className="size-3" />
              {health.redis ? "Consumer stalled" : "Redis unreachable"}
            </Badge>
          ) : null
        }
      />
      <main className="mx-auto grid w-full max-w-5xl gap-4 p-6">
        <section className="bg-card overflow-hidden rounded-lg border">
          <p className="text-muted-foreground border-b px-4 py-2 font-mono text-[11px] tracking-widest uppercase">
            Dispatch · last 7 days
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x">
            {tiles.map((tile) => (
              <div key={tile.label} className="px-4 py-3">
                <p className="text-muted-foreground text-xs">{tile.label}</p>
                <p className="mt-1 font-mono text-2xl font-medium tabular-nums">
                  {tile.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {dlq && dlq.length > 0 ? (
          <Card className="border-amber-500/40">
            <CardContent className="flex items-center gap-3 py-1">
              <Inbox className="size-5 text-amber-500" />
              <p className="text-sm">
                <span className="font-medium">{dlq.length}</span>{" "}
                {dlq.length === 1 ? "event needs" : "events need"} attention —
                failed, expired, or unmapped.
              </p>
              <Button asChild variant="outline" size="sm" className="ml-auto">
                <Link to="/logs" search={{ tab: "dlq" }}>
                  Review
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recent && recent.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.slice(0, 10).map((line, index) => (
                    <TableRow key={`${line.ts}-${index}`}>
                      <TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                        {formatTime(line.ts)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={line.status} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {line.type ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {line.to ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-64 truncate">
                        {line.error ?? line.subject ?? ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground py-4 text-sm">
                Nothing yet — publish an event to crier:events and it will show
                up here.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  )
}
