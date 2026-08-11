import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { api } from "@/lib/api"
import type { EventType } from "@/lib/types"

/** Create or configure an event type without leaving the studio. The
 * template mapping is implicit — the studio's current template. Subject and
 * sample payload are authored on the studio surface itself. */
export function EventTypeDialog({
  open,
  onOpenChange,
  templateName,
  editing,
  onSaved,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateName: string
  /** Present = configure this event type; absent = create a new one. */
  editing?: EventType
  onSaved: (eventType: string) => void
  onDeleted?: () => void
}) {
  const queryClient = useQueryClient()
  const [type, setType] = useState("")
  const [maxAge, setMaxAge] = useState("")
  const [fromAddress, setFromAddress] = useState("")
  const [fromName, setFromName] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setType(editing?.type ?? "")
    setMaxAge(editing?.max_age_seconds?.toString() ?? "")
    setFromAddress(editing?.from_address ?? "")
    setFromName(editing?.from_name ?? "")
    setEnabled(editing?.enabled ?? true)
  }, [open, editing])

  const save = useMutation({
    mutationFn: async () => {
      const name = type.trim()
      await api.put(`/api/events/${name}`, {
        template: templateName,
        subject: editing?.subject ?? "",
        max_age_seconds: maxAge ? Number(maxAge) : null,
        enabled,
        from_address: fromAddress.trim(),
        from_name: fromName.trim(),
      })
      return name
    },
    onSuccess: (name) => {
      toast.success(editing ? "Event type updated" : `${name} created`)
      void queryClient.invalidateQueries({ queryKey: ["events"] })
      onOpenChange(false)
      onSaved(name)
    },
    onError: (error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/api/events/${editing?.type}`),
    onSuccess: () => {
      toast.success("Event type deleted")
      void queryClient.invalidateQueries({ queryKey: ["events"] })
      onOpenChange(false)
      onDeleted?.()
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Configure ${editing.type}` : "New event type"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Delivery settings for this event type."
                : `Events of this type will render ${templateName}. Subject and sample payload are edited right on this page.`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="etd-type">Type</Label>
              <Input
                id="etd-type"
                placeholder="workspace.invite"
                value={type}
                disabled={editing !== undefined}
                onChange={(event) => setType(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="etd-max-age">Max age (seconds)</Label>
              <Input
                id="etd-max-age"
                type="number"
                placeholder="empty = no limit"
                value={maxAge}
                onChange={(event) => setMaxAge(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Older events are parked instead of sent — set this for OTPs
                and login links.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="etd-from-address">From address</Label>
                <Input
                  id="etd-from-address"
                  placeholder="global default"
                  value={fromAddress}
                  onChange={(event) => setFromAddress(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="etd-from-name">From name</Label>
                <Input
                  id="etd-from-name"
                  placeholder="global default"
                  value={fromName}
                  onChange={(event) => setFromName(event.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="etd-enabled">Enabled</Label>
              <Switch
                id="etd-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            {editing ? (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <Button
              disabled={!type.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="animate-spin" /> : null}
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${editing?.type}?`}
        description="Incoming events of this type will be parked as unmapped. Its sample payload is removed too."
        confirmLabel="Delete"
        pending={remove.isPending}
        onConfirm={() => {
          setConfirmDelete(false)
          remove.mutate()
        }}
      />
    </>
  )
}
