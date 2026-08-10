"use client"

import type {
  RecruitmentCombinedRoleRow,
  RecruitmentJobRow,
  RecruitmentPostRow,
  RecruitmentTemplateRow,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
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
import {
  BriefcaseBusiness,
  Download,
  FilterX,
  ListFilter,
  Pencil,
  Trash2,
  UserRoundCog,
} from "lucide-react"
import { useMemo, useState } from "react"

import {
  assignEmployeeAction,
  createJobAction,
  deletePostAction,
  updatePostAction,
} from "@/app/hr/actions"
import { SingleEmployeeAssignmentFields } from "@/components/hr/single-employee-assignment-fields"

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
  | "lastWorkingDate"
  | "status"

type ApprovedPostFilters = Record<ApprovedPostFilterKey, string[] | null>

const EMPTY_FILTERS: ApprovedPostFilters = {
  postCode: null,
  vacancyCode: null,
  department: null,
  designation: null,
  template: null,
  employeeName: null,
  employeeCode: null,
  lastWorkingDate: null,
  status: null,
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true })
  )
}

function matchesFilter(value: string, filter: string[] | null) {
  return filter === null || filter.includes(value)
}

function ApprovedPostColumnFilter({
  filterKey,
  label,
  onApply,
  options,
  selected,
}: {
  filterKey: ApprovedPostFilterKey
  label: string
  onApply: (value: string[] | null) => void
  options: string[]
  selected: string[] | null
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [draftSelected, setDraftSelected] = useState<string[]>(
    () => selected ?? options
  )
  const visibleOptions = options.filter((option) =>
    option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  )
  const allVisibleSelected =
    visibleOptions.length > 0 &&
    visibleOptions.every((option) => draftSelected.includes(option))
  const someVisibleSelected = visibleOptions.some((option) =>
    draftSelected.includes(option)
  )
  const active = selected !== null
  const titleId = `approved-post-${filterKey}-filter-title`

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setDraftSelected(selected ?? options)
      setQuery("")
    }
    setOpen(nextOpen)
  }

  function toggleOption(option: string, checked: boolean) {
    setDraftSelected((current) =>
      checked
        ? current.includes(option)
          ? current
          : [...current, option]
        : current.filter((value) => value !== option)
    )
  }

  function toggleVisibleOptions(checked: boolean) {
    setDraftSelected((current) => {
      const visible = new Set(visibleOptions)
      return checked
        ? Array.from(new Set([...current, ...visibleOptions]))
        : current.filter((value) => !visible.has(value))
    })
  }

  return (
    <Popover onOpenChange={changeOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={`Filter ${label}`}
          className="h-8 min-w-24 justify-between gap-2 px-2 text-xs font-normal"
          size="sm"
          type="button"
          variant={active ? "default" : "outline"}
        >
          <span>{active ? `${selected.length} selected` : "All"}</span>
          <ListFilter className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-labelledby={titleId}
        className="max-h-[var(--radix-popover-content-available-height)] w-64 gap-3 overflow-hidden rounded-xl p-3"
      >
        <p className="font-medium" id={titleId}>
          Filter {label}
        </p>
        <Input
          aria-label={`Search ${label} values`}
          className="h-8 text-xs"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search values..."
          value={query}
        />
        <label className="flex cursor-pointer items-center gap-2 rounded-md border-b px-1 pb-2 text-xs font-medium">
          <Checkbox
            checked={
              allVisibleSelected
                ? true
                : someVisibleSelected
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(checked) =>
              toggleVisibleOptions(checked === true)
            }
          />
          Select all{query ? " matching" : ""}
        </label>
        <div className="min-h-20 flex-1 space-y-1 overflow-y-auto pr-1">
          {visibleOptions.length ? (
            visibleOptions.map((option) => (
              <label
                className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-xs hover:bg-muted"
                key={option}
              >
                <Checkbox
                  checked={draftSelected.includes(option)}
                  onCheckedChange={(checked) =>
                    toggleOption(option, checked === true)
                  }
                />
                <span className="min-w-0 truncate" title={option}>
                  {option}
                </span>
              </label>
            ))
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No values found.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <Button
            onClick={() => {
              onApply(null)
              setOpen(false)
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Clear filter
          </Button>
          <Button
            onClick={() => {
              onApply(
                draftSelected.length === options.length ? null : draftSelected
              )
              setOpen(false)
            }}
            size="sm"
            type="button"
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
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
  combinedRoles = [],
  employeeManagement = false,
  jobs = [],
  posts,
  templates = [],
}: {
  canWrite?: boolean
  combinedRoles?: RecruitmentCombinedRoleRow[]
  employeeManagement?: boolean
  jobs?: RecruitmentJobRow[]
  posts: RecruitmentPostRow[]
  templates?: TemplateOption[]
}) {
  const [editingPost, setEditingPost] = useState<RecruitmentPostRow | null>(
    null
  )
  const [selectedEmployeePost, setSelectedEmployeePost] =
    useState<RecruitmentPostRow | null>(null)
  const [employeeEditorOpen, setEmployeeEditorOpen] = useState(false)
  const [filters, setFilters] = useState<ApprovedPostFilters>(() => ({
    ...EMPTY_FILTERS,
  }))
  const openJobPostCodes = new Set(
    jobs
      .filter((job) => job.status === "Open" && job.postCode)
      .map((job) => job.postCode)
  )
  const showActions = canWrite || employeeManagement
  const columnCount = 9 + (employeeManagement ? 1 : 0) + (showActions ? 1 : 0)
  const hasFilters = Object.values(filters).some((filter) => filter !== null)
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
      lastWorkingDate: uniqueOptions(
        posts.map((row) => row.lastWorkingDate ?? "Not applicable")
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
          matchesFilter(
            row.lastWorkingDate ?? "Not applicable",
            filters.lastWorkingDate
          ) &&
          matchesFilter(row.status, filters.status)
      ),
    [filters, posts]
  )

  function updateFilter(key: ApprovedPostFilterKey, value: string[] | null) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  return (
    <>
    <Sheet
      onOpenChange={(open) => {
        if (!open) setEditingPost(null)
      }}
      open={editingPost !== null}
    >
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Approved posts</CardTitle>
            <CardDescription>
              {hasFilters
                ? `Showing ${filteredPosts.length} of ${posts.length} sanctioned staffing positions`
                : `${posts.length} sanctioned staffing positions`}
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <a href="/hr/approved-posts/export">
              <Download data-icon="inline-start" />
              Download Excel
            </a>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex min-h-8 items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Open a column filter, tick one or more values, then Apply. Filters
              from different columns work together.
            </p>
            <div className="flex items-center gap-2">
            {employeeManagement ? (
              <Button
                disabled={!selectedEmployeePost}
                onClick={() => setEmployeeEditorOpen(true)}
                size="sm"
                type="button"
              >
                <UserRoundCog data-icon="inline-start" />
                Update selected employee
              </Button>
            ) : null}
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
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {employeeManagement ? <TableHead>Select</TableHead> : null}
                  <TableHead>Post code</TableHead>
                  <TableHead>Vacancy code</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Employee name</TableHead>
                  <TableHead>Employee code</TableHead>
                  <TableHead>Last working date</TableHead>
                  <TableHead>Status</TableHead>
                  {showActions ? (
                    <TableHead className="text-right">Actions</TableHead>
                  ) : null}
                </TableRow>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  {employeeManagement ? <TableHead /> : null}
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="postCode"
                      label="Post code"
                      onApply={(value) => updateFilter("postCode", value)}
                      options={filterOptions.postCode}
                      selected={filters.postCode}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="vacancyCode"
                      label="Vacancy code"
                      onApply={(value) => updateFilter("vacancyCode", value)}
                      options={filterOptions.vacancyCode}
                      selected={filters.vacancyCode}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="department"
                      label="Department"
                      onApply={(value) => updateFilter("department", value)}
                      options={filterOptions.department}
                      selected={filters.department}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="designation"
                      label="Designation"
                      onApply={(value) => updateFilter("designation", value)}
                      options={filterOptions.designation}
                      selected={filters.designation}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="template"
                      label="Template"
                      onApply={(value) => updateFilter("template", value)}
                      options={filterOptions.template}
                      selected={filters.template}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="employeeName"
                      label="Employee name"
                      onApply={(value) => updateFilter("employeeName", value)}
                      options={filterOptions.employeeName}
                      selected={filters.employeeName}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="employeeCode"
                      label="Employee code"
                      onApply={(value) => updateFilter("employeeCode", value)}
                      options={filterOptions.employeeCode}
                      selected={filters.employeeCode}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="lastWorkingDate"
                      label="Last working date"
                      onApply={(value) =>
                        updateFilter("lastWorkingDate", value)
                      }
                      options={filterOptions.lastWorkingDate}
                      selected={filters.lastWorkingDate}
                    />
                  </TableHead>
                  <TableHead>
                    <ApprovedPostColumnFilter
                      filterKey="status"
                      label="Status"
                      onApply={(value) => updateFilter("status", value)}
                      options={filterOptions.status}
                      selected={filters.status}
                    />
                  </TableHead>
                  {showActions ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPosts.length ? (
                  filteredPosts.map((row) => (
                    <TableRow key={row.id}>
                      {employeeManagement ? (
                        <TableCell>
                          <Checkbox
                            aria-label={`Select ${row.postCode}`}
                            checked={selectedEmployeePost?.id === row.id}
                            disabled={
                              Boolean(row.combinedRoleId) &&
                              !row.isPrimaryCombinedPost
                            }
                            onCheckedChange={(checked) =>
                              setSelectedEmployeePost(
                                checked === true ? row : null
                              )
                            }
                          />
                        </TableCell>
                      ) : null}
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
                      <TableCell>{row.lastWorkingDate ?? "—"}</TableCell>
                      <TableCell>
                        <PostStatusBadge status={row.status} />
                      </TableCell>
                      {showActions ? (
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            {employeeManagement ? (
                              <Button
                                disabled={
                                  Boolean(row.combinedRoleId) &&
                                  !row.isPrimaryCombinedPost
                                }
                                onClick={() => {
                                  setSelectedEmployeePost(row)
                                  setEmployeeEditorOpen(true)
                                }}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                <UserRoundCog data-icon="inline-start" />
                                Employee
                              </Button>
                            ) : null}
                            {canWrite ? (
                              <>
                            {(row.status === "Vacant" ||
                              row.status === "Resigned") &&
                            (!row.combinedRoleId ||
                              row.isPrimaryCombinedPost) &&
                            !openJobPostCodes.has(row.postCode) ? (
                              <form action={createJobAction}>
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
                                <Button size="sm" type="submit">
                                  <BriefcaseBusiness data-icon="inline-start" />
                                  Create job
                                </Button>
                              </form>
                            ) : null}
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
                              </>
                            ) : null}
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
    <Sheet
      onOpenChange={setEmployeeEditorOpen}
      open={employeeEditorOpen && selectedEmployeePost !== null}
    >
      {selectedEmployeePost ? (
        <SheetContent className="!w-full overflow-y-auto sm:!w-[30rem] sm:!max-w-[30rem]">
          <form action={assignEmployeeAction} className="flex min-h-full flex-col">
            <input name="panel" type="hidden" value="employeeMasterPanel" />
            <SheetHeader>
              <SheetTitle>Update employee status</SheetTitle>
              <SheetDescription>
                {selectedEmployeePost.postCode} · {selectedEmployeePost.designation}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 flex-col gap-5 px-6 pb-2">
              <SingleEmployeeAssignmentFields
                combinedRoles={combinedRoles}
                initialPostId={selectedEmployeePost.id}
                key={selectedEmployeePost.id}
                posts={posts}
                showTargetSelector={false}
              />
            </div>
            <SheetFooter>
              <Button type="submit">Update employee status</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      ) : null}
    </Sheet>
    </>
  )
}
