"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { UserRoundPlus } from "lucide-react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardAction,
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

const searchFields = [
  { key: "employeeCode", label: "Employee ID" },
  { key: "name", label: "Employee Name" },
  { key: "designations", label: "Designation" },
  { key: "departments", label: "Department" },
] as const

type StaffSearch = Record<(typeof searchFields)[number]["key"], string>

const emptySearch: StaffSearch = {
  employeeCode: "",
  name: "",
  designations: "",
  departments: "",
}

function matchesStaffSearch(
  person: {
    employeeCode: string | null
    name: string
    designations: string[]
    departments: string[]
  },
  search: StaffSearch
) {
  return searchFields.every(({ key }) => {
    if (!search[key]) return true
    const value = person[key]
    return Array.isArray(value) ? value.includes(search[key]) : value === search[key]
  })
}

function StaffSearchFields({
  prefix,
  value,
  onChange,
  disabled,
  people,
}: {
  prefix: string
  value: StaffSearch
  onChange: (value: StaffSearch) => void
  disabled?: boolean
  people: Pick<StaffAccount, "employeeCode" | "name" | "designations" | "departments">[]
}) {
  return (
    <FieldGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {searchFields.map(({ key, label }) => {
        // Like Excel, each column's options respect every other active filter.
        const matchingPeople = people.filter((person) =>
          matchesStaffSearch(person, { ...value, [key]: "" })
        )
        const options = [...new Set(matchingPeople.flatMap((person) => {
          const field = person[key]
          return Array.isArray(field) ? field : field ? [field] : []
        }))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
        return (
        <Field key={key}>
          <FieldLabel htmlFor={`${prefix}-${key}`}>{label}</FieldLabel>
          <NativeSelect
            id={`${prefix}-${key}`}
            aria-label={label}
            className="w-full"
            searchPlaceholder={`Search ${label.toLowerCase()}`}
            value={value[key] || (options.length === 1 ? options[0] : "")}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, [key]: event.target.value })}
          >
            <NativeSelectOption value="">All {label.toLowerCase()}</NativeSelectOption>
            {options.map((option) => (
              <NativeSelectOption key={option} value={option}>{option}</NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        )
      })}
    </FieldGroup>
  )
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
  const [search, setSearch] = useState(emptySearch)
  const matchingEmployees = employees.filter((employee) =>
    matchesStaffSearch({ ...employee, name: employee.employeeName }, search)
  )
  const unavailable = !employees.length
  const employee = matchingEmployees.length === 1 ? matchingEmployees[0] : undefined
  return (
    <SectionCard size="sm">
      <CardHeader className="border-b">
        <CardTitle>1. Select Employee &amp; Create Account</CardTitle>
        <CardAction>
          <Button type="button" variant="ghost" disabled={pending || unavailable}
            onClick={() => setSearch(emptySearch)}>
            Clear selection
          </Button>
        </CardAction>
        <CardDescription>
          Select an employee already assigned in Employee Master, including
          appointed employees. The login is linked automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action}>
          <FieldGroup className="gap-4">
            <StaffSearchFields
              prefix="employee-search"
              people={employees.map((employee) => ({ ...employee, name: employee.employeeName }))}
              value={search}
              disabled={pending || unavailable}
              onChange={setSearch}
            />
            <input type="hidden" name="employee" value={employee ? JSON.stringify({
              employeeCode: employee.employeeCode,
              organizationId: employee.organizationId,
            }) : ""} />
            <FieldGroup className="grid gap-4 md:grid-cols-2">
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
              disabled={pending || !employee}
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
  const [search, setSearch] = useState(() => {
    const selected = props.users.find((user) => user.id === props.selectedUserId)
    return selected ? { ...emptySearch, employeeCode: selected.employeeCode ?? "", name: selected.name } : emptySearch
  })
  const matchingUsers = props.users.filter((user) => matchesStaffSearch(user, search))
  const user = matchingUsers.length === 1 ? matchingUsers[0] : undefined
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
            <CardAction>
              <Button type="button" variant="ghost" onClick={() => setSearch(emptySearch)}>
                Clear selection
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            <StaffSearchFields
              prefix="staff-search"
              people={props.users}
              value={search}
              onChange={setSearch}
            />
            {props.created && user?.id === props.selectedUserId ? (
              <StaffFeedback
                state={{
                  success:
                    "Account created and linked. Choose its direct roles below.",
                }}
              />
            ) : null}
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
