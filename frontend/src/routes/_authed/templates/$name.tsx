import { createFileRoute } from "@tanstack/react-router"
import { TemplateEditor } from "@/components/templates/template-editor"

export const Route = createFileRoute("/_authed/templates/$name")({
  component: TemplateEditorPage,
})

function TemplateEditorPage() {
  const { name } = Route.useParams()
  return <TemplateEditor name={name} />
}
