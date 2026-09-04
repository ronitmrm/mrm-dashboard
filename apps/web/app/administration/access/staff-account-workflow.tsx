"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { UserRoundPlus } from "lucide-react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import {
  assignStaffRolesAction,
  provisionStaffAction,
  type StaffActionState,
} from "./actions"

type StaffAccount = {
  departments: string[]
  designations: string[]
  id: string
  employeeCode: string | null
  name: string
  email: string
  roleKeys: string[]
  inheritedRoleKeys: string[]
}

type StaffWorkflowProps = {
  canProvision: boolean
  canAssignRoles: boolean
  created: boolean
  selectedUserId?: string
  users: StaffAccount[]
  roles: { key: string; name: string }[]
  employees: {
    departments: string[]
    designations: string[]
    employeeCode: string
    employeeName: string
    organizationId: string
    organizationName: string
  }[]
}

function StaffFeedback({ state }: { state: StaffActionState }) {
  if (!state.error && !state.success) return null
  return (
    <Alert
      variant={state.error ? "destructive" : "default"}
      role={state.error ? "alert" : "status"}
    >
      <AlertDescription>{state.error ?? state.success}</AlertDescription>
    </Alert>
  )
}

function CreateStaffAccountForm({
  employees,
}: {
  employees: StaffWorkflowProps["employees"]
}) {
  const [state, action, pending] = useActionState(provisionStaffAction, {})
  const unavailable = !employees.length
  return (
    <SectionCard size="sm">
      <CardHeader className="border-b">
        <CardTitle>1. Select Employee &amp; Create Account</CardTitle>
        <CardDescription>
          Credentials can only be created for an active Employee Master record.
          The account is linked automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action}>
          <FieldGroup className="gap-4">
            <FieldGroup className="grid gap-4 md:grid-cols-3">
              <Field
                className="relative min-w-0"
                data-disabled={pending || unavailable}
              >
                <FieldLabel htmlFor="staff-employee">Employee</FieldLabel>
                <NativeSelect
                  aria-label="Employee"
                  className="w-full"
                  id="staff-employee"
                  name="employee"
                  defaultValue=""
                  required
                  disabled={pending || unavailable}
                  searchPlaceholder="Search ID, name, designation or department..."
                >
                  <NativeSelectOption value="">
                    Select an employee
                  </NativeSelectOption>
                  {employees.map((employee) => (
                    <NativeSelectOption
                      key={`${employee.organizationId}:${employee.employeeCode}`}
                      value={JSON.stringify({
                        employeeCode: employee.employeeCode,
                        organizationId: employee.organizationId,
                      })}
                    >
                      {employee.employeeName} · #{employee.employeeCode} ·{" "}
                      {employee.organizationName} ·{" "}
                      {employee.designations.join(", ")} ·{" "}
                      {employee.departments.join(", ")}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldDescription>
                  {employees.length
                    ? "Search by employee ID, name, designation or department. Only active employees without a login are available."
                    : "No eligible employees without a login. Add the employee to Employee Master first."}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-email">Email / Login ID</FieldLabel>
                <Input
                  id="staff-email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  required
                  disabled={pending || unavailable}
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
                  disabled={pending || unavailable}
                />
                <FieldDescription>
                  At least 6 characters. Share securely with the staff member.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <StaffFeedback state={state} />
            <Button
              className="w-fit"
              type="submit"
              disabled={pending || unavailable}
            >
              <UserRoundPlus data-icon="inline-start" />
              {pending ? "Creating account…" : "Create Account & Continue"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </SectionCard>
  )
}

function StaffRoleForm({
  user,
  roles,
}: {
  user: StaffAccount
  roles: StaffWorkflowProps["roles"]
}) {
  const [state, action, pending] = useActionState(assignStaffRolesAction, {})
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={user.id} />
      <FieldGroup className="gap-4">
        <FieldSet className="min-w-0" disabled={pending}>
          <FieldLegend variant="label">Application Roles</FieldLegend>
          <FieldDescription>
            Select the complete set of direct roles. Changes apply only to this
            staff account; post-inherited roles stay unchanged.
          </FieldDescription>
          <FieldGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {roles.map((role) => {
              const assigned = user.roleKeys.includes(role.key)
              return (
                <Field
                  key={`${role.key}:${assigned}`}
                  orientation="horizontal"
                  data-disabled={pending}
                >
                  <Checkbox
                    id={`staff-role-${role.key}`}
                    name="roleKeys"
                    value={role.key}
                    defaultChecked={assigned}
                    disabled={pending}
                  />
                  <FieldLabel
                    className="min-w-0 flex-wrap"
                    htmlFor={`staff-role-${role.key}`}
                  >
                    {role.name}
                  </FieldLabel>
                </Field>
              )
            })}
          </FieldGroup>
          {!roles.length ? (
            <FieldDescription>
              No application roles yet. Create a role in the Create Role tab
              first.
            </FieldDescription>
          ) : null}
        </FieldSet>
        {user.inheritedRoleKeys.length ? (
          <FieldDescription>
            Inherited from current post (not editable here):{" "}
            {user.inheritedRoleKeys.join(", ")}.
          </FieldDescription>
        ) : null}
        <StaffFeedback state={state} />
        <Button
          className="w-fit"
          type="submit"
          disabled={pending || !roles.length}
        >
          {pending ? "Saving…" : "Save Direct Roles"}
        </Button>
      </FieldGroup>
    </form>
  )
}

export function StaffAccountWorkflow(props: StaffWorkflowProps) {
  const [userId, setUserId] = useState(props.selectedUserId ?? "")
  const user = props.users.find((user) => user.id === userId)
  return (
    <>
      {props.canProvision ? (
        <CreateStaffAccountForm employees={props.employees} />
      ) : null}
      {props.canAssignRoles ? (
        <SectionCard
          size="sm"
          id="staff-role-assignment"
          className="scroll-mt-20"
        >
          <CardHeader className="border-b">
            <CardTitle>2. Assign or Edit Roles</CardTitle>
            <CardDescription>
              Choose the newly created or an existing staff account, then add
              the roles required for that employee.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {props.created && userId === props.selectedUserId ? (
              <StaffFeedback
                state={{
                  success:
                    "Account created and linked. Choose its direct roles below.",
                }}
              />
            ) : null}
            <Field className="relative min-w-0">
              <FieldLabel htmlFor="staff-account">Staff Account</FieldLabel>
              <NativeSelect
                aria-label="Staff Account"
                className="w-full"
                id="staff-account"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                searchPlaceholder="Search ID, name, designation or department..."
              >
                <NativeSelectOption value="">
                  Select a staff account
                </NativeSelectOption>
                {props.users.map((user) => (
                  <NativeSelectOption key={user.id} value={user.id}>
                    {user.employeeCode ? `#${user.employeeCode} · ` : ""}
                    {user.name} · {user.designations.join(", ") || "—"} ·{" "}
                    {user.departments.join(", ") || "—"} · {user.email}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                Search by employee ID, name, designation or department.
              </FieldDescription>
            </Field>
            {user && props.canAssignRoles ? (
              <StaffRoleForm key={user.id} user={user} roles={props.roles} />
            ) : null}
            {!props.canAssignRoles ? (
              <FieldDescription>
                Your account does not have Assign Staff Role access.
              </FieldDescription>
            ) : null}
            {user ? (
              <Button variant="link" className="w-fit p-0" asChild>
                <Link href="#staff-access-register">
                  View assigned roles and rights
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </SectionCard>
      ) : null}
    </>
  )
}
