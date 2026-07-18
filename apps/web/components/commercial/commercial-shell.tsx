"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Calculator,
  Factory,
  LayoutDashboard,
  Settings2,
  UsersRound,
} from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

const navigation = [
  {
    href: "/commercial",
    icon: LayoutDashboard,
    label: "Commercial overview",
  },
  {
    href: "/commercial/customers",
    icon: UsersRound,
    label: "Customers",
  },
  {
    href: "/commercial/costing",
    icon: Calculator,
    label: "Product costing",
  },
]

export function CommercialShell({
  children,
  user,
}: {
  children: ReactNode
  user: { email: string; name: string }
}) {
  const pathname = usePathname()
  const current =
    navigation.find((item) =>
      item.href === "/commercial"
        ? pathname === item.href
        : pathname.startsWith(item.href)
    ) ?? navigation[0]!

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
          <SidebarGroup>
            <SidebarGroupLabel>Commercial</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigation.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        item.href === "/commercial"
                          ? pathname === item.href
                          : pathname.startsWith(item.href)
                      }
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Unified application</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/">
                      <Factory />
                      <span>Operations dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
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
              Unified commercial workflow
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
