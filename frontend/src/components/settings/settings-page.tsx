import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, PlugZap, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { PageHeader } from "@/components/layout/page-header"
import { api } from "@/lib/api"
import { settingsQuery } from "@/lib/queries"
import type { Config } from "@/lib/types"

export function SettingsPage() {
  const { data: config } = useQuery(settingsQuery)
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Config | null>(null)
  const [testTo, setTestTo] = useState("")

  // Hydrate once; afterwards the form owns its state.
  useEffect(() => {
    if (config && form === null) setForm(structuredClone(config))
  }, [config, form])

  const save = useMutation({
    mutationFn: (next: Config) => api.put<Config>("/api/settings", next),
    onSuccess: (saved) => {
      toast.success("Settings saved")
      queryClient.setQueryData(settingsQuery.queryKey, saved)
      setForm(structuredClone(saved))
    },
    onError: (error) => toast.error(error.message),
  })

  const test = useMutation({
    mutationFn: (to?: string) =>
      api.post<{ ok: boolean; error?: string }>("/api/settings/test", {
        to: to || null,
      }),
    onSuccess: (result, to) => {
      if (result.ok) {
        toast.success(to ? `Test email sent to ${to}` : "SMTP connection OK")
      } else {
        toast.error(result.error ?? "Test failed")
      }
    },
    onError: (error) => toast.error(error.message),
  })

  if (!form) return null

  const smtp = form.smtp
  const setSmtp = (patch: Partial<Config["smtp"]>) =>
    setForm({ ...form, smtp: { ...smtp, ...patch } })

  return (
    <>
      <PageHeader
        title="Settings"
        action={
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate(form)}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        }
      />
      <main className="mx-auto grid w-full max-w-2xl gap-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sender identity</CardTitle>
            <CardDescription>
              Every email goes out with this from line.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="from-address">From address</Label>
              <Input
                id="from-address"
                placeholder="noreply@example.com"
                value={form.from_address}
                onChange={(event) =>
                  setForm({ ...form, from_address: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="from-name">From name</Label>
              <Input
                id="from-name"
                value={form.from_name}
                onChange={(event) =>
                  setForm({ ...form, from_name: event.target.value })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">SMTP</CardTitle>
            <CardDescription>
              Stored in the data directory, editable without a restart. Point
              it at Mailpit locally, your provider in production.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <div className="grid gap-2">
                <Label htmlFor="smtp-host">Host</Label>
                <Input
                  id="smtp-host"
                  placeholder="smtp.zeptomail.in"
                  value={smtp.host}
                  onChange={(event) => setSmtp({ host: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp-port">Port</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  value={smtp.port}
                  onChange={(event) =>
                    setSmtp({ port: Number(event.target.value) })
                  }
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="smtp-username">Username</Label>
                <Input
                  id="smtp-username"
                  autoComplete="off"
                  value={smtp.username}
                  onChange={(event) =>
                    setSmtp({ username: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp-password">Password</Label>
                <Input
                  id="smtp-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={smtp.password_set ? "(unchanged)" : ""}
                  value={smtp.password}
                  onChange={(event) =>
                    setSmtp({ password: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="smtp-starttls">STARTTLS</Label>
                <p className="text-muted-foreground text-xs">
                  Upgrade after connect — the usual choice for port 587.
                </p>
              </div>
              <Switch
                id="smtp-starttls"
                checked={smtp.start_tls}
                onCheckedChange={(start_tls) =>
                  setSmtp({ start_tls, use_tls: start_tls ? false : smtp.use_tls })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="smtp-tls">Implicit TLS</Label>
                <p className="text-muted-foreground text-xs">
                  TLS from the first byte — port 465.
                </p>
              </div>
              <Switch
                id="smtp-tls"
                checked={smtp.use_tls}
                onCheckedChange={(use_tls) =>
                  setSmtp({ use_tls, start_tls: use_tls ? false : smtp.start_tls })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test</CardTitle>
            <CardDescription>
              Uses the saved settings — hit Save first if you changed anything.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <Button
              variant="outline"
              disabled={test.isPending}
              onClick={() => test.mutate(undefined)}
            >
              <PlugZap /> Test connection
            </Button>
            <div className="flex items-end gap-2">
              <div className="grid gap-2">
                <Label htmlFor="test-to">Send a test email to</Label>
                <Input
                  id="test-to"
                  type="email"
                  placeholder="you@example.com"
                  value={testTo}
                  onChange={(event) => setTestTo(event.target.value)}
                />
              </div>
              <Button
                variant="outline"
                disabled={!testTo || test.isPending}
                onClick={() => test.mutate(testTo)}
              >
                <Send /> Send
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  )
}
