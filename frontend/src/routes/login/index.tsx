import { createFileRoute, redirect } from "@tanstack/react-router"
import { LoginForm } from "@/components/auth/login-form"
import { meQuery } from "@/lib/queries"

export const Route = createFileRoute("/login/")({
  validateSearch: (search: Record<string, unknown>): { next?: string } =>
    typeof search.next === "string" ? { next: search.next } : {},
  beforeLoad: async ({ context, search }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me.authDisabled || me.user) throw redirect({ to: search.next ?? "/" })
  },
  component: LoginPage,
})

function LoginPage() {
  const { next } = Route.useSearch()

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <LoginForm next={next} />
    </main>
  )
}
