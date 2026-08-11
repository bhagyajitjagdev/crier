import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Send,
  Settings2,
  UploadCloud,
  WandSparkles,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CodeEditor, formatCode } from "@/components/code-editor"
import { EventTypeDialog } from "@/components/templates/event-type-dialog"
import { PageHeader } from "@/components/layout/page-header"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import { eventsQuery, sampleQuery, templateQuery } from "@/lib/queries"
import type { RenderResult } from "@/lib/types"

export function TemplateEditor({ name }: { name: string }) {
  const queryClient = useQueryClient()
  const { data: template } = useQuery(templateQuery(name))
  const { data: events } = useQuery(eventsQuery)
  const editorRef = useRef<ReactCodeMirrorRef>(null)

  const [draft, setDraft] = useState<string | null>(null)
  const [subjectDraft, setSubjectDraft] = useState<string | null>(null)
  const [sampleDraft, setSampleDraft] = useState<string | null>(null)
  const sampleOriginal = useRef<string | null>(null)
  const lastGoodPayload = useRef<Record<string, unknown>>({})

  const [previewOpen, setPreviewOpen] = useState(true)
  const [payloadOpen, setPayloadOpen] = useState(true)
  const [previewMode, setPreviewMode] = useState<"sample" | "placeholders">(
    "sample",
  )
  const [eventType, setEventType] = useState<string>("")
  const [preview, setPreview] = useState<RenderResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [payloadError, setPayloadError] = useState<string | null>(null)
  const [testOpen, setTestOpen] = useState(false)
  const [testTo, setTestTo] = useState("")
  const [testPayload, setTestPayload] = useState("{}")
  const [eventDialog, setEventDialog] = useState<"closed" | "create" | "edit">(
    "closed",
  )

  const linked = useMemo(
    () => (events ?? []).filter((event) => event.template === name),
    [events, name],
  )
  const spec = useMemo(
    () => linked.find((event) => event.type === eventType),
    [linked, eventType],
  )

  const sampleQ = useQuery({
    ...sampleQuery(eventType),
    enabled: eventType !== "",
  })

  // Hydrate local drafts once per source; switching event type re-hydrates.
  useEffect(() => {
    if (template && draft === null) {
      setDraft(template.draft ?? template.published ?? "")
    }
  }, [template, draft])
  useEffect(() => {
    setSubjectDraft(null)
    setSampleDraft(null)
    sampleOriginal.current = null
  }, [eventType])
  useEffect(() => {
    if (spec && subjectDraft === null) setSubjectDraft(spec.subject ?? "")
  }, [spec, subjectDraft])
  useEffect(() => {
    if (sampleDraft === null && sampleQ.isSuccess) {
      const text = sampleQ.data
        ? JSON.stringify(sampleQ.data, null, 2)
        : "{}"
      setSampleDraft(text)
      sampleOriginal.current = text
    }
  }, [sampleQ.isSuccess, sampleQ.data, sampleDraft])
  useEffect(() => {
    if (!eventType && linked.length > 0) setEventType(linked[0].type)
  }, [linked, eventType])

  const htmlDirty = draft !== null && draft !== (template?.draft ?? "")
  const subjectDirty =
    spec !== undefined &&
    subjectDraft !== null &&
    subjectDraft !== (spec.subject ?? "")
  const sampleDirty =
    sampleDraft !== null && sampleDraft !== sampleOriginal.current
  const dirty = htmlDirty || subjectDirty || sampleDirty

  // Live preview: debounce, render editor + subject + payload server-side,
  // leniently — a missing variable shows as literal {{ name }} and the
  // response carries the used/missing/unused analysis for the chips.
  useEffect(() => {
    if (draft === null || !previewOpen) return
    let payload: Record<string, unknown> | null = null
    if (previewMode === "placeholders") {
      payload = {}
    } else if (sampleDraft !== null) {
      try {
        payload = JSON.parse(sampleDraft)
        lastGoodPayload.current = payload as Record<string, unknown>
        setPayloadError(null)
      } catch {
        payload = lastGoodPayload.current
        setPayloadError("Payload JSON is invalid — previewing the last valid version")
      }
    }
    const timer = setTimeout(async () => {
      try {
        const result = await api.post<RenderResult>(
          `/api/templates/${name}/render`,
          {
            html: draft,
            subject: subjectDraft,
            payload,
            event_type: eventType || null,
            lenient: true,
          },
        )
        setPreview(result)
        setPreviewError(null)
      } catch (error) {
        setPreviewError(
          error instanceof Error ? error.message : String(error),
        )
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [draft, subjectDraft, sampleDraft, previewMode, previewOpen, eventType, name])

  const save = useMutation({
    mutationFn: async () => {
      if (htmlDirty) {
        await api.put(`/api/templates/${name}`, { html: draft ?? "" })
      }
      if (spec && subjectDirty) {
        await api.put(`/api/events/${eventType}`, {
          template: spec.template,
          subject: subjectDraft ?? "",
          max_age_seconds: spec.max_age_seconds,
          enabled: spec.enabled,
          from_address: spec.from_address ?? "",
          from_name: spec.from_name ?? "",
        })
      }
      if (sampleDirty && sampleDraft !== null) {
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(sampleDraft)
        } catch {
          throw new Error("Sample payload is not valid JSON")
        }
        await api.put(`/api/events/${eventType}/sample`, { payload: parsed })
        sampleOriginal.current = sampleDraft
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["templates", name] })
      void queryClient.invalidateQueries({ queryKey: ["events"] })
    },
    onError: (error) => toast.error(error.message),
  })

  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await save.mutateAsync()
      return api.post<{ validated_against: string[] }>(
        `/api/templates/${name}/publish`,
      )
    },
    onSuccess: (result) => {
      toast.success(
        result.validated_against.length > 0
          ? `Published — validated against ${result.validated_against.join(", ")}`
          : "Published (no sample payloads to validate against)",
      )
      void queryClient.invalidateQueries({ queryKey: ["templates"] })
    },
    onError: (error) => toast.error(error.message),
  })

  const testSend = useMutation({
    mutationFn: async () => {
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(testPayload)
      } catch {
        throw new Error("Variables are not valid JSON")
      }
      if (dirty) await save.mutateAsync()
      return api.post(`/api/templates/${name}/test-send`, {
        to: testTo,
        payload,
        event_type: eventType || null,
      })
    },
    onSuccess: () => {
      toast.success(`Test sent to ${testTo}`)
      setTestOpen(false)
    },
    onError: (error) => toast.error(error.message),
  })

  const format = async () => {
    try {
      setDraft(await formatCode(draft ?? "", "html"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const insertVariable = (variable: string) => {
    const view = editorRef.current?.view
    if (!view) return
    view.dispatch(view.state.replaceSelection(`{{ ${variable} }}`))
    view.focus()
  }

  const addToSample = (variable: string) => {
    try {
      const parsed = JSON.parse(sampleDraft || "{}")
      parsed[variable] = ""
      setSampleDraft(JSON.stringify(parsed, null, 2))
      setPayloadOpen(true)
    } catch {
      toast.error("Fix the payload JSON first")
    }
  }

  const openTestDialog = () => {
    setTestPayload(sampleDraft ?? "{}")
    setTestOpen(true)
  }

  const present = preview
    ? preview.used.filter((v) => !preview.missing.includes(v))
    : []

  return (
    <>
      <PageHeader
        title={name}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={openTestDialog}>
              <Send /> Test send
            </Button>
            <Button
              size="sm"
              disabled={publish.isPending}
              onClick={() => publish.mutate()}
            >
              {publish.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <UploadCloud />
              )}
              Publish
            </Button>
          </div>
        }
      />
      {/* Viewport-bounded (header is h-14) so the editor and preview scroll
          inside their panels instead of growing the page. */}
      <main className="flex h-[calc(100svh-3.5rem)] flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/templates">
              <ArrowLeft /> Templates
            </Link>
          </Button>
          {dirty ? <Badge variant="outline">Unsaved changes</Badge> : null}
          {template && !template.published ? (
            <Badge variant="outline">Never published</Badge>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              title="Format HTML"
              onClick={() => void format()}
            >
              <WandSparkles /> Format
            </Button>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger size="sm" className="min-w-44">
                <SelectValue placeholder="Event type…" />
              </SelectTrigger>
              <SelectContent>
                {linked.map((event) => (
                  <SelectItem key={event.type} value={event.type}>
                    {event.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {spec ? (
              <Button
                variant="ghost"
                size="icon"
                title={`Configure ${spec.type}`}
                onClick={() => setEventDialog("edit")}
              >
                <Settings2 />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              title="New event type for this template"
              onClick={() => setEventDialog("create")}
            >
              <Plus />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={previewOpen ? "Hide preview" : "Show preview"}
              onClick={() => setPreviewOpen((open) => !open)}
            >
              {previewOpen ? <PanelRightClose /> : <PanelRightOpen />}
            </Button>
          </div>
        </div>

        {/* Envelope strip: the subject belongs to the selected event type
            and is authored right here, not on the Events page. */}
        {spec ? (
          <div className="flex items-center gap-2">
            <Label
              htmlFor="studio-subject"
              className="text-muted-foreground shrink-0 text-xs"
            >
              Subject
            </Label>
            <Input
              id="studio-subject"
              className="h-8 flex-1 text-sm"
              placeholder="Subject — {{ variables }} work here too"
              value={subjectDraft ?? ""}
              onChange={(event) => setSubjectDraft(event.target.value)}
            />
          </div>
        ) : linked.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No event type sends this template yet —{" "}
            <button
              type="button"
              className="text-foreground underline underline-offset-2"
              onClick={() => setEventDialog("create")}
            >
              create one
            </button>{" "}
            to author its subject and sample payload here.
          </p>
        ) : null}

        <ResizablePanelGroup
          direction="horizontal"
          className="min-h-0 flex-1 rounded-md border"
        >
          <ResizablePanel defaultSize={50} minSize={25}>
            <div className="h-full overflow-auto">
              <CodeEditor
                editorRef={editorRef}
                value={draft ?? ""}
                onChange={setDraft}
                language="html"
                variables={preview ? present : undefined}
              />
            </div>
          </ResizablePanel>
          {previewOpen ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={20}>
                <div className="flex h-full flex-col">
                  {previewError ? (
                    <p className="text-destructive border-b px-3 py-1.5 text-xs">
                      {previewError}
                    </p>
                  ) : null}
                  {payloadError ? (
                    <p className="border-b px-3 py-1.5 text-xs text-amber-600 dark:text-amber-500">
                      {payloadError}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-2 border-b px-3 py-1">
                    <p className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                      Subject:{" "}
                      <span className="text-foreground font-medium">
                        {preview?.subject || "—"}
                      </span>
                    </p>
                    <Tabs
                      value={previewMode}
                      onValueChange={(mode) =>
                        setPreviewMode(mode as "sample" | "placeholders")
                      }
                    >
                      <TabsList className="h-7">
                        <TabsTrigger value="sample" className="px-2 text-xs">
                          Sample
                        </TabsTrigger>
                        <TabsTrigger
                          value="placeholders"
                          className="px-2 font-mono text-xs"
                        >
                          {"{{ }}"}
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  <iframe
                    title="Rendered preview"
                    sandbox=""
                    srcDoc={preview?.html ?? ""}
                    className="w-full flex-1 bg-white"
                  />
                  <div className="border-t">
                    {preview && preview.used.length + preview.unused.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
                        {present.map((variable) => (
                          <VariableChip
                            key={variable}
                            variable={variable}
                            tone="present"
                            title="Used in template, value in sample — click to insert at cursor"
                            onClick={() => insertVariable(variable)}
                          />
                        ))}
                        {preview.missing.map((variable) => (
                          <VariableChip
                            key={variable}
                            variable={variable}
                            tone="missing"
                            title="Used in template but missing from the sample — click to add it"
                            onClick={() => addToSample(variable)}
                            icon={<Plus className="size-2.5" />}
                          />
                        ))}
                        {preview.unused.map((variable) => (
                          <VariableChip
                            key={variable}
                            variable={variable}
                            tone="unused"
                            title="In the sample but unused — click to insert at cursor"
                            onClick={() => insertVariable(variable)}
                          />
                        ))}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 px-3 py-1.5 text-xs"
                      onClick={() => setPayloadOpen((open) => !open)}
                    >
                      {payloadOpen ? (
                        <ChevronDown className="size-3" />
                      ) : (
                        <ChevronUp className="size-3" />
                      )}
                      Sample payload
                      {eventType ? (
                        <span className="text-muted-foreground/60">
                          — saved on {eventType}
                        </span>
                      ) : null}
                    </button>
                    {payloadOpen && sampleDraft !== null ? (
                      <div className="h-36 overflow-auto border-t">
                        <CodeEditor
                          value={sampleDraft}
                          onChange={setSampleDraft}
                          language="json"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </main>

      <EventTypeDialog
        open={eventDialog !== "closed"}
        onOpenChange={(open) => !open && setEventDialog("closed")}
        templateName={name}
        editing={eventDialog === "edit" ? spec : undefined}
        onSaved={(created) => setEventType(created)}
        onDeleted={() => setEventType("")}
      />

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send a test email</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="test-to">To</Label>
              <Input
                id="test-to"
                type="email"
                placeholder="you@example.com"
                value={testTo}
                onChange={(event) => setTestTo(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Variables</Label>
              <div className="max-h-64 overflow-auto rounded-md border">
                <CodeEditor
                  value={testPayload}
                  onChange={setTestPayload}
                  language="json"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Prefilled from the payload panel — tweak values freely, the
                saved sample is untouched.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!testTo || testSend.isPending}
              onClick={() => testSend.mutate()}
            >
              {testSend.isPending ? <Loader2 className="animate-spin" /> : null}
              Send test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const CHIP_TONES = {
  present:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  missing:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  unused: "border-border bg-muted text-muted-foreground",
} as const

function VariableChip({
  variable,
  tone,
  title,
  onClick,
  icon,
}: {
  variable: string
  tone: keyof typeof CHIP_TONES
  title: string
  onClick: () => void
  icon?: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] leading-4 transition-opacity hover:opacity-75",
        CHIP_TONES[tone],
      )}
    >
      {icon}
      {variable}
    </button>
  )
}
