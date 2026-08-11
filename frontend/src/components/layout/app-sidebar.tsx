import { Link, useRouter } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  FileCode2,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  Zap,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { BrandMark } from "@/components/brand-mark"
import { api } from "@/lib/api"
import { meQuery } from "@/lib/queries"

const nav = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/templates", label: "Templates", icon: FileCode2 },
  { to: "/events", label: "Events", icon: Zap },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings },
] as const

export function AppSidebar() {
  const { data: me } = useQuery(meQuery)
  const router = useRouter()
  const queryClient = useQueryClient()

  const logout = async () => {
    await api.post("/api/auth/logout")
    queryClient.removeQueries({ queryKey: meQuery.queryKey })
    await router.navigate({ to: "/login" })
  }

  return (
    <Sidebar>
      <SidebarHeader className="h-14 justify-center px-4">
        <div className="flex items-center gap-2">
          <BrandMark className="size-5 shrink-0" />
          <span className="font-mono text-sm font-semibold tracking-tight">
            crier
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map(({ to, label, icon: Icon }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton asChild>
                    <Link
                      to={to}
                      activeOptions={{ exact: to === "/" }}
                      activeProps={{ "data-active": true }}
                      className="relative data-active:bg-sidebar-accent data-active:font-medium data-active:before:absolute data-active:before:inset-y-1.5 data-active:before:left-0 data-active:before:w-0.5 data-active:before:rounded-full data-active:before:bg-primary"
                    >
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {me?.user ? (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={logout}>
                <LogOut />
                <span>Sign out {me.user}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      ) : null}
    </Sidebar>
  )
}
