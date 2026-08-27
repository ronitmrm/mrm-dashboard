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
import { ExcelColumnFilter } from "@workspace/ui/components/excel-column-filter"
import { useExcelTable } from "@workspace/ui/hooks/use-excel-table"
import {
  BriefcaseBusiness,
  FilterX,
  Pencil,
  Trash2,
  UserRoundCog,
} from "lucide-react"
import { useState } from "react"

import {
  assignEmployeeAction,
  createJobAction,
  deletePostAction,
  updatePostAction,
} from "@/app/hr/actions"
import { APPROVED_POST_FILTER_COLUMNS } from "@/components/hr/approved-post-filter-columns"
import { SingleEmployeeAssignmentFields } from "@/components/hr/single-employee-assignment-fields"

type TemplateOption = Pick<
  RecruitmentTemplateRow,
  "id" | "name" | "templateCode"
>

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
  masterView,
  posts,
  templates = [],
}: {
  canWrite?: boolean
  combinedRoles?: RecruitmentCombinedRoleRow[]
  employeeManagement?: boolean
  jobs?: RecruitmentJobRow[]
  masterView?: "dataEntry" | "masterTables"
  posts: RecruitmentPostRow[]
  templates?: TemplateOption[]
}) {
  const [editingPost, setEditingPost] = useState<RecruitmentPostRow | null>(
    null
  )
  const [selectedEmployeePost, setSelectedEmployeePost] =
    useState<RecruitmentPostRow | null>(null)
  const [employeeEditorOpen, setEmployeeEditorOpen] = useState(false)
  const openJobPostCodes = new Set(
    jobs
      .filter((job) => job.status === "Open" && job.postCode)
      .map((job) => job.postCode)
  )
  const showActions = canWrite || employeeManagement
  const columnCount = 10 + (employeeManagement ? 1 : 0) + (showActions ? 1 : 0)
  const table = useExcelTable({
    rows: posts,
    columns: APPROVED_POST_FILTER_COLUMNS.map(({ key, label }) => ({
      key,
      label,
      values: (row: RecruitmentPostRow) => [
        key === "template"
          ? (row.requirementTemplateCode ?? "No template")
          : key === "employeeName" || key === "employeeCode"
            ? (row[key] ?? "Unassigned")
            : key === "joiningDate"
              ? (row.joiningDate ?? "Not appointed")
              : key === "lastWorkingDate"
                ? (row.lastWorkingDate ?? "Not applicable")
                : String(row[key]),
      ],
    })),
  })
  const hasFilters = table.hasFilters
  const filteredPosts = table.visibleRows

  return (
    <>
      <Sheet
        onOpenChange={(open) => {
          if (!open) setEditingPost(null)
        }}
        open={editingPost !== null}
      >
        <Card>
          <CardHeader>
            <div className="space-y-1.5">
              <CardTitle>
                {employeeManagement ? "Employee Master" : "Approved Posts"}
              </CardTitle>
              <CardDescription>
                {hasFilters
                  ? `Showing ${filteredPosts.length} of ${posts.length} sanctioned staffing positions`
                  : `${posts.length} sanctioned staffing positions`}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex min-h-8 items-center justify-end gap-3">
              <div className="flex items-center gap-2">
                {employeeManagement ? (
                  <Button
                    disabled={!selectedEmployeePost}
                    onClick={() => setEmployeeEditorOpen(true)}
                    size="sm"
                    type="button"
                  >
                    <UserRoundCog data-icon="inline-start" />
                    Update Selected Employee
                  </Button>
                ) : null}
                <Button
                  disabled={!hasFilters}
                  onClick={table.clearFilters}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <FilterX data-icon="inline-start" />
                  Clear All Filters
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {employeeManagement ? <TableHead>Select</TableHead> : null}
                    <TableHead>Post Code</TableHead>
                    <TableHead>Vacancy Code</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Employee Name</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Joining Date</TableHead>
                    <TableHead>Last Working Date</TableHead>
                    <TableHead>Status</TableHead>
                    {showActions ? (
                      <TableHead className="text-right">Actions</TableHead>
                    ) : null}
                  </TableRow>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    {employeeManagement ? <TableHead /> : null}
                    {APPROVED_POST_FILTER_COLUMNS.map((column) => (
                      <TableHead key={column.key}>
                        <ExcelColumnFilter
                          label={column.label}
                          {...table.filterProps(column.key)}
                        />
                      </TableHead>
                    ))}
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
                        <TableCell>{row.joiningDate ?? "—"}</TableCell>
                        <TableCell>{row.lastWorkingDate ?? "—"}</TableCell>
                        <TableCell>
                          <PostStatusBadge status={row.status} />
                        </TableCell>
                        {showActions ? (
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              {employeeManagement ? (
                                <Button
                                  onClick={() => {
                                    setSelectedEmployeePost(row)
                                    setEmployeeEditorOpen(true)
                                  }}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  <UserRoundCog data-icon="inline-start" />
                                  {row.joiningConfirmationDue
                                    ? "Confirm Joining"
                                    : "Employee"}
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
                                      {masterView ? (
                                        <input
                                          name="master_view"
                                          type="hidden"
                                          value={masterView}
                                        />
                                      ) : null}
                                      <input
                                        name="post_id"
                                        type="hidden"
                                        value={row.id}
                                      />
                                      <Button size="sm" type="submit">
                                        <BriefcaseBusiness data-icon="inline-start" />
                                        Create Job
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
                                    {masterView ? (
                                      <input
                                        name="master_view"
                                        type="hidden"
                                        value={masterView}
                                      />
                                    ) : null}
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
                          ? "No Approved Posts Match The Selected Filters."
                          : "No Approved Posts Found."}
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
            <form
              action={updatePostAction}
              className="flex min-h-full flex-col"
            >
              <input name="panel" type="hidden" value="approvedPostPanel" />
              {masterView ? (
                <input name="master_view" type="hidden" value={masterView} />
              ) : null}
              <input name="post_id" type="hidden" value={editingPost.id} />
              <SheetHeader>
                <SheetTitle>Edit Approved Post</SheetTitle>
                <SheetDescription>
                  Update The Job Template Linked To {editingPost.postCode}.
                  Department And Designation Remain Locked Because They Form The
                  Software-Generated Post Code.
                </SheetDescription>
              </SheetHeader>
              <div className="grid flex-1 content-start gap-4 px-6">
                <Field>
                  <FieldLabel htmlFor="edit-post-code">Post Code</FieldLabel>
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
                    Job Template
                  </FieldLabel>
                  <NativeSelect
                    className="w-full"
                    defaultValue={editingPost.requirementTemplateCode ?? ""}
                    id="edit-post-template"
                    name="requirement_template_code"
                  >
                    <NativeSelectOption value="">
                      No Template
                    </NativeSelectOption>
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
                <Button type="submit">Save Changes</Button>
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
            <form
              action={assignEmployeeAction}
              className="flex min-h-full flex-col"
            >
              <input name="panel" type="hidden" value="employeeMasterPanel" />
              {employeeManagement && masterView ? (
                <>
                  <input name="master_view" type="hidden" value={masterView} />
                  <input
                    name="master_kind"
                    type="hidden"
                    value="employee-assignment"
                  />
                </>
              ) : null}
              <SheetHeader>
                <SheetTitle>Edit Employee</SheetTitle>
                <SheetDescription>
                  {selectedEmployeePost.postCode} ·{" "}
                  {selectedEmployeePost.designation}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 flex-col gap-5 px-6 pb-2">
                <SingleEmployeeAssignmentFields
                  allowIdentityCorrection
                  combinedRoles={combinedRoles}
                  initialPostId={selectedEmployeePost.id}
                  key={selectedEmployeePost.id}
                  posts={posts}
                  showTargetSelector={false}
                />
              </div>
              <SheetFooter>
                <Button type="submit">Save Employee</Button>
              </SheetFooter>
            </form>
          </SheetContent>
        ) : null}
      </Sheet>
    </>
  )
}
