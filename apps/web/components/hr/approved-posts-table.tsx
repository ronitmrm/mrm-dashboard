"use client"

import type {
  RecruitmentCombinedRoleRow,
  RecruitmentEmploymentLetterRow,
  RecruitmentJobRow,
  RecruitmentPostRow,
  RecruitmentTemplateRow,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
 SectionCard,
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
 OperationalTable,
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
  Download,
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
import { EmployeeLetterDialog } from "@/components/hr/employee-letter-dialog"

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
  employmentLetters = [],
  jobs = [],
  masterView,
  posts,
  templates = [],
}: {
  canWrite?: boolean
  combinedRoles?: RecruitmentCombinedRoleRow[]
  employeeManagement?: boolean
  employmentLetters?: RecruitmentEmploymentLetterRow[]
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
  const selectedEmployeeLetters = selectedEmployeePost
    ? employmentLetters.filter(
        (letter) =>
          letter.postId === selectedEmployeePost.id ||
          (letter.employeeCode &&
            letter.employeeCode === selectedEmployeePost.employeeCode)
      )
    : []
  const hasAppointmentLetter = selectedEmployeeLetters.some(
    (letter) => letter.letterType === "appointment" && letter.fileAvailable
  )
  const hasExperienceLetter = selectedEmployeeLetters.some(
    (letter) => letter.letterType === "experience" && letter.fileAvailable
  )

  return (
    <>
      <Sheet
        onOpenChange={(open) => {
          if (!open) setEditingPost(null)
        }}
        open={editingPost !== null}
      >
 <SectionCard>
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
 <OperationalTable>
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
 </OperationalTable>
            </div>
          </CardContent>
 </SectionCard>

        {employeeManagement ? (
 <SectionCard>
            <CardHeader>
              <CardTitle>Employee Letter Register</CardTitle>
              <CardDescription>
                Offer, Appointment, And Experience Letters Stay With The
                Employee Even After The Approved Post Is Filled Again.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
 <OperationalTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee ID</TableHead>
                      <TableHead>Employee / Candidate</TableHead>
                      <TableHead>Letter</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Issued</TableHead>
                      <TableHead>Post</TableHead>
                      <TableHead className="text-right">File</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employmentLetters.length ? (
                      employmentLetters.map((letter) => (
                        <TableRow key={letter.id}>
                          <TableCell className="font-mono">
                            {letter.employeeCode ?? "Pending Joining"}
                          </TableCell>
                          <TableCell>{letter.employeeName}</TableCell>
                          <TableCell className="capitalize">
                            {letter.letterType}
                          </TableCell>
                          <TableCell className="font-mono">
                            {letter.referenceNumber}
                          </TableCell>
                          <TableCell>{letter.issuedOn}</TableCell>
                          <TableCell className="font-mono">
                            {letter.postCode ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {letter.fileAvailable ? (
                              <Button asChild size="sm" variant="outline">
                                <a
                                  href={`/hr/employment-letters/${letter.id}/download`}
                                >
                                  <Download data-icon="inline-start" />
                                  Download
                                </a>
                              </Button>
                            ) : (
                              <Badge variant="destructive">
                                Generation Incomplete
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          className="py-10 text-center text-muted-foreground"
                          colSpan={7}
                        >
                          No Employment Letters Have Been Generated.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
 </OperationalTable>
              </div>
            </CardContent>
 </SectionCard>
        ) : null}

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
            <SheetHeader>
              <SheetTitle>Edit Employee</SheetTitle>
              <SheetDescription>
                {selectedEmployeePost.postCode} ·{" "}
                {selectedEmployeePost.designation}
              </SheetDescription>
            </SheetHeader>
            <form
              action={assignEmployeeAction}
              className="grid gap-5 px-6 pb-2"
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
              <div className="grid gap-5">
                <SingleEmployeeAssignmentFields
                  allowIdentityCorrection
                  combinedRoles={combinedRoles}
                  initialPostId={selectedEmployeePost.id}
                  key={selectedEmployeePost.id}
                  posts={posts}
                  showTargetSelector={false}
                />
              </div>
              <SheetFooter className="px-0">
                <Button type="submit">Save Employee</Button>
              </SheetFooter>
            </form>
            <div className="grid gap-3 border-t px-6 py-5">
              <div>
                <p className="font-medium">Employment Letters</p>
                <p className="text-sm text-muted-foreground">
                  Generated PDFs Use The Employee Master Identity And Stay In
                  The Letter Register.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedEmployeeLetters
                  .filter((letter) => letter.fileAvailable)
                  .map((letter) => (
                    <Button asChild key={letter.id} size="sm" variant="outline">
                      <a href={`/hr/employment-letters/${letter.id}/download`}>
                        <Download data-icon="inline-start" />
                        {letter.letterType === "offer"
                          ? "Offer"
                          : letter.letterType === "appointment"
                            ? "Appointment"
                            : "Experience"}
                      </a>
                    </Button>
                  ))}
                {selectedEmployeePost.status === "Occupied" &&
                !hasAppointmentLetter ? (
                  <EmployeeLetterDialog
                    post={selectedEmployeePost}
                    type="appointment"
                  />
                ) : null}
                {selectedEmployeePost.status === "Resigned" &&
                !hasExperienceLetter ? (
                  <EmployeeLetterDialog
                    post={selectedEmployeePost}
                    type="experience"
                  />
                ) : null}
              </div>
            </div>
          </SheetContent>
        ) : null}
      </Sheet>
    </>
  )
}
