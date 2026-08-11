import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge, statusLabel } from "@/components/status-badge"
import { api } from "@/lib/api"
import { formatTime } from "@/lib/format"
import { dlqQuery, eventsQuery, logsQuery } from "@/lib/queries"
import { STATUSES, type Status } from "@/lib/types"

const ALL = "__all__"

export function LogsPage({ initialTab }: { initialTab: "log" | "dlq" }) {
  const [tab, setTab] = useState<string>(initialTab)
  const [status, setStatus] = useState<string>(ALL)
  const [type, setType] = useState<string>(ALL)

  return (
    <>
      <PageHeader
        title="Logs"
        action={
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="log">Send log</TabsTrigger>
              <TabsTrigger value="dlq">Needs attention</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      <main className="mx-auto grid w-full max-w-6xl gap-4 p-6">
        {tab === "log" ? (
          <LogTable
            status={status}
            type={type}
            onStatus={setStatus}
            onType={setType}
          />
        ) : (
          <DlqTable />
        )}
      </main>
    </>
  )
}

function LogTable({
  status,
  type,
  onStatus,
  onType,
}: {
  status: string
  type: string
  onStatus: (value: string) => void
  onType: (value: string) => void
}) {
  const { data: events } = useQuery(eventsQuery)
  const { data: lines } = useQuery(
    logsQuery({
      status: status === ALL ? undefined : status,
      type: type === ALL ? undefined : type,
    }),
  )

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={onStatus}>
          <SelectTrigger size="sm" className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {statusLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={onType}>
          <SelectTrigger size="sm" className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All event types</SelectItem>
            {(events ?? []).map((event) => (
              <SelectItem key={event.type} value={event.type}>
                {event.type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card overflow-hidden rounded-lg border">
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
            {(lines ?? []).map((line, index) => (
              <TableRow key={`${line.ts}-${index}`}>
                <TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                  {formatTime(line.ts)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={line.status as Status} />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {line.type ?? "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {line.to ?? "—"}
                </TableCell>
                <TableCell
                  className="text-muted-foreground max-w-80 truncate"
                  title={line.error ?? line.subject}
                >
                  {line.error ?? line.subject ?? ""}
                </TableCell>
              </TableRow>
            ))}
            {lines && lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Nothing in the last 7 days matching these filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function DlqTable() {
  const { data: entries } = useQuery(dlqQuery)
  const queryClient = useQueryClient()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["dlq"] })
    void queryClient.invalidateQueries({ queryKey: ["logs"] })
  }

  const resend = useMutation({
    mutationFn: (id: string) => api.post(`/api/dlq/${id}/resend`),
    onSuccess: () => {
      toast.success("Event re-queued")
      invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const discard = useMutation({
    mutationFn: (id: string) => api.delete(`/api/dlq/${id}`),
    onSuccess: () => {
      toast.success("Entry discarded")
      invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <div className="bg-card overflow-hidden rounded-lg border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Failed at</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Event</TableHead>
          <TableHead>To</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {(entries ?? []).map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap">
              {formatTime(entry.failed_at)}
            </TableCell>
            <TableCell className="max-w-80 truncate" title={entry.reason ?? ""}>
              {entry.reason ?? "—"}
            </TableCell>
            <TableCell className="font-mono text-xs">
              {entry.event?.type ?? "—"}
            </TableCell>
            <TableCell className="font-mono text-xs">
              {entry.event?.to ?? "—"}
            </TableCell>
            <TableCell className="space-x-1 whitespace-nowrap">
              <Button
                variant="ghost"
                size="icon"
                title="Resend"
                disabled={resend.isPending}
                onClick={() => resend.mutate(entry.id)}
              >
                <RotateCcw className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Discard"
                disabled={discard.isPending}
                onClick={() => discard.mutate(entry.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {entries && entries.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-muted-foreground">
              Nothing needs attention.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
    </div>
  )
}
