"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Settings2 } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

import { UnifiedSidebarNavigation } from "@/components/unified-sidebar-navigation"
import type { UnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  administrationNavigation,
  commercialNavigation,
  hrNavigation,
} from "@/lib/unified-navigation"

function isNavigationItemActive(pathname: string, href: string) {
  const hrefPath = href.split("?")[0] ?? href
  return hrefPath === "/" || hrefPath === "/commercial"
    ? pathname === hrefPath
    : pathname.startsWith(hrefPath)
}

export function CommercialShell({
  children,
  navigationAccess,
  user,
}: {
  children: ReactNode
  navigationAccess: UnifiedNavigationAccess
  user: { email: string; name: string }
}) {
  const pathname = usePathname()
  const current =
    [
      ...commercialNavigation,
      ...hrNavigation,
      ...administrationNavigation,
    ].find((item) => isNavigationItemActive(pathname, item.href)) ??
    commercialNavigation[0]!

  return (
    <SidebarProvider
      style={
        {
          "--header-height": "4rem",
          "--sidebar-width": "19rem",
        } as React.CSSProperties
      }
    >
      <Sidebar variant="inset">
        <SidebarHeader>
          <Link className="flex items-center px-2 py-2" href="/">
            <Image
              src="/mrm-green.svg"
              alt="MRMPL"
              width={792}
              height={176}
              priority
              className="h-8 w-auto max-w-full object-contain"
            />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <UnifiedSidebarNavigation navigationAccess={navigationAccess} />
        </SidebarContent>
        <SidebarFooter>
          <div className="grid gap-0.5 px-2 py-2">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-(--header-height) items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
          <SidebarTrigger />
          <Separator className="h-5" orientation="vertical" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">
              {current.label}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              Unified MRMPL workflow
            </p>
          </div>
          <Badge variant="outline">
            <Settings2 />
            PostgreSQL
          </Badge>
        </header>
        <main className="@container/main flex flex-1 flex-col gap-6 p-4 lg:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
