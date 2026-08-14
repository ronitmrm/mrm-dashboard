"use client"

import type {
  RecruitmentCombinedRoleRow,
  RecruitmentPostRow,
  RecruitmentTemplateRow,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Pencil } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { updateCombinedRoleAction } from "@/app/hr/actions"
import {
  ExcelColumnFilter,
  matchesColumnFilter,
  uniqueFilterOptions,
} from "@/components/hr/excel-column-filter"

function CombinedStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "Active" ? "default" : "outline"}>
      {status}
    </Badge>
  )
}

export function CombinedRolesTable({
  canWrite,
  combinedRoles,
  posts,
  templates,
}: {
  canWrite: boolean
  combinedRoles: RecruitmentCombinedRoleRow[]
  posts: RecruitmentPostRow[]
  templates: RecruitmentTemplateRow[]
}) {
  const [editingRole, setEditingRole] =
    useState<RecruitmentCombinedRoleRow | null>(null)
  const [name, setName] = useState("")
  const [primaryPostId, setPrimaryPostId] = useState("")
  const [search, setSearch] = useState("")
  const [templateCode, setTemplateCode] = useState("")
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(
    () => new Set()
  )
  const [filters, setFilters] = useState<Record<string, string[] | null>>({
    code: null,
    name: null,
    posts: null,
    primary: null,
    status: null,
    templates: null,
  })

  function startEditing(role: RecruitmentCombinedRoleRow) {
    const memberCodes = new Set(role.postCodes)
    const memberPosts = posts.filter((post) => memberCodes.has(post.postCode))
    const primaryPost = memberPosts.find(
      (post) => post.postCode === role.primaryPostCode
    )
    setEditingRole(role)
    setName(role.name)
    setPrimaryPostId(primaryPost?.id ?? "")
    setTemplateCode(
      primaryPost?.requirementTemplateCode ??
        memberPosts.find((post) => post.requirementTemplateCode)
          ?.requirementTemplateCode ??
        templates.find((template) => template.combinedRoleId === role.id)
          ?.templateCode ??
        ""
    )
    setSearch("")
    setSelectedPostIds(new Set(memberPosts.map((post) => post.id)))
  }

  function closeEditor() {
    setEditingRole(null)
    setName("")
    setPrimaryPostId("")
    setSearch("")
    setTemplateCode("")
    setSelectedPostIds(new Set())
  }

  function setPostSelected(postId: string, selected: boolean) {
    setSelectedPostIds((current) => {
      const next = new Set(current)
      if (selected) next.add(postId)
      else next.delete(postId)
      return next
    })
    if (!selected && primaryPostId === postId) setPrimaryPostId("")
  }

  const editingMemberCodes = new Set(editingRole?.postCodes ?? [])
  const otherActiveMemberCodes = new Set(
    combinedRoles
      .filter((role) => role.status === "Active" && role.id !== editingRole?.id)
      .flatMap((role) => role.postCodes)
  )
  const editablePosts = posts.filter(
    (post) =>
      post.status !== "Inactive" &&
      (editingMemberCodes.has(post.postCode) ||
        !otherActiveMemberCodes.has(post.postCode))
  )
  const normalizedSearch = search.trim().toLowerCase()
  const filteredPosts = normalizedSearch
    ? editablePosts.filter((post) =>
        [post.postCode, post.department, post.designation].some((value) =>
          value.toLowerCase().includes(normalizedSearch)
        )
      )
    : editablePosts
  const canSubmit =
    selectedPostIds.size >= 2 && selectedPostIds.has(primaryPostId)
  const roleValues = useMemo(
    () =>
      combinedRoles.map((role) => {
        const memberTemplates = [
          ...new Set([
            ...templates
              .filter((template) => template.combinedRoleId === role.id)
              .map((template) => template.templateCode),
            ...posts
              .filter((post) => role.postCodes.includes(post.postCode))
              .flatMap((post) =>
                post.requirementTemplateCode
                  ? [post.requirementTemplateCode]
                  : []
              ),
          ]),
        ].sort()
        return {
          code: role.vacancyCode ?? "—",
          name: role.name,
          posts: role.postCodes.join(", ") || "—",
          primary: role.primaryPostCode ?? "—",
          role,
          status: role.status,
          templateLabel: memberTemplates.join(", ") || "—",
          templates: memberTemplates,
        }
      }),
    [combinedRoles, posts, templates]
  )
  const filterOptions = useMemo(
    () => ({
      code: uniqueFilterOptions(roleValues.map((row) => row.code)),
      name: uniqueFilterOptions(roleValues.map((row) => row.name)),
      posts: uniqueFilterOptions(roleValues.map((row) => row.posts)),
      primary: uniqueFilterOptions(roleValues.map((row) => row.primary)),
      status: uniqueFilterOptions(roleValues.map((row) => row.status)),
      templates: uniqueFilterOptions(
        roleValues.map((row) => row.templateLabel)
      ),
    }),
    [roleValues]
  )
  const visibleRoles = roleValues.filter(
    (row) =>
      matchesColumnFilter(row.code, filters.code ?? null) &&
      matchesColumnFilter(row.name, filters.name ?? null) &&
      matchesColumnFilter(row.posts, filters.posts ?? null) &&
      matchesColumnFilter(row.primary, filters.primary ?? null) &&
      matchesColumnFilter(row.templateLabel, filters.templates ?? null) &&
      matchesColumnFilter(row.status, filters.status ?? null)
  )
  const filterColumns = [
    ["code", "Combined code"],
    ["name", "Name"],
    ["posts", "Post Codes"],
    ["primary", "Primary Post"],
    ["templates", "Job templates"],
    ["status", "Status"],
  ] as const

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) closeEditor()
      }}
      open={editingRole !== null}
    >
      <Card>
        <CardHeader>
          <CardTitle>Combined Roles</CardTitle>
          <CardDescription>
            {combinedRoles.filter((role) => role.status === "Active").length}{" "}
            Active Groups
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Combined Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Post Codes</TableHead>
                <TableHead>Primary Post</TableHead>
                <TableHead>Job Template</TableHead>
                <TableHead>Status</TableHead>
                {canWrite ? (
                  <TableHead className="text-right">Actions</TableHead>
                ) : null}
              </TableRow>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {filterColumns.map(([key, label]) => (
                  <TableHead key={key}>
                    <ExcelColumnFilter
                      label={label}
                      onApply={(selected) =>
                        setFilters((current) => ({
                          ...current,
                          [key]: selected,
                        }))
                      }
                      options={filterOptions[key]}
                      selected={filters[key] ?? null}
                    />
                  </TableHead>
                ))}
                {canWrite ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRoles.length ? (
                visibleRoles.map(({ role, templates: templateCodes }) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-mono">
                      {role.vacancyCode ?? "—"}
                    </TableCell>
                    <TableCell>{role.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {role.postCodes.join(", ") || "—"}
                    </TableCell>
                    <TableCell className="font-mono">
                      {role.primaryPostCode ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {templateCodes.length
                          ? templateCodes.map((code) => (
                              <Button
                                asChild
                                className="h-auto p-0 font-mono"
                                key={code}
                                variant="link"
                              >
                                <Link
                                  href={`/hr?panel=postMasterPanel&template=${encodeURIComponent(code)}`}
                                >
                                  {code}
                                </Link>
                              </Button>
                            ))
                          : "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <CombinedStatusBadge status={role.status} />
                    </TableCell>
                    {canWrite ? (
                      <TableCell className="text-right">
                        <Button
                          disabled={role.status !== "Active"}
                          onClick={() => startEditing(role)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Pencil data-icon="inline-start" />
                          Edit
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={canWrite ? 7 : 6}
                  >
                    {combinedRoles.length
                      ? "No Combined Roles Match The Selected Filters."
                      : "No Combined Roles Found."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editingRole ? (
        <SheetContent className="!w-full overflow-y-auto sm:!w-[40rem] sm:!max-w-[40rem]">
          <form
            action={updateCombinedRoleAction}
            className="flex min-h-full flex-col"
          >
            <input name="panel" type="hidden" value="approvedPostPanel" />
            <input
              name="combined_role_id"
              type="hidden"
              value={editingRole.id}
            />
            {[...selectedPostIds].map((postId) => (
              <input
                key={postId}
                name="post_ids"
                type="hidden"
                value={postId}
              />
            ))}
            <input name="primary_post_id" type="hidden" value={primaryPostId} />
            <SheetHeader>
              <SheetTitle>Edit Combined Role</SheetTitle>
              <SheetDescription>
                Select Its Job Template And Maintain The Combined Post Codes.
              </SheetDescription>
            </SheetHeader>
            <div className="grid flex-1 content-start gap-4 px-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="edit-combined-name">
                    Combined Role Name
                  </FieldLabel>
                  <Input
                    id="edit-combined-name"
                    name="name"
                    onChange={(event) => setName(event.target.value)}
                    required
                    value={name}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-combined-code">
                    Combined Vacancy Code
                  </FieldLabel>
                  <Input
                    id="edit-combined-code"
                    readOnly
                    value={editingRole.vacancyCode ?? ""}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="edit-combined-template">
                  Job Template
                </FieldLabel>
                <NativeSelect
                  className="w-full"
                  id="edit-combined-template"
                  name="requirement_template_code"
                  onChange={(event) => setTemplateCode(event.target.value)}
                  value={templateCode}
                >
                  <NativeSelectOption value="">No Template</NativeSelectOption>
                  {templates.map((template) => (
                    <NativeSelectOption
                      key={template.id}
                      value={template.templateCode}
                    >
                      {template.templateCode} / {template.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-combined-search">
                  Search Post Codes
                </FieldLabel>
                <Input
                  id="edit-combined-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search By Post Code, Department, Or Designation"
                  value={search}
                />
              </Field>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{selectedPostIds.size} Posts Selected</span>
                <span className="text-muted-foreground">
                  {primaryPostId
                    ? "Primary Selected"
                    : "Choose One Primary Post"}
                </span>
              </div>
              <div className="max-h-[50vh] overflow-y-auto rounded-md border">
                {filteredPosts.length ? (
                  filteredPosts.map((post) => {
                    const selected = selectedPostIds.has(post.id)
                    return (
                      <div
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b px-3 py-2 last:border-b-0"
                        key={post.id}
                      >
                        <input
                          checked={selected}
                          className="size-4 accent-primary"
                          id={`edit-combine-post-${post.id}`}
                          onChange={(event) =>
                            setPostSelected(post.id, event.target.checked)
                          }
                          type="checkbox"
                        />
                        <label
                          className="min-w-0 cursor-pointer"
                          htmlFor={`edit-combine-post-${post.id}`}
                        >
                          <span className="block font-mono text-sm font-medium">
                            {post.postCode}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {post.department} / {post.designation} / {post.status}
                          </span>
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            checked={primaryPostId === post.id}
                            className="size-4 accent-primary"
                            disabled={!selected}
                            name="primary-post-choice"
                            onChange={() => setPrimaryPostId(post.id)}
                            type="radio"
                          />
                          Primary
                        </label>
                      </div>
                    )
                  })
                ) : (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    No Available Post Codes Match This Search.
                  </p>
                )}
              </div>
            </div>
            <SheetFooter>
              <Button disabled={!canSubmit} type="submit">
                Save Combined Role
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      ) : null}
    </Sheet>
  )
}
