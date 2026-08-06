"use client"

import type { RecruitmentPostRow, RecruitmentTemplateRow } from "@workspace/db"
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
import { FilterX, Pencil, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

import { deletePostAction, updatePostAction } from "@/app/hr/actions"

type TemplateOption = Pick<
  RecruitmentTemplateRow,
  "id" | "name" | "templateCode"
>

type ApprovedPostFilterKey =
  | "postCode"
  | "vacancyCode"
  | "department"
  | "designation"
  | "template"
  | "employeeName"
  | "employeeCode"
  | "status"

type ApprovedPostFilters = Record<ApprovedPostFilterKey, string>

const EMPTY_FILTERS: ApprovedPostFilters = {
  postCode: "",
  vacancyCode: "",
  department: "",
  designation: "",
  template: "",
  employeeName: "",
  employeeCode: "",
  status: "",
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true })
  )
}

function matchesFilter(value: string, filter: string) {
  return value.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())
}

function ApprovedPostColumnFilter({
  filterKey,
  label,
  onChange,
  options,
  value,
}: {
  filterKey: ApprovedPostFilterKey
  label: string
  onChange: (value: string) => void
  options: string[]
  value: string
}) {
  const listId = `approved-post-${filterKey}-options`

  return (
    <>
      <Input
        aria-label={`Filter ${label}`}
        className="h-8 min-w-28 rounded-md px-2 text-xs font-normal"
        list={listId}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search..."
        value={value}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  )
}

function PostStatusBadge({ status }: { status: string }) {
  const variant =
    status === "Vacant" || status === "Occupied"
      ? "default"
      : status === "Resigned"
        ? "destructive"
        : status === "Appointed"
          ? "secondary"
          : "outline"
  return <Badge variant={variant}>{status}</Badge>
}

export function ApprovedPostsTable({
  canWrite = false,
  posts,
  templates = [],
}: {
  canWrite?: boolean
  posts: RecruitmentPostRow[]
  templates?: TemplateOption[]
}) {
  const [editingPost, setEditingPost] = useState<RecruitmentPostRow | null>(
    null
  )
  const [filters, setFilters] = useState<ApprovedPostFilters>(() => ({
    ...EMPTY_FILTERS,
  }))
  const columnCount = canWrite ? 9 : 8
  const hasFilters = Object.values(filters).some((filter) => filter.trim())
  const filterOptions = useMemo(
    () => ({
      postCode: uniqueOptions(posts.map((row) => row.postCode)),
      vacancyCode: uniqueOptions(posts.map((row) => row.vacancyCode)),
      department: uniqueOptions(posts.map((row) => row.department)),
      designation: uniqueOptions(posts.map((row) => row.designation)),
      template: uniqueOptions(
        posts.map((row) => row.requirementTemplateCode ?? "No template")
      ),
      employeeName: uniqueOptions(
        posts.map((row) => row.employeeName ?? "Unassigned")
      ),
      employeeCode: uniqueOptions(
        posts.map((row) => row.employeeCode ?? "Unassigned")
      ),
      status: uniqueOptions(posts.map((row) => row.status)),
    }),
    [posts]
  )
  const filteredPosts = useMemo(
    () =>
      posts.filter(
        (row) =>
          matchesFilter(row.postCode, filters.postCode) &&
          matchesFilter(row.vacancyCode, filters.vacancyCode) &&
          matchesFilter(row.department, filters.department) &&
          matchesFilter(row.designation, filters.designation) &&
          matchesFilter(
            row.requirementTemplateCode ?? "No template",
            filters.template
          ) &&
          matchesFilter(
            row.employeeName ?? "Unassigned",
            filters.employeeName
          ) &&
          matchesFilter(
            row.employeeCode ?? "Unassigned",
            filters.employeeCode
          ) &&
          matchesFilter(row.status, filters.status)
      ),
    [filters, posts]
  )

  function updateFilter(key: ApprovedPostFilterKey, value: string) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) setEditingPost(null)
      }}
      open={editingPost !== null}
    >
      <Card>
        <CardHeader>
          <CardTitle>Approved posts</CardTitle>
          <CardDescription>
            {hasFilters
              ? `Showing ${filteredPosts.length} of ${posts.length} sanctioned staffing positions`
              : `${posts.length} sanctioned staffing positions`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex min-h-8 items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Search in one or more columns. Suggested values open from each
              field.
            </p>
            {hasFilters ? (
              <Button
                onClick={() => setFilters({ ...EMPTY_FILTERS })}
                size="sm"
                type="button"
                variant="outline"
              >
                <FilterX data-icon="inline-start" />
                Clear filters
              </Button>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Post code</TableHead>
                  <TableHead>Vacancy code</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Employee name</TableHead>
                  <TableHead>Employee code</TableHead>
                  <TableHead>Status</TableHead>
                  {canWrite ? (
                    <TableHead className="text-right">Actions</TableHead>
                  ) : null}
                </TableRow>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="postCode"
                      label="Post code"
                      onChange={(value) => updateFilter("postCode", value)}
                      options={filterOptions.postCode}
                      value={filters.postCode}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="vacancyCode"
                      label="Vacancy code"
                      onChange={(value) => updateFilter("vacancyCode", value)}
                      options={filterOptions.vacancyCode}
                      value={filters.vacancyCode}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="department"
                      label="Department"
                      onChange={(value) => updateFilter("department", value)}
                      options={filterOptions.department}
                      value={filters.department}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="designation"
                      label="Designation"
                      onChange={(value) => updateFilter("designation", value)}
                      options={filterOptions.designation}
                      value={filters.designation}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="template"
                      label="Template"
                      onChange={(value) => updateFilter("template", value)}
                      options={filterOptions.template}
                      value={filters.template}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="employeeName"
                      label="Employee name"
                      onChange={(value) => updateFilter("employeeName", value)}
                      options={filterOptions.employeeName}
                      value={filters.employeeName}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="employeeCode"
                      label="Employee code"
                      onChange={(value) => updateFilter("employeeCode", value)}
                      options={filterOptions.employeeCode}
                      value={filters.employeeCode}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="status"
                      label="Status"
                      onChange={(value) => updateFilter("status", value)}
                      options={filterOptions.status}
                      value={filters.status}
                    />
                  </TableHead>
                  {canWrite ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPosts.length ? (
                  filteredPosts.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono">
                        {row.postCode}
                      </TableCell>
                      <TableCell className="font-mono">
                        {row.vacancyCode}
                      </TableCell>
                      <TableCell>{row.department}</TableCell>
                      <TableCell>{row.designation}</TableCell>
                      <TableCell className="font-mono">
                        {row.requirementTemplateCode ?? "—"}
                      </TableCell>
                      <TableCell>{row.employeeName ?? "—"}</TableCell>
                      <TableCell className="font-mono">
                        {row.employeeCode ?? "—"}
                      </TableCell>
                      <TableCell>
                        <PostStatusBadge status={row.status} />
                      </TableCell>
                      {canWrite ? (
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              aria-label={`Edit ${row.postCode}`}
                              onClick={() => setEditingPost(row)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <Pencil data-icon="inline-start" />
                              Edit
                            </Button>
                            <form
                              action={deletePostAction}
                              onSubmit={(event) => {
                                if (
                                  !window.confirm(
                                    `Delete approved post ${row.postCode}? This cannot be undone.`
                                  )
                                ) {
                                  event.preventDefault()
                                }
                              }}
                            >
                              <input
                                name="panel"
                                type="hidden"
                                value="approvedPostPanel"
                              />
                              <input
                                name="post_id"
                                type="hidden"
                                value={row.id}
                              />
                              <Button
                                size="sm"
                                type="submit"
                                variant="destructive"
                              >
                                <Trash2 data-icon="inline-start" />
                                Delete
                              </Button>
                            </form>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="py-10 text-center text-muted-foreground"
                      colSpan={columnCount}
                    >
                      {posts.length
                        ? "No approved posts match the selected filters."
                        : "No approved posts found."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {editingPost ? (
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <form action={updatePostAction} className="flex min-h-full flex-col">
            <input name="panel" type="hidden" value="approvedPostPanel" />
            <input name="post_id" type="hidden" value={editingPost.id} />
            <SheetHeader>
              <SheetTitle>Edit approved post</SheetTitle>
              <SheetDescription>
                Update the job template linked to {editingPost.postCode}.
                Department and designation remain locked because they form the
                software-generated Post Code.
              </SheetDescription>
            </SheetHeader>
            <div className="grid flex-1 content-start gap-4 px-6">
              <Field>
                <FieldLabel htmlFor="edit-post-code">Post code</FieldLabel>
                <Input
                  id="edit-post-code"
                  readOnly
                  value={editingPost.postCode}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-post-department">
                  Department
                </FieldLabel>
                <Input
                  id="edit-post-department"
                  readOnly
                  value={editingPost.department}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-post-designation">
                  Designation
                </FieldLabel>
                <Input
                  id="edit-post-designation"
                  readOnly
                  value={editingPost.designation}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-post-template">
                  Job template
                </FieldLabel>
                <NativeSelect
                  className="w-full"
                  defaultValue={editingPost.requirementTemplateCode ?? ""}
                  id="edit-post-template"
                  name="requirement_template_code"
                >
                  <NativeSelectOption value="">No template</NativeSelectOption>
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
            </div>
            <SheetFooter>
              <Button type="submit">Save changes</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      ) : null}
    </Sheet>
  )
}
