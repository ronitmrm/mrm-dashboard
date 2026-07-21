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
  provisionStaffAction,
  setPermissionOverrideAction,
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
            Access administration
          </h2>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Provision fresh Better Auth identities and grant application access
          through PostgreSQL roles and explicit user overrides.
        </p>
      </section>

      <Alert>
        <ShieldCheck />
        <AlertTitle>Fresh identity boundary</AlertTitle>
        <AlertDescription>
          Legacy Convex and SQLite users are intentionally excluded. Every
          account shown here was created in the unified application.
        </AlertDescription>
      </Alert>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Provision staff account</CardTitle>
            <CardDescription>
              Create a sign-in-ready Better Auth account. Application roles are
              granted separately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={provisionStaffAction}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="staff-name">Full name</FieldLabel>
                  <Input
                    id="staff-name"
                    name="name"
                    autoComplete="name"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="staff-email">Email address</FieldLabel>
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
                    Temporary password
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
                    Use at least 12 characters and share it outside the
                    application.
                  </FieldDescription>
                </Field>
                <Button type="submit">
                  <UserRoundPlus />
                  Provision staff
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create application role</CardTitle>
            <CardDescription>
              Bundle granular capabilities without changing Better Auth&apos;s
              internal admin and user roles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createRoleAction}>
              <FieldGroup>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="role-name">Role name</FieldLabel>
                    <Input id="role-name" name="name" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="role-key">Role key</FieldLabel>
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
                <Button type="submit">Create role</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assign role</CardTitle>
            <CardDescription>
              Role grants are additive and immediately affect server-side
              capability checks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={assignRoleAction}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="assignment-user">
                    Staff member
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
                    Application role
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
                <Button type="submit">Assign role</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Set user override</CardTitle>
            <CardDescription>
              A deny override wins over every role grant. An allow override
              grants one capability directly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={setPermissionOverrideAction}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="override-user">Staff member</FieldLabel>
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
                <Button type="submit">Save override</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Staff access</CardTitle>
          <CardDescription>
            Effective access is evaluated on every protected server request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {snapshot.users.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersRound />
                </EmptyMedia>
                <EmptyTitle>No staff accounts</EmptyTitle>
                <EmptyDescription>
                  Provision the first administrator with the explicit CLI
                  command, then create staff accounts here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff member</TableHead>
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
                      <div className="flex flex-wrap gap-1.5">
                        {user.roleKeys.length ? (
                          user.roleKeys.map((roleKey) => (
                            <Badge key={roleKey} variant="secondary">
                              {roleKey}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            No application roles
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
                            No overrides
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
          <CardTitle>Application roles</CardTitle>
          <CardDescription>
            The system administrator role is seeded and immutable by convention.
            Custom roles use only the selected capabilities.
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
                {role.permissionKeys.length} capabilities
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}
