import { createFileRoute } from "@tanstack/react-router"
import { HomePage } from "@/components/home/home-page"

export const Route = createFileRoute("/_authed/")({
  component: HomePage,
})
