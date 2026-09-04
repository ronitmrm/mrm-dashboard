import Link from "next/link"

import { ArrowUpRight, UsersRound } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  MetricCard,
  SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { createAccessAdministrationService } from "@/lib/auth/access-administration"
import { getAuth, readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import { administrationTaskCapabilities } from "@/lib/auth/task-capabilities"

import { createRoleAction, updateRolePermissionsAction } from "./actions"
import { PermissionSelector } from "./permission-selector"
import { AccessWorkspaceTabs } from "./access-workspace-tabs"
import { RoleDeleteControl } from "./role-delete-control"
import { PostAccessProfileForm } from "./post-access-profile-form"
import { StaffAccountWorkflow } from "./staff-account-workflow"

export const dynamic = "force-dynamic"

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function AccessAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{
    section?: string | string[]
    role?: string | string[]
    from?: string | string[]
    staff?: string | string[]
    created?: string | string[]
  }>
}) {
  const query = await searchParams
  const session = await requireCapability(
    "administration.access.read",
    "/administration/access"
  )
  const grantedTasks = new Set(
    await listGrantedCapabilities(session.user.id, [
      administrationTaskCapabilities.assignPostAccess,
      administrationTaskCapabilities.assignStaffRole,
      administrationTaskCapabilities.createRole,
      administrationTaskCapabilities.deleteRole,
      administrationTaskCapabilities.provisionStaff,
      administrationTaskCapabilities.updateRolePermissions,
    ])
  )
  const canAssignPostAccess = grantedTasks.has(
    administrationTaskCapabilities.assignPostAccess
  )
  const canCreateRole = grantedTasks.has(
    administrationTaskCapabilities.createRole
  )
  const canDeleteRole = grantedTasks.has(
    administrationTaskCapabilities.deleteRole
  )
  const requestedSection = firstQueryValue(query.section)
  const activeSection =
    requestedSection === "staff" || requestedSection === "roles"
      ? requestedSection
      : canCreateRole
        ? "create"
        : "roles"
  const canProvisionStaff = grantedTasks.has(
    administrationTaskCapabilities.provisionStaff
  )
  const canUpdateRolePermissions = grantedTasks.has(
    administrationTaskCapabilities.updateRolePermissions
  )
  const environment = readAuthEnvironment()
  const access = createAccessAdministrationService({
    auth: getAuth(),
    connectionString: environment.connectionString,
  })
  const snapshot = await access
    .getSnapshot({ actorUserId: session.user.id })
    .finally(() => access.close())
  const unlinkedEmployees = snapshot.employees.filter(
    (employee) => !employee.linkedUserId
  )
  const selectedRole = snapshot.roles.find(
    (role) => role.key === firstQueryValue(query.role)
  )
  const returnToStaff = firstQueryValue(query.from) === "staff"

  return (
    <>
      <section
        aria-label="Access summary"
        className="grid min-w-0 grid-cols-3 gap-3"
      >
        <MetricCard
          className="p-3"
          label="Staff Accounts"
          description="Provisioned users"
          value={snapshot.users.length}
          tone="information"
        />
        <MetricCard
          className="p-3"
          label="Application Roles"
          description="Configured roles"
          value={snapshot.roles.length}
          tone="brand"
        />
        <MetricCard
          className="p-3"
          label="Without Login"
          description="Unlinked employees"
          value={unlinkedEmployees.length}
          tone={unlinkedEmployees.length ? "warning" : "neutral"}
        />
      </section>

      <AccessWorkspaceTabs
        activeSection={activeSection}
        canCreateRole={canCreateRole}
      >
        {activeSection === "staff" ? (
          <StaffAccountWorkflow
            key={firstQueryValue(query.staff) ?? "staff-workflow"}
            canProvision={canProvisionStaff}
            canAssignRoles={grantedTasks.has(
              administrationTaskCapabilities.assignStaffRole
            )}
            created={firstQueryValue(query.created) === "1"}
            selectedUserId={firstQueryValue(query.staff)}
            users={snapshot.users.map((user) => ({
              id: user.id,
              name: user.name,
              email: user.email,
              roleKeys: user.roleKeys,
              inheritedRoleKeys: user.employee?.inheritedRoleKeys ?? [],
            }))}
            roles={snapshot.roles
              .filter((role) => !role.isSystem)
              .map(({ key, name }) => ({ key, name }))}
            employees={unlinkedEmployees.map(
              ({
                employeeCode,
                employeeName,
                organizationId,
                organizationName,
              }) => ({
                employeeCode,
                employeeName,
                organizationId,
                organizationName,
              })
            )}
          />
        ) : null}

        {activeSection === "create" && canCreateRole ? (
          <SectionCard size="sm">
            <CardHeader className="border-b">
              <CardTitle>Create Application Role</CardTitle>
              <CardDescription>
                Name the role and select its pages and tasks. Saved roles appear
                in Application Roles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createRoleAction}>
                <FieldGroup className="gap-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="role-name">Role Name</FieldLabel>
                      <Input id="role-name" name="name" required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="role-key">Role Key</FieldLabel>
                      <Input
                        id="role-key"
                        name="key"
                        placeholder="production-planner"
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="role-description">
                        Description
                      </FieldLabel>
                      <Input id="role-description" name="description" />
                    </Field>
                  </div>
                  <PermissionSelector permissions={snapshot.permissions} />
                  <Button className="w-fit" type="submit">
                    Create Role
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </SectionCard>
        ) : null}
        {activeSection === "staff" && canAssignPostAccess ? (
          <SectionCard size="sm">
            <CardHeader className="border-b">
              <CardTitle>Post Access Profile</CardTitle>
              <CardDescription>
                Roles Assigned Here Apply Automatically To The Employee
                Occupying The Post.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PostAccessProfileForm
                posts={snapshot.postAccessProfiles}
                roles={snapshot.roles.map(({ id, key, name, isSystem }) => ({
                  id,
                  key,
                  name,
                  isSystem,
                }))}
              />
            </CardContent>
          </SectionCard>
        ) : null}

        {activeSection === "staff" ? (
          <SectionCard
            size="sm"
            id="staff-access-register"
            className="scroll-mt-20"
          >
            <CardHeader className="border-b">
              <CardTitle>Staff Access</CardTitle>
              <CardDescription>
                Select a role to view its rights. Manage occupied posts in Post
                Access Profile above.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {snapshot.users.length === 0 ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <UsersRound />
                    </EmptyMedia>
                    <EmptyTitle>No Staff Accounts</EmptyTitle>
                    <EmptyDescription>
                      Provision The First Administrator With The Explicit Cli
                      Command, Then Create Staff Accounts Here.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <OperationalTable
                  className="min-w-[40rem] table-fixed"
                  filterStorageKey="access-administration-staff"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[36%]">Staff Member</TableHead>
                      <TableHead className="w-[40%]">Roles</TableHead>
                      <TableHead className="w-[24%]">Overrides</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot.users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="align-top whitespace-normal">
                          <div className="grid min-w-0 grid-cols-1 gap-0.5 wrap-anywhere">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="font-medium">{user.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {user.employee
                                  ? `Employee #${user.employee.employeeCode}`
                                  : "Not linked"}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="align-top whitespace-normal">
                          <div className="flex flex-wrap gap-1.5">
                            {user.roleKeys.length ||
                            user.employee?.inheritedRoleKeys.length ? (
                              [
                                ...user.roleKeys.map((roleKey) => ({
                                  key: roleKey,
                                  source: "direct",
                                })),
                                ...(user.employee?.inheritedRoleKeys ?? []).map(
                                  (roleKey) => ({
                                    key: roleKey,
                                    source: "post",
                                  })
                                ),
                              ].map((role) => (
                                <div
                                  key={`${role.source}:${role.key}`}
                                  className="flex max-w-full items-center gap-1"
                                >
                                  <Badge
                                    asChild
                                    variant="secondary"
                                    className="h-auto min-h-7 min-w-0 shrink text-left whitespace-normal"
                                  >
                                    <Link
                                      href={{
                                        pathname: "/administration/access",
                                        query: {
                                          section: "roles",
                                          role: role.key,
                                          from: "staff",
                                        },
                                      }}
                                      aria-label={`View ${role.key} rights (${role.source})`}
                                    >
                                      <span className="wrap-anywhere">
                                        {role.key} · {role.source}
                                      </span>
                                      <ArrowUpRight data-icon="inline-end" />
                                    </Link>
                                  </Badge>
                                  {canDeleteRole
                                    ? snapshot.roles
                                        .filter(
                                          (item) =>
                                            item.key === role.key &&
                                            !item.isSystem
                                        )
                                        .map((item) => (
                                          <RoleDeleteControl
                                            key={item.id}
                                            roleId={item.id}
                                            roleKey={item.key}
                                            roleName={item.name}
                                            section="staff"
                                          />
                                        ))
                                    : null}
                                </div>
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
                                  key={override.permissionKey}
                                  className="h-auto max-w-full wrap-anywhere whitespace-normal"
                                  variant={
                                    override.effect === "deny"
                                      ? "destructive"
                                      : "outline"
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
                      </TableRow>
                    ))}
                  </TableBody>
                </OperationalTable>
              )}
            </CardContent>
          </SectionCard>
        ) : null}

        {activeSection === "roles" && !selectedRole ? (
          <SectionCard size="sm">
            <CardHeader className="border-b">
              <CardTitle>Application Roles</CardTitle>
              <CardDescription>
                Open a role to review or edit its responsibilities.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OperationalTable filterStorageKey="access-administration-roles">
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Capabilities</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot.roles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">{role.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {role.description || "—"}
                      </TableCell>
                      <TableCell>{role.permissionKeys.length}</TableCell>
                      <TableCell>
                        <Badge
                          variant={role.isSystem ? "secondary" : "outline"}
                        >
                          {role.isSystem ? "System" : "Custom"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={{
                                pathname: "/administration/access",
                                query: { section: "roles", role: role.key },
                              }}
                            >
                              {role.isSystem || !canUpdateRolePermissions
                                ? "View"
                                : "Edit Access"}
                              <span className="sr-only"> for {role.name}</span>
                            </Link>
                          </Button>
                          {canDeleteRole && !role.isSystem ? (
                            <RoleDeleteControl
                              roleId={role.id}
                              roleKey={role.key}
                              roleName={role.name}
                              section="roles"
                            />
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </OperationalTable>
            </CardContent>
          </SectionCard>
        ) : null}

        {activeSection === "roles" && selectedRole ? (
          <SectionCard size="sm">
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <CardTitle>{selectedRole.name}</CardTitle>
                  <CardDescription>
                    {selectedRole.description || selectedRole.key}
                  </CardDescription>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={
                      returnToStaff
                        ? "/administration/access?section=staff"
                        : "/administration/access?section=roles"
                    }
                  >
                    {returnToStaff
                      ? "Back to Staff Access"
                      : "Back to Application Roles"}
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedRole.isSystem && canUpdateRolePermissions ? (
                <form
                  action={updateRolePermissionsAction}
                  className="grid gap-4"
                >
                  <input
                    name="roleKey"
                    type="hidden"
                    value={selectedRole.key}
                  />
                  <PermissionSelector
                    key={selectedRole.key}
                    initialPermissionKeys={selectedRole.permissionKeys}
                    permissions={snapshot.permissions}
                  />
                  <Button className="w-fit" type="submit">
                    Save {selectedRole.name} Access
                  </Button>
                </form>
              ) : (
                <div className="grid gap-3">
                  <p className="text-sm text-muted-foreground">
                    {selectedRole.isSystem
                      ? "System Administrator access is managed by the software. Assigned rights are listed below."
                      : "You can review this role but cannot change its capabilities."}
                  </p>
                  <ul className="grid list-inside list-disc gap-1 text-sm">
                    {snapshot.permissions
                      .filter((permission) =>
                        selectedRole.permissionKeys.includes(permission.key)
                      )
                      .map((permission) => (
                        <li key={permission.key}>{permission.name}</li>
                      ))}
                  </ul>
                  {!selectedRole.permissionKeys.length ? (
                    <p className="text-sm text-muted-foreground">
                      No capabilities assigned.
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </SectionCard>
        ) : null}
      </AccessWorkspaceTabs>
    </>
  )
}
