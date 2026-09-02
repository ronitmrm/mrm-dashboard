import Link from "next/link"

import { UserRoundPlus, UsersRound } from "lucide-react"

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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
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

import {
  createRoleAction,
  provisionStaffAction,
  setPostRoleAction,
  updateRolePermissionsAction,
} from "./actions"
import { PermissionSelector } from "./permission-selector"
import { AccessWorkspaceTabs } from "./access-workspace-tabs"

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
      administrationTaskCapabilities.createRole,
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
        {activeSection === "staff" && canProvisionStaff ? (
          <SectionCard size="sm">
            <CardHeader className="border-b">
              <CardTitle>Provision Staff Account</CardTitle>
              <CardDescription>
                Create A Sign-In-Ready Better Auth Account. Application Roles
                Are Granted Separately.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={provisionStaffAction}>
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor="staff-employee">Employee</FieldLabel>
                    <NativeSelect
                      className="w-full"
                      id="staff-employee"
                      name="employee"
                      required
                    >
                      <NativeSelectOption value="" disabled>
                        Select an employee
                      </NativeSelectOption>
                      {unlinkedEmployees.map((employee) => (
                        <NativeSelectOption
                          key={`${employee.organizationId}:${employee.employeeCode}`}
                          value={JSON.stringify({
                            employeeCode: employee.employeeCode,
                            organizationId: employee.organizationId,
                          })}
                        >
                          {employee.employeeName} ({employee.employeeCode}) ·{" "}
                          {employee.departments.join(", ")} ·{" "}
                          {employee.postCodes.join(", ")}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldDescription>
                      Name, department, and posts come from Employee Master.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="staff-email">Email Address</FieldLabel>
                    <Input
                      id="staff-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="staff-password">
                      Temporary Password
                    </FieldLabel>
                    <Input
                      id="staff-password"
                      name="password"
                      type="password"
                      minLength={6}
                      autoComplete="new-password"
                      required
                    />
                    <FieldDescription>
                      Use At Least 6 Characters And Share It Outside The
                      Application.
                    </FieldDescription>
                  </Field>
                  <Button type="submit" disabled={!unlinkedEmployees.length}>
                    <UserRoundPlus />
                    Provision Staff
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </SectionCard>
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
                      <FieldDescription>
                        Spaces And Symbols Are Converted To Hyphens
                        Automatically.
                      </FieldDescription>
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
            <CardContent className="grid gap-5">
              <form action={setPostRoleAction}>
                <FieldGroup className="gap-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
                  <Field>
                    <FieldLabel htmlFor="profile-post">
                      Approved Post
                    </FieldLabel>
                    <NativeSelect
                      className="w-full"
                      id="profile-post"
                      name="postId"
                      required
                    >
                      {snapshot.postAccessProfiles.map((post) => (
                        <NativeSelectOption key={post.id} value={post.id}>
                          {post.postCode} · {post.department} ·{" "}
                          {post.designation}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="profile-role">
                      Application Role
                    </FieldLabel>
                    <NativeSelect
                      className="w-full"
                      id="profile-role"
                      name="roleKey"
                      required
                    >
                      {snapshot.roles
                        .filter((role) => !role.isSystem)
                        .map((role) => (
                          <NativeSelectOption key={role.id} value={role.key}>
                            {role.name}
                          </NativeSelectOption>
                        ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="profile-effect">Change</FieldLabel>
                    <NativeSelect
                      className="w-full"
                      id="profile-effect"
                      name="effect"
                      required
                    >
                      <NativeSelectOption value="assign">
                        Assign Role
                      </NativeSelectOption>
                      <NativeSelectOption value="remove">
                        Remove Role
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <Button type="submit">Save Post Access</Button>
                </FieldGroup>
              </form>
              <details className="rounded-xl border">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                  Review Current Post Profiles (
                  {snapshot.postAccessProfiles.length})
                </summary>
                <div className="flex max-h-64 flex-col gap-2 overflow-y-auto border-t p-3">
                  {snapshot.postAccessProfiles.map((post) => (
                    <div
                      className="flex items-start justify-between gap-3 text-sm"
                      key={post.id}
                    >
                      <span>
                        {post.postCode} · {post.department} · {post.designation}
                      </span>
                      <span className="text-right text-muted-foreground">
                        {post.roleKeys.join(", ") || "No role"}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            </CardContent>
          </SectionCard>
        ) : null}

        {activeSection === "staff" ? (
          <SectionCard size="sm">
            <CardHeader className="border-b">
              <CardTitle>Staff Access</CardTitle>
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
                <OperationalTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Employee / Post</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Overrides</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot.users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="max-w-64 whitespace-normal">
                          <div className="grid min-w-0 grid-cols-1 gap-0.5 break-words">
                            <span className="font-medium">{user.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="w-80 max-w-80 whitespace-normal">
                          {user.employee ? (
                            <div className="grid min-w-0 grid-cols-1 gap-0.5 break-words">
                              <span>{user.employee.employeeCode}</span>
                              <span className="text-xs text-muted-foreground">
                                {user.employee.departments.join(", ")} ·{" "}
                                {user.employee.postCodes.join(", ")}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Not linked
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
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
                                <Badge
                                  key={`${role.source}:${role.key}`}
                                  variant="secondary"
                                >
                                  {role.key} · {role.source}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                No Application Roles
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5">
                            {user.overrides.length ? (
                              user.overrides.map((override) => (
                                <Badge
                                  key={override.permissionKey}
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
                  <Link href="/administration/access?section=roles">
                    Back to Application Roles
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {selectedRole.isSystem ? (
                <p className="text-sm text-muted-foreground">
                  System Administrator access is managed by the software.
                </p>
              ) : canUpdateRolePermissions ? (
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
                    You can review this role but cannot change its capabilities.
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
