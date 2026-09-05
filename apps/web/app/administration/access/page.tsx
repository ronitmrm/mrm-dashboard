import Link from "next/link"

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
import { StaffAccessRegister } from "./staff-access-register"
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
      administrationTaskCapabilities.assignStaffRole,
      administrationTaskCapabilities.createRole,
      administrationTaskCapabilities.deleteRole,
      administrationTaskCapabilities.provisionStaff,
      administrationTaskCapabilities.updateRolePermissions,
    ])
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
              departments: user.employee?.departments ?? [],
              designations: user.employee?.designations ?? [],
              employeeCode: user.employee?.employeeCode ?? null,
              id: user.id,
              name: snapshot.employees.find((employee) => employee.linkedUserId === user.id)
                ?.employeeName ?? user.name,
              email: user.email,
              roleKeys: user.roleKeys,
              inheritedRoleKeys: user.employee?.inheritedRoleKeys ?? [],
            }))}
            roles={snapshot.roles
              .filter((role) => !role.isSystem)
              .map(({ key, name }) => ({ key, name }))}
            employees={unlinkedEmployees.map(
              ({
                departments,
                designations,
                employeeCode,
                employeeName,
                organizationId,
                organizationName,
              }) => ({
                departments,
                designations,
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
        {activeSection === "staff" ? (
          <SectionCard
            size="sm"
            id="staff-access-register"
            className="scroll-mt-20"
          >
            <CardHeader className="border-b">
              <CardTitle>Staff Access</CardTitle>
              <CardDescription>
                Select a role to view its rights. Use Assign or Edit Roles above
                to manage direct roles for an employee.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StaffAccessRegister
                canAssignRoles={grantedTasks.has(
                  administrationTaskCapabilities.assignStaffRole
                )}
                users={snapshot.users.map((user) => ({
                  departments: user.employee?.departments ?? [],
                  designations: user.employee?.designations ?? [],
                  email: user.email,
                  employeeCode: user.employee?.employeeCode ?? null,
                  id: user.id,
                  inheritedRoleKeys: user.employee?.inheritedRoleKeys ?? [],
                  name: user.name,
                  overrides: user.overrides,
                  roleKeys: user.roleKeys,
                }))}
              />
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
