"use client"

import { BriefcaseBusiness, MonitorSmartphone, Plus, UsersRound } from "lucide-react"
import { useRouter } from "next/navigation"
import type { ReactNode } from "react"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

export function AccessWorkspaceTabs({
  activeSection,
  canCreateRole,
  canManageDevices,
  children,
}: {
  activeSection: "create" | "devices" | "roles" | "staff"
  canCreateRole: boolean
  canManageDevices: boolean
  children: ReactNode
}) {
  const router = useRouter()

  return (
    <Tabs
      activationMode="manual"
      className="min-w-0 gap-4"
      onValueChange={(section) =>
        router.push(`/administration/access?section=${section}`, {
          scroll: false,
        })
      }
      value={activeSection}
    >
      <div className="overflow-x-auto border-b pb-1">
        <TabsList aria-label="Access administration sections" variant="line">
          {canCreateRole ? (
            <TabsTrigger value="create">
              <Plus data-icon="inline-start" /> Create Role
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="roles">
            <BriefcaseBusiness data-icon="inline-start" /> Application Roles
          </TabsTrigger>
          <TabsTrigger value="staff">
            <UsersRound data-icon="inline-start" /> Staff Accounts
          </TabsTrigger>
          {canManageDevices ? (
            <TabsTrigger value="devices">
              <MonitorSmartphone data-icon="inline-start" /> Devices
            </TabsTrigger>
          ) : null}
        </TabsList>
      </div>
      <TabsContent className="grid min-w-0 gap-4" value={activeSection}>
        {children}
      </TabsContent>
    </Tabs>
  )
}
