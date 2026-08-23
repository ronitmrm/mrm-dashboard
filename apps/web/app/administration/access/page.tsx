import Link from "next/link"

import {
  BriefcaseBusiness,
  ShieldCheck,
  UserRoundPlus,
  UsersRound,
} from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
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
  Table,
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

export const dynamic = "force-dynamic"

const accessSections = [
  {
    description: "Create roles and review permission capabilities.",
    icon: BriefcaseBusiness,
    id: "roles",
    label: "Roles",
  },
  {
    description: "Create staff accounts and assign post access profiles.",
    icon: UsersRound,
    id: "staff",
    label: "Staff Accounts",
  },
] as const

type AccessSection = (typeof accessSections)[number]["id"]

function selectedAccessSection(value: string | string[] | undefined) {
  const section = Array.isArray(value) ? value[0] : value
  return accessSections.some(({ id }) => id === section)
    ? (section as AccessSection)
    : "roles"
}

export default async function AccessAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>
}) {
  const activeSection = selectedAccessSection((await searchParams).section)
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

  return (
    <>
      <section className="grid gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">
            Access Administration
          </h2>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Provision Fresh Better Auth Identities And Grant Application Access
          Through Postgresql Roles And Explicit User Overrides.
        </p>
      </section>

      <Alert>
        <ShieldCheck />
        <AlertTitle>Fresh Identity Boundary</AlertTitle>
        <AlertDescription>
          Legacy Convex And Sqlite Users Are Intentionally Excluded. Every
          Account Shown Here Was Created In The Unified Application.
        </AlertDescription>
      </Alert>

      <nav
        aria-label="Access administration sections"
        className="grid gap-2 rounded-xl border bg-muted/20 p-2 lg:grid-cols-2"
      >
        {accessSections.map((section) => {
          const Icon = section.icon
          const selected = activeSection === section.id
          return (
            <Button
              asChild
              className="h-auto justify-start px-4 py-3 text-left"
              key={section.id}
              variant={selected ? "default" : "ghost"}
            >
              <Link
                aria-current={selected ? "page" : undefined}
                href={`/administration/access?section=${section.id}`}
              >
                <Icon className="size-5 shrink-0" />
                <span className="grid gap-0.5">
                  <span>{section.label}</span>
                  <span
                    className={
                      selected
                        ? "text-xs font-normal text-primary-foreground/80"
                        : "text-xs font-normal text-muted-foreground"
                    }
                  >
                    {section.description}
                  </span>
                </span>
              </Link>
            </Button>
          )
        })}
      </nav>

      <section className="grid gap-6 xl:grid-cols-2">
        {activeSection === "staff" && canProvisionStaff ? (
          <Card>
            <CardHeader>
              <CardTitle>Provision Staff Account</CardTitle>
              <CardDescription>
                Create A Sign-In-Ready Better Auth Account. Application Roles
                Are Granted Separately.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={provisionStaffAction}>
                <FieldGroup>
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
          </Card>
        ) : null}

        {activeSection === "roles" && canCreateRole ? (
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Create Application Role</CardTitle>
              <CardDescription>
                Bundle Granular Capabilities Without Changing Better Auth&apos;s
                Internal Admin And User Roles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createRoleAction}>
                <FieldGroup>
                  <div className="grid gap-4 md:grid-cols-2">
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
                        Spaces And Symbols Are Converted To Hyphens Automatically.
                      </FieldDescription>
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="role-description">
                      Description
                    </FieldLabel>
                    <Input id="role-description" name="description" />
                  </Field>
                  <PermissionSelector permissions={snapshot.permissions} />
                  <Button type="submit">Create Role</Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {activeSection === "staff" && canAssignPostAccess ? (
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Post Access Profile</CardTitle>
              <CardDescription>
                Roles Assigned Here Apply Automatically To The Employee
                Occupying The Post.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <form action={setPostRoleAction}>
                <FieldGroup>
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
                <div className="max-h-64 space-y-2 overflow-y-auto border-t p-3">
                  {snapshot.postAccessProfiles.map((post) => (
                    <div
                      className="flex items-start justify-between gap-3 text-sm"
                      key={post.id}
                    >
                      <span>
                        {post.postCode} · {post.department}
                      </span>
                      <span className="text-right text-muted-foreground">
                        {post.roleKeys.join(", ") || "No role"}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            </CardContent>
          </Card>
        ) : null}
      </section>

      {activeSection === "staff" ? (
        <Card>
          <CardHeader>
            <CardTitle>Staff Access</CardTitle>
            <CardDescription>
              Effective Access Is Evaluated On Every Protected Server Request.
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
              <Table>
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
                      <TableCell>
                        <div className="grid gap-0.5">
                          <span className="font-medium">{user.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {user.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.employee ? (
                          <div className="grid gap-0.5">
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
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeSection === "roles" ? (
        <Card>
          <CardHeader>
            <CardTitle>Application Roles</CardTitle>
            <CardDescription>
              The System Administrator Role Is Seeded And Immutable By
              Convention. Custom Roles Use Only The Selected Capabilities.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {snapshot.roles.map((role) => (
              <details className="rounded-2xl border" key={role.id}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                  <span>
                    <span className="block font-medium">{role.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {role.description ?? role.key} ·{" "}
                      {role.permissionKeys.length} capabilities
                    </span>
                  </span>
                  {role.isSystem ? (
                    <Badge>System</Badge>
                  ) : (
                    <Badge variant="outline">
                      {canUpdateRolePermissions ? "Edit Access" : "View Only"}
                    </Badge>
                  )}
                </summary>
                {role.isSystem || !canUpdateRolePermissions ? (
                  <p className="border-t p-4 text-sm text-muted-foreground">
                    {role.isSystem
                      ? "System Administrator access is managed by the software."
                      : "You can review this role but cannot change its capabilities."}
                  </p>
                ) : (
                  <form
                    action={updateRolePermissionsAction}
                    className="grid gap-4 border-t p-4"
                  >
                    <input name="roleKey" type="hidden" value={role.key} />
                    <PermissionSelector
                      initialPermissionKeys={role.permissionKeys}
                      permissions={snapshot.permissions}
                    />
                    <Button className="w-fit" type="submit">
                      Save {role.name} Access
                    </Button>
                  </form>
                )}
              </details>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}
