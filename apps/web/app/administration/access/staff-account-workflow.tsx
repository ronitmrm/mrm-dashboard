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
  setScreenProtectionAction,
  updateStaffLoginIdAction,
  type StaffActionState,
} from "./actions"
import type { PermissionOption } from "./permission-access"
import {
  StaffPermissionOverridesForm,
  type StaffPermissionOverride,
} from "./staff-permission-overrides"

type StaffAccount = {
  departments: string[]
  designations: string[]
  id: string
  employeeCode: string | null
  name: string
  email: string
  roleKeys: string[]
  inheritedRoleKeys: string[]
  overrides: StaffPermissionOverride[]
  screenProtection: ScreenProtectionState
}

export type ScreenProtectionState = {
  blockPrint: boolean
  hideUnfocused: boolean
  watermark: boolean
}

const screenProtectionOptions = [
  {
    description: "Name, employee ID and time across every page, so any capture is traceable.",
    key: "watermark",
    label: "Watermark",
  },
  {
    description: "Covers pages when the window loses focus, e.g. to a snipping tool.",
    key: "hideUnfocused",
    label: "Hide When Unfocused",
  },
  {
    description: "Prints a blank page and clears the Print Screen copy on Windows.",
    key: "blockPrint",
    label: "Block Print & Print Screen",
  },
] as const satisfies readonly { key: keyof ScreenProtectionState; description: string; label: string }[]

type StaffWorkflowProps = {
  /** Every key each role grants, for showing what a person gets from roles. */
  rolePermissionKeys: Record<string, string[]>
  permissions: readonly PermissionOption[]
  canManageOverrides: boolean
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
    <SectionCard width="wide" size="sm">
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

function StaffLoginIdForm({ user }: { user: StaffAccount }) {
  const [state, action, pending] = useActionState(updateStaffLoginIdAction, {})
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={user.id} />
      <FieldGroup className="gap-3 border-b pb-4">
        <Field>
          <FieldLabel htmlFor="staff-login-id">Email / Login ID</FieldLabel>
          <Input
            key={user.email}
            id="staff-login-id"
            name="email"
            type="email"
            autoComplete="off"
            defaultValue={user.email}
            required
            disabled={pending}
          />
          <FieldDescription>
            The password and roles stay the same. The staff member will sign in
            again with the new ID.
          </FieldDescription>
        </Field>
        <StaffFeedback state={state} />
        <Button className="w-fit" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Login ID"}
        </Button>
      </FieldGroup>
    </form>
  )
}

function StaffScreenProtectionForm({ user }: { user: StaffAccount }) {
  const [state, action, pending] = useActionState(setScreenProtectionAction, {})
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={user.id} />
      <FieldGroup className="gap-4">
        <FieldSet className="min-w-0" disabled={pending}>
          <FieldLegend variant="label">Screen Protection</FieldLegend>
          <FieldDescription>
            Checked protections apply to this person on every device and
            override their roles. Phone cameras and OS screenshots cannot be
            fully blocked; the watermark makes them traceable.
          </FieldDescription>
          <FieldGroup className="grid gap-3">
            {screenProtectionOptions.map((option) => (
              <Field
                key={`${option.key}:${user.screenProtection[option.key]}`}
                orientation="horizontal"
                data-disabled={pending}
              >
                <Checkbox
                  id={`screen-protection-${option.key}`}
                  name={option.key}
                  defaultChecked={user.screenProtection[option.key]}
                  disabled={pending}
                />
                <div className="grid gap-1">
                  <FieldLabel htmlFor={`screen-protection-${option.key}`}>
                    {option.label}
                  </FieldLabel>
                  <FieldDescription>{option.description}</FieldDescription>
                </div>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
        <StaffFeedback state={state} />
        <Button className="w-fit" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Screen Protection"}
        </Button>
      </FieldGroup>
    </form>
  )
}

// Mirrors authorization: Administrative holds every registered permission.
function roleGrantedKeys(props: StaffWorkflowProps, user: StaffAccount) {
  const roleKeys = [...user.roleKeys, ...user.inheritedRoleKeys]
  if (roleKeys.includes("administrative")) {
    return new Set(props.permissions.map(({ key }) => key))
  }
  return new Set(
    roleKeys.flatMap((roleKey) => props.rolePermissionKeys[roleKey] ?? [])
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
      {props.canAssignRoles || props.canProvision || props.canManageOverrides ? (
        <SectionCard
          size="sm"
          id="staff-role-assignment"
          className="scroll-mt-20"
        >
          <CardHeader className="border-b">
            <CardTitle>2. Edit Staff Account</CardTitle>
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
            {user?.employeeCode && props.canProvision ? (
              <StaffLoginIdForm key={`login:${user.id}`} user={user} />
            ) : null}
            {user && props.canAssignRoles ? (
              <StaffRoleForm key={`roles:${user.id}`} user={user} roles={props.roles} />
            ) : null}
            {user && props.canManageOverrides ? (
              <StaffScreenProtectionForm key={`screen:${user.id}`} user={user} />
            ) : null}
            {user && props.canManageOverrides ? (
              <StaffPermissionOverridesForm
                key={`overrides:${user.id}`}
                overrides={user.overrides}
                permissions={props.permissions}
                roleGrantedKeys={roleGrantedKeys(props, user)}
                userId={user.id}
              />
            ) : null}
            {user && !props.canAssignRoles ? (
              <FieldDescription>
                Your account does not have Save Direct Roles access.
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
