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
  linkEmployeeAction,
  provisionStaffAction,
  type StaffActionState,
} from "./actions"

type StaffAccount = {
  id: string
  name: string
  email: string
  roleKeys: string[]
  employeeCode: string | null
  isSystemAdministrator: boolean
}

type StaffWorkflowProps = {
  canProvision: boolean
  canAssignRoles: boolean
  canLinkEmployee: boolean
  created: boolean
  selectedUserId?: string
  users: StaffAccount[]
  roles: { key: string; name: string }[]
  employees: {
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

function CreateStaffAccountForm() {
  const [state, action, pending] = useActionState(provisionStaffAction, {})
  return (
    <SectionCard size="sm">
      <CardHeader className="border-b">
        <CardTitle>1. Create Staff Account</CardTitle>
        <CardDescription>
          Create the login first. Assign roles below; Employee Master linking is
          optional.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action}>
          <FieldGroup className="gap-4">
            <FieldGroup className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="staff-name">Staff Name</FieldLabel>
                <Input
                  id="staff-name"
                  name="name"
                  autoComplete="name"
                  required
                  disabled={pending}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-email">Email / Login ID</FieldLabel>
                <Input
                  id="staff-email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  required
                  disabled={pending}
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
                  disabled={pending}
                />
                <FieldDescription>
                  At least 6 characters. Share securely with the staff member.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <StaffFeedback state={state} />
            <Button className="w-fit" type="submit" disabled={pending}>
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
  const available = roles.some((role) => !user.roleKeys.includes(role.key))
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={user.id} />
      <FieldGroup className="gap-4">
        <FieldSet className="min-w-0" disabled={pending}>
          <FieldLegend variant="label">Application Roles</FieldLegend>
          <FieldDescription>
            Select one or more roles to add. Existing direct and inherited post
            roles are kept.
          </FieldDescription>
          <FieldGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {roles.map((role) => {
              const assigned = user.roleKeys.includes(role.key)
              return (
                <Field
                  key={`${role.key}:${assigned}`}
                  orientation="horizontal"
                  data-disabled={assigned || pending}
                >
                  <Checkbox
                    id={`staff-role-${role.key}`}
                    name="roleKeys"
                    value={role.key}
                    defaultChecked={assigned}
                    disabled={assigned || pending}
                  />
                  <FieldLabel
                    className="min-w-0 flex-wrap"
                    htmlFor={`staff-role-${role.key}`}
                  >
                    {role.name}
                    {assigned ? " · assigned" : ""}
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
        <StaffFeedback state={state} />
        <Button
          className="w-fit"
          type="submit"
          disabled={pending || !available}
        >
          {pending ? "Assigning…" : "Assign Selected Roles"}
        </Button>
      </FieldGroup>
    </form>
  )
}

function EmployeeLinkForm({
  user,
  employees,
}: {
  user: StaffAccount
  employees: StaffWorkflowProps["employees"]
}) {
  const [state, action, pending] = useActionState(linkEmployeeAction, {})
  return (
    <FieldGroup className="gap-4">
      {user.isSystemAdministrator ? (
        <FieldDescription>
          System Administrator stays separate from Employee Master and can
          submit maintenance requests without a link.
        </FieldDescription>
      ) : user.employeeCode ? (
        <FieldDescription>
          Linked to Employee #{user.employeeCode}. Current post roles apply
          alongside direct roles.
        </FieldDescription>
      ) : (
        <form action={action}>
          <input type="hidden" name="userId" value={user.id} />
          <FieldGroup className="gap-4">
            <Field
              className="relative min-w-0"
              data-disabled={pending || !employees.length}
            >
              <FieldLabel htmlFor="staff-link-employee">Employee</FieldLabel>
              <NativeSelect
                aria-label="Employee"
                className="w-full"
                id="staff-link-employee"
                name="employee"
                defaultValue=""
                required
                disabled={pending || !employees.length}
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
                    {employee.organizationName}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                {employees.length
                  ? "Enables department-based workflows and current post role inheritance."
                  : "No unlinked active employees available. The account can still use its assigned roles."}
              </FieldDescription>
            </Field>
            <Button
              className="w-fit"
              variant="outline"
              type="submit"
              disabled={pending || !employees.length}
            >
              {pending ? "Linking…" : "Link Employee"}
            </Button>
          </FieldGroup>
        </form>
      )}
      <StaffFeedback state={state} />
    </FieldGroup>
  )
}

export function StaffAccountWorkflow(props: StaffWorkflowProps) {
  const [userId, setUserId] = useState(props.selectedUserId ?? "")
  const user = props.users.find((user) => user.id === userId)
  return (
    <>
      {props.canProvision ? <CreateStaffAccountForm /> : null}
      {props.canAssignRoles || props.canLinkEmployee ? (
        <SectionCard
          size="sm"
          id="staff-role-assignment"
          className="scroll-mt-20"
        >
          <CardHeader className="border-b">
            <CardTitle>2. Assign Account Roles</CardTitle>
            <CardDescription>
              Choose a newly created or existing login. No employee link is
              needed to assign roles.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {props.created && userId === props.selectedUserId ? (
              <StaffFeedback
                state={{
                  success:
                    "Account created. Choose its application roles below.",
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
              >
                <NativeSelectOption value="">
                  Select a staff account
                </NativeSelectOption>
                {props.users.map((user) => (
                  <NativeSelectOption key={user.id} value={user.id}>
                    {user.name} · {user.email}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
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
      {props.canLinkEmployee ? (
        <SectionCard size="sm">
          <CardHeader className="border-b">
            <CardTitle>3. Link Employee / Posts (Optional)</CardTitle>
            <CardDescription>
              Connect the selected login to Employee Master when employee-based
              access is needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user ? (
              <EmployeeLinkForm
                key={user.id}
                user={user}
                employees={props.employees}
              />
            ) : (
              <FieldDescription>
                Select a staff account above to link an employee.
              </FieldDescription>
            )}
          </CardContent>
        </SectionCard>
      ) : null}
    </>
  )
}
