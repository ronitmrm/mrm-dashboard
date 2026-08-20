"use client"

import { Search, X } from "lucide-react"
import { useMemo, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
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

type PermissionOption = {
  key: string
  module: string
  name: string
}

export function PermissionSelector({
  permissions,
}: {
  permissions: readonly PermissionOption[]
}) {
  const [query, setQuery] = useState("")
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const normalizedQuery = query.trim().toLowerCase()
  const permissionsByModule = useMemo(() => {
    const groups = new Map<string, PermissionOption[]>()
    for (const permission of permissions) {
      const group = groups.get(permission.module) ?? []
      group.push(permission)
      groups.set(permission.module, group)
    }
    return [...groups.entries()]
  }, [permissions])

  function permissionMatches(permission: PermissionOption) {
    return (
      !normalizedQuery ||
      permission.module.toLowerCase().includes(normalizedQuery) ||
      permission.name.toLowerCase().includes(normalizedQuery) ||
      permission.key.toLowerCase().includes(normalizedQuery)
    )
  }

  function setPermission(key: string, checked: boolean) {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  return (
    <FieldSet className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <FieldLegend>Capabilities</FieldLegend>
          <FieldDescription>
            Search by page, task, or module. Selected capabilities remain saved
            while filtering.
          </FieldDescription>
        </div>
        <Badge variant="secondary">{selectedKeys.size} selected</Badge>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search capabilities"
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search capabilities, for example Design or Store"
            value={query}
          />
        </div>
        {query || selectedKeys.size ? (
          <Button
            onClick={() => {
              setQuery("")
              setSelectedKeys(new Set())
            }}
            type="button"
            variant="outline"
          >
            <X /> Clear
          </Button>
        ) : null}
      </div>

      <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
        {permissionsByModule.map(([module, modulePermissions]) => {
          const hasVisiblePermission = modulePermissions.some(permissionMatches)
          return (
            <FieldGroup
              className="gap-3 rounded-lg border bg-muted/20 p-3"
              hidden={!hasVisiblePermission}
              key={module}
            >
              <FieldLegend
                className="text-muted-foreground capitalize"
                variant="label"
              >
                {module}
              </FieldLegend>
              <div className="grid gap-2 lg:grid-cols-2">
                {modulePermissions.map((permission) => {
                  const id = `role-permission-${permission.key}`
                  return (
                    <Field
                      className="rounded-md border bg-background p-2.5"
                      hidden={!permissionMatches(permission)}
                      key={permission.key}
                      orientation="horizontal"
                    >
                      <Checkbox
                        checked={selectedKeys.has(permission.key)}
                        id={id}
                        name="permissionKeys"
                        onCheckedChange={(checked) =>
                          setPermission(permission.key, checked === true)
                        }
                        value={permission.key}
                      />
                      <FieldLabel className="leading-snug" htmlFor={id}>
                        {permission.name}
                      </FieldLabel>
                    </Field>
                  )
                })}
              </div>
            </FieldGroup>
          )
        })}
      </div>
    </FieldSet>
  )
}
