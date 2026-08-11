import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { meQuery } from "@/lib/queries"

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    // authDisabled = running open on a private network; no login exists.
    if (!me.authDisabled && !me.user) {
      throw redirect({ to: "/login", search: { next: location.href } })
    }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
