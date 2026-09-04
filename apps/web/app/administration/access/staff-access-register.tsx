import Link from "next/link"
import { Pencil, UsersRound } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

type StaffAccessUser = {
  departments: string[]
  designations: string[]
  email: string
  employeeCode: string | null
  id: string
  inheritedRoleKeys: string[]
  name: string
  overrides: {
    effect: "allow" | "deny"
    permissionKey: string
  }[]
  roleKeys: string[]
}

export function StaffAccessRegister({
  canAssignRoles,
  users,
}: {
  canAssignRoles: boolean
  users: StaffAccessUser[]
}) {
  if (!users.length) {
    return (
      <StandardState
        description="Provision The First Administrator With The Explicit Cli Command, Then Create Staff Accounts Here."
        icon={UsersRound}
        title="No Staff Accounts"
      />
    )
  }

  return (
    <OperationalTable
      className="min-w-[72rem] table-fixed"
      filterStorageKey="access-administration-staff"
    >
      <TableHeader>
        <TableRow>
          <TableHead className="w-[10%]">Employee ID</TableHead>
          <TableHead className="w-[18%]">Employee Name</TableHead>
          <TableHead className="w-[15%]">Designation</TableHead>
          <TableHead className="w-[15%]">Department</TableHead>
          <TableHead className="w-[18%]">Roles</TableHead>
          <TableHead className="w-[14%]">Overrides</TableHead>
          <TableHead className="w-[10%]">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="align-top font-medium whitespace-normal">
              {user.employeeCode ?? "—"}
            </TableCell>
            <TableCell className="align-top whitespace-normal">
              <div className="grid min-w-0 grid-cols-1 gap-0.5 wrap-anywhere">
                <span className="font-medium">{user.name}</span>
                <span className="text-xs text-muted-foreground">
                  {user.email}
                </span>
              </div>
            </TableCell>
            <TableCell className="align-top whitespace-normal">
              {user.designations.join(", ") || "—"}
            </TableCell>
            <TableCell className="align-top whitespace-normal">
              {user.departments.join(", ") || "—"}
            </TableCell>
            <TableCell className="align-top whitespace-normal">
              <div className="flex flex-wrap gap-1.5">
                {user.roleKeys.length || user.inheritedRoleKeys.length ? (
                  [
                    ...user.roleKeys.map((roleKey) => ({
                      roleKey,
                      source: "direct" as const,
                    })),
                    ...user.inheritedRoleKeys.map((roleKey) => ({
                      roleKey,
                      source: "post" as const,
                    })),
                  ].map(({ roleKey, source }) => (
                    <Badge
                      asChild
                      className="h-auto min-h-7 min-w-0 shrink text-left whitespace-normal"
                      key={`${source}:${roleKey}`}
                      variant="secondary"
                    >
                      <Link
                        aria-label={`View ${roleKey} rights (${source})`}
                        href={{
                          pathname: "/administration/access",
                          query: {
                            section: "roles",
                            role: roleKey,
                            from: "staff",
                          },
                        }}
                      >
                        <span className="wrap-anywhere">
                          {roleKey} · {source}
                        </span>
                      </Link>
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No Application Roles
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="align-top whitespace-normal">
              <div className="flex flex-wrap gap-1.5">
                {user.overrides.length ? (
                  user.overrides.map((override) => (
                    <Badge
                      className="h-auto max-w-full wrap-anywhere whitespace-normal"
                      key={override.permissionKey}
                      variant={
                        override.effect === "deny" ? "destructive" : "outline"
                      }
                    >
                      {override.effect}: {override.permissionKey}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No Overrides
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="align-top text-right whitespace-normal">
              {canAssignRoles ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`/administration/access?section=staff&staff=${encodeURIComponent(user.id)}#staff-role-assignment`}
                  >
                    <Pencil data-icon="inline-start" />
                    Edit Roles
                    <span className="sr-only"> for {user.name}</span>
                  </Link>
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </OperationalTable>
  )
}
