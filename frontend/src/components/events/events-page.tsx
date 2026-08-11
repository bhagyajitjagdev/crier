import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleAlert, Pencil, Plus, Trash2, WandSparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CodeEditor, formatCode } from "@/components/code-editor"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageHeader } from "@/components/layout/page-header"
import { api } from "@/lib/api"
import { eventsQuery, templatesQuery } from "@/lib/queries"
import type { EventType } from "@/lib/types"

type FormState = {
  type: string
  template: string
  subject: string
  maxAge: string
  enabled: boolean
  fromAddress: string
  fromName: string
  sample: string
}

const EMPTY: FormState = {
  type: "",
  template: "",
  subject: "",
  maxAge: "",
  enabled: true,
  fromAddress: "",
  fromName: "",
  sample: '{\n  "name": "Ada"\n}',
}

export function EventsPage() {
  const { data: events } = useQuery(eventsQuery)
  const { data: templates } = useQuery(templatesQuery)
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [toDelete, setToDelete] = useState<string | null>(null)

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY)
    setOpen(true)
  }

  const openEdit = async (event: EventType) => {
    setEditing(event.type)
    let sample = ""
    try {
      const payload = await api.get<Record<string, unknown>>(
        `/api/events/${event.type}/sample`,
      )
      sample = JSON.stringify(payload, null, 2)
    } catch {
      sample = ""
    }
    setForm({
      type: event.type,
      template: event.template,
      subject: event.subject,
      maxAge: event.max_age_seconds?.toString() ?? "",
      enabled: event.enabled,
      fromAddress: event.from_address ?? "",
      fromName: event.from_name ?? "",
      sample,
    })
    setOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      let samplePayload: Record<string, unknown> | null = null
      if (form.sample.trim()) {
        try {
          samplePayload = JSON.parse(form.sample)
        } catch {
          throw new Error("Sample payload is not valid JSON")
        }
      }
      await api.put(`/api/events/${form.type.trim()}`, {
        template: form.template,
        subject: form.subject,
        max_age_seconds: form.maxAge ? Number(form.maxAge) : null,
        enabled: form.enabled,
        from_address: form.fromAddress.trim(),
        from_name: form.fromName.trim(),
      })
      if (samplePayload !== null) {
        await api.put(`/api/events/${form.type.trim()}/sample`, {
          payload: samplePayload,
        })
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Event type updated" : "Event type created")
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ["events"] })
    },
    onError: (error) => toast.error(error.message),
  })

  const toggleEnabled = useMutation({
    mutationFn: (event: EventType) =>
      api.put(`/api/events/${event.type}`, {
        template: event.template,
        subject: event.subject,
        max_age_seconds: event.max_age_seconds,
        enabled: !event.enabled,
        from_address: event.from_address ?? "",
        from_name: event.from_name ?? "",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
    onError: (error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: (type: string) => api.delete(`/api/events/${type}`),
    onSuccess: () => {
      toast.success("Event type deleted")
      void queryClient.invalidateQueries({ queryKey: ["events"] })
    },
    onError: (error) => toast.error(error.message),
  })

  // Reset stale form state when the sheet closes.
  useEffect(() => {
    if (!open) setForm(EMPTY)
  }, [open])

  return (
    <>
      <PageHeader
        title="Events"
        action={
          <Button size="sm" onClick={openCreate}>
            <Plus /> New event type
          </Button>
        }
      />
      <main className="mx-auto w-full max-w-6xl p-6">
        <div className="bg-card overflow-hidden rounded-lg border">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Max age</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(events ?? []).map((event) => (
              <TableRow key={event.type}>
                <TableCell className="font-mono text-xs font-medium">
                  {event.type}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    {event.template}
                    {!event.template_published ? (
                      <Badge variant="destructive" className="gap-1">
                        <CircleAlert className="size-3" /> unpublished
                      </Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-56 truncate">
                  {event.subject || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {event.max_age_seconds ? `${event.max_age_seconds}s` : "—"}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={event.enabled}
                    onCheckedChange={() => toggleEnabled.mutate(event)}
                  />
                </TableCell>
                <TableCell className="space-x-1 whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void openEdit(event)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setToDelete(event.type)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {events && events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No event types yet — create one and map it to a template.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
          </Table>
        </div>
      </main>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {editing ? `Edit ${editing}` : "New event type"}
            </SheetTitle>
            <SheetDescription>
              Events of this type render the mapped template with their
              payload.
            </SheetDescription>
          </SheetHeader>

          <div className="grid flex-1 content-start gap-4 overflow-y-auto px-4">
            <div className="grid gap-2">
              <Label htmlFor="event-type">Type</Label>
              <Input
                id="event-type"
                placeholder="workspace.invite"
                value={form.type}
                disabled={editing !== null}
                onChange={(event) =>
                  setForm({ ...form, type: event.target.value })
                }
              />
            </div>

            <div className="grid gap-2">
              <Label>Template</Label>
              <Select
                value={form.template}
                onValueChange={(template) => setForm({ ...form, template })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a template" />
                </SelectTrigger>
                <SelectContent>
                  {(templates ?? []).map((template) => (
                    <SelectItem key={template.name} value={template.name}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="event-subject">Subject</Label>
              <Input
                id="event-subject"
                placeholder="You're invited to {{ workspace_name }}"
                value={form.subject}
                onChange={(event) =>
                  setForm({ ...form, subject: event.target.value })
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="event-max-age">Max age (seconds)</Label>
              <Input
                id="event-max-age"
                type="number"
                placeholder="empty = no limit"
                value={form.maxAge}
                onChange={(event) =>
                  setForm({ ...form, maxAge: event.target.value })
                }
              />
              <p className="text-muted-foreground text-xs">
                Older events are parked instead of sent — set this for OTPs and
                login links.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="event-from-address">From address</Label>
                <Input
                  id="event-from-address"
                  placeholder="global default"
                  value={form.fromAddress}
                  onChange={(event) =>
                    setForm({ ...form, fromAddress: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="event-from-name">From name</Label>
                <Input
                  id="event-from-name"
                  placeholder="global default"
                  value={form.fromName}
                  onChange={(event) =>
                    setForm({ ...form, fromName: event.target.value })
                  }
                />
              </div>
              <p className="text-muted-foreground -mt-2 text-xs sm:col-span-2">
                Override the sender for this event type only — e.g.
                payments@ instead of noreply@.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="event-enabled">Enabled</Label>
              <Switch
                id="event-enabled"
                checked={form.enabled}
                onCheckedChange={(enabled) => setForm({ ...form, enabled })}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Sample payload (JSON)</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      setForm({
                        ...form,
                        sample: await formatCode(form.sample, "json"),
                      })
                    } catch {
                      toast.error("Sample payload is not valid JSON")
                    }
                  }}
                >
                  <WandSparkles /> Format
                </Button>
              </div>
              <div className="max-h-56 overflow-auto rounded-md border">
                <CodeEditor
                  value={form.sample}
                  onChange={(sample) => setForm({ ...form, sample })}
                  language="json"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Drives the editor preview and validates templates on publish.
              </p>
            </div>
          </div>

          <SheetFooter>
            <Button
              disabled={!form.type || !form.template || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {editing ? "Save changes" : "Create event type"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Delete ${toDelete}?`}
        description="Incoming events of this type will be parked as unmapped. The sample payload is removed too."
        confirmLabel="Delete"
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete)
          setToDelete(null)
        }}
      />
    </>
  )
}
