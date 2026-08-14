import { ShieldCheck, UserRoundPlus, UsersRound } from "lucide-react"

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
import { Checkbox } from "@workspace/ui/components/checkbox"
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
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOptGroup,
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
import { requireCapability } from "@/lib/auth/require-capability"

import {
  assignRoleAction,
  createRoleAction,
  linkEmployeeAction,
  provisionStaffAction,
  setPermissionOverrideAction,
  setPostRoleAction,
} from "./actions"

export const dynamic = "force-dynamic"

export default async function AccessAdministrationPage() {
  const session = await requireCapability(
    "administration.roles.manage",
    "/administration/access"
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
  const unlinkedUsers = snapshot.users.filter(
    (user) => !user.employee && user.betterAuthRole !== "admin"
  )
  const permissionsByModule = new Map<
    string,
    (typeof snapshot.permissions)[number][]
  >()
  for (const permission of snapshot.permissions) {
    const modulePermissions = permissionsByModule.get(permission.module) ?? []
    modulePermissions.push(permission)
    permissionsByModule.set(permission.module, modulePermissions)
  }

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

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Provision Staff Account</CardTitle>
            <CardDescription>
              Create A Sign-In-Ready Better Auth Account. Application Roles Are
              Granted Separately.
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
                    minLength={12}
                    autoComplete="new-password"
                    required
                  />
                  <FieldDescription>
                    Use At Least 12 Characters And Share It Outside The
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

        <Card>
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
                      pattern="[a-z][a-z0-9-]*"
                      placeholder="production-planner"
                      required
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="role-description">
                    Description
                  </FieldLabel>
                  <Input id="role-description" name="description" />
                </Field>
                <FieldSet className="max-h-80 overflow-y-auto rounded-2xl border p-4">
                  <FieldLegend>Capabilities</FieldLegend>
                  {[...permissionsByModule.entries()].map(
                    ([module, permissions]) => (
                      <FieldGroup key={module} className="gap-3">
                        <FieldLegend
                          className="text-muted-foreground capitalize"
                          variant="label"
                        >
                          {module}
                        </FieldLegend>
                        {permissions.map((permission) => {
                          const id = `role-permission-${permission.key}`
                          return (
                            <Field
                              key={permission.key}
                              orientation="horizontal"
                            >
                              <Checkbox
                                id={id}
                                name="permissionKeys"
                                value={permission.key}
                              />
                              <FieldLabel htmlFor={id}>
                                {permission.name}
                              </FieldLabel>
                            </Field>
                          )
                        })}
                      </FieldGroup>
                    )
                  )}
                </FieldSet>
                <Button type="submit">Create Role</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Link Existing Account</CardTitle>
            <CardDescription>
              Connect An Existing Better Auth User To One Employee Master
              Record.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={linkEmployeeAction}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="link-user">Login Account</FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="link-user"
                    name="userId"
                    required
                  >
                    <NativeSelectOption value="" disabled>
                      Select an account
                    </NativeSelectOption>
                    {unlinkedUsers.map((user) => (
                      <NativeSelectOption key={user.id} value={user.id}>
                        {user.name} · {user.email}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="link-employee">Employee</FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="link-employee"
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
                        {employee.postCodes.join(", ")}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Button
                  type="submit"
                  disabled={!unlinkedUsers.length || !unlinkedEmployees.length}
                >
                  Link Account
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Post Access Profile</CardTitle>
            <CardDescription>
              Roles Assigned Here Apply Automatically To The Employee Occupying
              The Post.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <form action={setPostRoleAction}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="profile-post">Approved Post</FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="profile-post"
                    name="postId"
                    required
                  >
                    {snapshot.postAccessProfiles.map((post) => (
                      <NativeSelectOption key={post.id} value={post.id}>
                        {post.postCode} · {post.department} · {post.designation}
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
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border p-3">
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
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assign Direct Role</CardTitle>
            <CardDescription>
              Exceptional Access Only. Normal Access Comes From The Employee's
              Approved Post Profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={assignRoleAction}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="assignment-user">
                    Staff Member
                  </FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="assignment-user"
                    name="userId"
                    required
                  >
                    {snapshot.users.map((user) => (
                      <NativeSelectOption key={user.id} value={user.id}>
                        {user.name} — {user.email}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="assignment-role">
                    Application Role
                  </FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="assignment-role"
                    name="roleKey"
                    required
                  >
                    {snapshot.roles.map((role) => (
                      <NativeSelectOption key={role.id} value={role.key}>
                        {role.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Button type="submit">Assign Direct Role</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Set User Override</CardTitle>
            <CardDescription>
              A Deny Override Wins Over Every Role Grant. An Allow Override
              Grants One Capability Directly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={setPermissionOverrideAction}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="override-user">Staff Member</FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="override-user"
                    name="userId"
                    required
                  >
                    {snapshot.users.map((user) => (
                      <NativeSelectOption key={user.id} value={user.id}>
                        {user.name} — {user.email}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="override-capability">
                    Capability
                  </FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="override-capability"
                    name="permissionKey"
                    required
                  >
                    {[...permissionsByModule.entries()].map(
                      ([module, permissions]) => (
                        <NativeSelectOptGroup key={module} label={module}>
                          {permissions.map((permission) => (
                            <NativeSelectOption
                              key={permission.key}
                              value={permission.key}
                            >
                              {permission.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelectOptGroup>
                      )
                    )}
                  </NativeSelect>
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="override-effect">Effect</FieldLabel>
                    <NativeSelect
                      className="w-full"
                      id="override-effect"
                      name="effect"
                      required
                    >
                      <NativeSelectOption value="deny">Deny</NativeSelectOption>
                      <NativeSelectOption value="allow">
                        Allow
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="override-reason">Reason</FieldLabel>
                    <Input id="override-reason" name="reason" />
                  </Field>
                </div>
                <Button type="submit">Save Override</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </section>

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

      <Card>
        <CardHeader>
          <CardTitle>Application Roles</CardTitle>
          <CardDescription>
            The System Administrator Role Is Seeded And Immutable By Convention.
            Custom Roles Use Only The Selected Capabilities.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {snapshot.roles.map((role) => (
            <div className="grid gap-2 rounded-2xl border p-4" key={role.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{role.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {role.description ?? role.key}
                  </p>
                </div>
                {role.isSystem ? <Badge>System</Badge> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {role.permissionKeys.length} Capabilities
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}
