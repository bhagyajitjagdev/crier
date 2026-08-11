import { useState } from "react"
import { useForm } from "react-hook-form"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { CircleAlert, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BrandMark } from "@/components/brand-mark"
import { api } from "@/lib/api"
import { meQuery } from "@/lib/queries"

type Values = { username: string; password: string }

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { register, handleSubmit } = useForm<Values>({
    defaultValues: { username: "", password: "" },
  })

  const onSubmit = handleSubmit(async (values) => {
    setPending(true)
    setError(null)
    try {
      await api.post("/api/auth/login", values)
      // Dropped, not invalidated: ensureQueryData in the route guard would
      // happily return the stale signed-out answer and bounce us back here.
      queryClient.removeQueries({ queryKey: meQuery.queryKey })
      await router.navigate({ to: next ?? "/" })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  })

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center gap-2 text-center">
        <BrandMark className="size-7" />
        <h1 className="text-xl font-semibold">Welcome to Crier</h1>
        <p className="text-muted-foreground text-sm">
          Sign in with the credentials set on this server.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-8 grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            autoFocus
            {...register("username", { required: true })}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password", { required: true })}
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="text-destructive flex items-center gap-2 text-sm"
          >
            <CircleAlert className="size-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Sign in
        </Button>
      </form>
    </div>
  )
}
