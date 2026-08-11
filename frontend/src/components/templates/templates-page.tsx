import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageHeader } from "@/components/layout/page-header"
import { api } from "@/lib/api"
import { templatesQuery } from "@/lib/queries"

const STARTER = `<html>
  <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
    <h1>Subject goes in the event type</h1>
    <p>Use {{ variables }} from the event payload.</p>
  </body>
</html>
`

export function TemplatesPage() {
  const { data: templates } = useQuery(templatesQuery)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [toDelete, setToDelete] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (name: string) =>
      api.put(`/api/templates/${name}`, { html: STARTER }),
    onSuccess: async (_data, name) => {
      await queryClient.invalidateQueries({ queryKey: ["templates"] })
      setCreateOpen(false)
      await navigate({ to: "/templates/$name", params: { name } })
    },
    onError: (error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: (name: string) => api.delete(`/api/templates/${name}`),
    onSuccess: () => {
      toast.success("Template deleted")
      void queryClient.invalidateQueries({ queryKey: ["templates"] })
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <>
      <PageHeader
        title="Templates"
        action={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus /> New template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New template</DialogTitle>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="template-name">Name</Label>
                <Input
                  id="template-name"
                  placeholder="workspace-invite"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Letters, digits, dots, dashes, underscores.
                </p>
              </div>
              <DialogFooter>
                <Button
                  disabled={!newName || create.isPending}
                  onClick={() => create.mutate(newName.trim())}
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <main className="mx-auto w-full max-w-5xl p-6">
        <div className="bg-card overflow-hidden rounded-lg border">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(templates ?? []).map((template) => (
              <TableRow key={template.name}>
                <TableCell>
                  <Link
                    to="/templates/$name"
                    params={{ name: template.name }}
                    className="font-medium hover:underline"
                  >
                    {template.name}
                  </Link>
                </TableCell>
                <TableCell className="space-x-2">
                  {template.has_published ? (
                    <Badge variant="secondary">Published</Badge>
                  ) : (
                    <Badge variant="outline">Never published</Badge>
                  )}
                  {template.has_draft && !template.has_published ? (
                    <Badge variant="outline">Draft</Badge>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setToDelete(template.name)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {templates && templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  No templates yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
          </Table>
        </div>
      </main>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Delete ${toDelete}?`}
        description="Removes both the draft and the published version. Event types pointing at it will fail to render."
        confirmLabel="Delete"
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete)
          setToDelete(null)
        }}
      />
    </>
  )
}
