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
import { useExcelTable } from "@workspace/ui/hooks/use-excel-table"
import { Pencil } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { updateCombinedRoleAction } from "@/app/hr/actions"
import { CombinedPostPicker } from "@/components/hr/combined-post-picker"
import { ExcelColumnFilter } from "@workspace/ui/components/excel-column-filter"

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
  masterView,
  posts,
  templates,
}: {
  canWrite: boolean
  combinedRoles: RecruitmentCombinedRoleRow[]
  masterView?: "dataEntry" | "masterTables"
  posts: RecruitmentPostRow[]
  templates: RecruitmentTemplateRow[]
}) {
  const [editingRole, setEditingRole] =
    useState<RecruitmentCombinedRoleRow | null>(null)
  const [name, setName] = useState("")
  const [primaryPostId, setPrimaryPostId] = useState("")
  const [templateCode, setTemplateCode] = useState("")
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(
    () => new Set()
  )
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
    setSelectedPostIds(new Set(memberPosts.map((post) => post.id)))
  }

  function closeEditor() {
    setEditingRole(null)
    setName("")
    setPrimaryPostId("")
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
  const filterColumns = [
    ["code", "Combined code"],
    ["name", "Name"],
    ["posts", "Post Codes"],
    ["primary", "Primary Post"],
    ["templates", "Job templates"],
    ["status", "Status"],
  ] as const
  const table = useExcelTable({
    rows: roleValues,
    columns: filterColumns.map(([key, label]) => ({
      key,
      label,
      values: (row: (typeof roleValues)[number]) => [
        key === "templates" ? row.templateLabel : String(row[key]),
      ],
    })),
  })
  const visibleRoles = table.visibleRows

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
        <CardContent className="space-y-2 overflow-x-auto">
          <div className="flex justify-end">
            <Button
              disabled={!table.hasFilters}
              onClick={table.clearFilters}
              size="sm"
              type="button"
              variant="outline"
            >
              Clear All Filters
            </Button>
          </div>
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
                      {...table.filterProps(key)}
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
            <input name="panel" type="hidden" value="combinedRolesPanel" />
            {masterView ? (
              <input name="master_view" type="hidden" value={masterView} />
            ) : null}
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
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{selectedPostIds.size} Posts Selected</span>
                <span className="text-muted-foreground">
                  {primaryPostId
                    ? "Primary Selected"
                    : "Choose One Primary Post"}
                </span>
              </div>
              <CombinedPostPicker
                idPrefix="edit-combine-post"
                onPostSelected={setPostSelected}
                onPrimaryPostChange={setPrimaryPostId}
                posts={editablePosts}
                primaryPostId={primaryPostId}
                selectedPostIds={selectedPostIds}
              />
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
