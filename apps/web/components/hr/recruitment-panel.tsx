import {
  nextRecruitmentTemplateCode,
  type RecruitmentCandidateRow,
  type RecruitmentCombinedRoleRow,
  type RecruitmentInterviewRow,
  type RecruitmentJobRow,
  type RecruitmentMasterSnapshot,
  type RecruitmentPostRow,
  type RecruitmentTemplateRow,
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
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import {
  assignCandidateAction,
  assignEmployeeAction,
  createJobAction,
  logCandidateEventAction,
  recordInterviewAction,
  saveCandidateAction,
  saveMasterAction,
  savePostAction,
  saveTemplateAction,
  scheduleInterviewAction,
} from "@/app/hr/actions"
import { ApprovedPostFields } from "@/components/hr/approved-post-fields"
import { ApprovedPostsTable } from "@/components/hr/approved-posts-table"
import { CombinedRoleForm } from "@/components/hr/combined-role-form"
import { CombinedRolesTable as EditableCombinedRolesTable } from "@/components/hr/combined-roles-table"
import { EmployeeAssignmentUpload } from "@/components/hr/employee-assignment-upload"

type RecruitmentPanelProps = {
  canManageEmployees: boolean
  canWrite: boolean
  candidates: RecruitmentCandidateRow[]
  combinedRoles: RecruitmentCombinedRoleRow[]
  interviews: RecruitmentInterviewRow[]
  jobs: RecruitmentJobRow[]
  masters: RecruitmentMasterSnapshot
  panelId: string
  posts: RecruitmentPostRow[]
  templates: RecruitmentTemplateRow[]
}

const rounds = [
  "Screening Round",
  "Department Round",
  "Management Round",
  "Final HR Round",
] as const

function PanelForm({
  action,
  children,
  description,
  panelId,
  title,
}: {
  action: (formData: FormData) => Promise<void>
  children: React.ReactNode
  description: string
  panelId: string
  title: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action}>
          <input name="panel" type="hidden" value={panelId} />
          <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {children}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function TextField({
  defaultValue,
  label,
  name,
  readOnly,
  required,
  type = "text",
}: {
  defaultValue?: string
  label: string
  name: string
  readOnly?: boolean
  required?: boolean
  type?: React.HTMLInputTypeAttribute
}) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        defaultValue={defaultValue}
        id={name}
        name={name}
        readOnly={readOnly}
        required={required}
        type={type}
      />
    </Field>
  )
}

function EmptyRow({ columns, label }: { columns: number; label: string }) {
  return (
    <TableRow>
      <TableCell
        className="py-10 text-center text-muted-foreground"
        colSpan={columns}
      >
        {label}
      </TableCell>
    </TableRow>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "Open" || status === "Vacant" || status === "Occupied"
      ? "default"
      : status === "Resigned"
        ? "destructive"
        : status === "Appointed"
          ? "secondary"
          : "outline"
  return <Badge variant={variant}>{status}</Badge>
}

function MastersPanel({
  canWrite,
  masters,
}: Pick<RecruitmentPanelProps, "canWrite" | "masters">) {
  return (
    <>
      {canWrite ? (
        <PanelForm
          action={saveMasterAction}
          description="Codes are the stable identity used by templates and approved posts."
          panelId="mastersPanel"
          title="Add or update a master"
        >
          <Field>
            <FieldLabel htmlFor="master-kind">Master type</FieldLabel>
            <NativeSelect className="w-full" id="master-kind" name="kind">
              <NativeSelectOption value="department">
                Department
              </NativeSelectOption>
              <NativeSelectOption value="designation">
                Designation
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          <TextField label="Code" name="code" required />
          <TextField label="Name" name="name" required />
          <Button className="md:col-span-2 xl:col-span-3" type="submit">
            Save master
          </Button>
        </PanelForm>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        {[
          ["Departments", masters.departments],
          ["Designations", masters.designations],
        ].map(([title, rows]) => (
          <Card key={title as string}>
            <CardHeader>
              <CardTitle>{title as string}</CardTitle>
              <CardDescription>
                {(rows as typeof masters.departments).length} active records
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows as typeof masters.departments).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono">{row.code}</TableCell>
                      <TableCell>{row.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}

function TemplatePanel({
  canWrite,
  masters,
  templates,
}: Pick<RecruitmentPanelProps, "canWrite" | "masters" | "templates">) {
  const templateCode = nextRecruitmentTemplateCode(
    templates.map((template) => template.templateCode)
  )

  return (
    <>
      {canWrite ? (
        <PanelForm
          action={saveTemplateAction}
          description="Create the reusable qualification and salary profile used by recruitment openings."
          panelId="postMasterPanel"
          title="Job requirement template"
        >
          <TextField
            defaultValue={templateCode}
            label="Template code (auto-generated)"
            name="template_code"
            readOnly
            required
          />
          <TextField label="Template name" name="name" required />
          <Field>
            <FieldLabel htmlFor="template-department">Department</FieldLabel>
            <NativeSelect
              className="w-full"
              id="template-department"
              name="department_code"
              required
            >
              <NativeSelectOption value="">
                Select department
              </NativeSelectOption>
              {masters.departments.map((row) => (
                <NativeSelectOption key={row.id} value={row.code}>
                  {row.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="template-designation">Designation</FieldLabel>
            <NativeSelect
              className="w-full"
              id="template-designation"
              name="designation_code"
              required
            >
              <NativeSelectOption value="">
                Select designation
              </NativeSelectOption>
              {masters.designations.map((row) => (
                <NativeSelectOption key={row.id} value={row.code}>
                  {row.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <TextField label="Gender" name="gender" />
          <TextField label="Education" name="education" />
          <TextField
            label="Experience requirement"
            name="experience_requirement"
          />
          <TextField
            label="Minimum salary"
            name="minimum_salary"
            type="number"
          />
          <TextField
            label="Maximum salary"
            name="maximum_salary"
            type="number"
          />
          <Field className="md:col-span-2 xl:col-span-3">
            <FieldLabel htmlFor="template-responsibilities">
              Role responsibilities
            </FieldLabel>
            <Textarea
              id="template-responsibilities"
              name="role_responsibilities"
            />
          </Field>
          <Button className="md:col-span-2 xl:col-span-3" type="submit">
            Save template
          </Button>
        </PanelForm>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Job templates</CardTitle>
          <CardDescription>
            {templates.length} reusable profiles
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Education</TableHead>
                <TableHead>Experience</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.length ? (
                templates.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono">
                      {row.templateCode}
                    </TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.department ?? "Combined role"}</TableCell>
                    <TableCell>{row.designation}</TableCell>
                    <TableCell>{row.education ?? "—"}</TableCell>
                    <TableCell>{row.experienceRequirement ?? "—"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRow columns={6} label="No job templates found." />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

function ApprovedPostPanel({
  canWrite,
  combinedRoles,
  masters,
  posts,
  templates,
}: Pick<
  RecruitmentPanelProps,
  "canWrite" | "combinedRoles" | "masters" | "posts" | "templates"
>) {
  const activeCombinedPostCodes = new Set(
    combinedRoles
      .filter((role) => role.status === "Active")
      .flatMap((role) => role.postCodes)
  )
  const availableCombinedPosts = posts.filter(
    (post) =>
      post.status !== "Inactive" && !activeCombinedPostCodes.has(post.postCode)
  )

  return (
    <>
      {canWrite ? (
        <PanelForm
          action={savePostAction}
          description="Register a sanctioned post and connect it to its requirement template."
          panelId="approvedPostPanel"
          title="Approved post form"
        >
          <ApprovedPostFields
            departments={masters.departments}
            designations={masters.designations}
            existingPostCodes={posts.map((post) => post.postCode)}
            templates={templates.map(({ id, name, templateCode }) => ({
              id,
              name,
              templateCode,
            }))}
          />
          <Button className="md:col-span-2 xl:col-span-3" type="submit">
            Save approved post
          </Button>
        </PanelForm>
      ) : null}
      {canWrite ? (
        <CombinedRoleForm
          existingVacancyCodes={combinedRoles.flatMap((role) =>
            role.vacancyCode ? [role.vacancyCode] : []
          )}
          posts={availableCombinedPosts.map(
            ({ department, designation, id, postCode, status }) => ({
              department,
              designation,
              id,
              postCode,
              status,
            })
          )}
        />
      ) : null}
      <EditableCombinedRolesTable
        canWrite={canWrite}
        combinedRoles={combinedRoles}
        posts={posts}
      />
      <ApprovedPostsTable
        canWrite={canWrite}
        posts={posts}
        templates={templates}
      />
    </>
  )
}

function EmployeePanel({
  canManageEmployees,
  combinedRoles,
  posts,
}: Pick<
  RecruitmentPanelProps,
  "canManageEmployees" | "combinedRoles" | "posts"
>) {
  const activeCombinedRoles = combinedRoles.filter(
    (combinedRole) => combinedRole.status === "Active"
  )
  const postByCode = new Map(posts.map((post) => [post.postCode, post]))
  const combinedAssignmentTargets = activeCombinedRoles.flatMap(
    (combinedRole) => {
      const targetPost = postByCode.get(
        combinedRole.primaryPostCode ?? combinedRole.postCodes[0] ?? ""
      )
      return targetPost ? [{ combinedRole, targetPost }] : []
    }
  )
  const combinedPostCodes = new Set(
    combinedAssignmentTargets.flatMap(
      ({ combinedRole }) => combinedRole.postCodes
    )
  )
  const standalonePosts = posts.filter(
    (post) => !combinedPostCodes.has(post.postCode)
  )

  return (
    <>
      {canManageEmployees ? (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Bulk employee assignment</CardTitle>
              <CardDescription>
                Start with the Combined Jobs sheet and upload it. Then download
                a fresh template and complete Individual Posts. Empty rows are
                ignored, and each complete file is checked before any post is
                changed. Use Appointed, Joined, Resigned, or Removed in the
                Employment Event column.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-end">
              <Button asChild variant="outline">
                <a href="/hr/employee-assignments/template">
                  Download Excel template
                </a>
              </Button>
              <EmployeeAssignmentUpload />
            </CardContent>
          </Card>
          <PanelForm
            action={assignEmployeeAction}
            description="Assign one employee to an individual post or to every Approved Post in a combined job. Appointed becomes Occupied only when Joined is selected."
            panelId="employeeMasterPanel"
            title="Single employee assignment and status"
          >
            <Field>
              <FieldLabel htmlFor="employee-post">
                Approved post or combined job
              </FieldLabel>
              <NativeSelect
                className="w-full"
                id="employee-post"
                name="post_id"
                required
              >
                <NativeSelectOption value="">
                  Select post or combined job
                </NativeSelectOption>
                {combinedAssignmentTargets.length ? (
                  <NativeSelectOptGroup label="Combined jobs">
                    {combinedAssignmentTargets.map(
                      ({ combinedRole, targetPost }) => (
                        <NativeSelectOption
                          key={combinedRole.id}
                          value={targetPost.id}
                        >
                          {combinedRole.vacancyCode} · {combinedRole.name} ·{" "}
                          {combinedRole.postCodes.length} posts
                        </NativeSelectOption>
                      )
                    )}
                  </NativeSelectOptGroup>
                ) : null}
                {standalonePosts.length ? (
                  <NativeSelectOptGroup label="Individual approved posts">
                    {standalonePosts.map((row) => (
                      <NativeSelectOption key={row.id} value={row.id}>
                        {row.postCode} · {row.designation}
                      </NativeSelectOption>
                    ))}
                  </NativeSelectOptGroup>
                ) : null}
              </NativeSelect>
            </Field>
            <TextField label="Employee name" name="employee_name" />
            <TextField label="Employee code" name="employee_code" />
            <Field>
              <FieldLabel htmlFor="employee-event">Employment event</FieldLabel>
              <NativeSelect
                className="w-full"
                defaultValue="Appointed"
                id="employee-event"
                name="employee_event"
                required
              >
                <NativeSelectOption value="Appointed">
                  Appointed — not joined
                </NativeSelectOption>
                <NativeSelectOption value="Joined">
                  Joined — becomes Occupied
                </NativeSelectOption>
                <NativeSelectOption value="Resigned">
                  Resigned
                </NativeSelectOption>
                <NativeSelectOption value="Removed">
                  Remove assignment — becomes Vacant
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <Button className="md:col-span-2 xl:col-span-3" type="submit">
              Update employee status
            </Button>
          </PanelForm>
        </div>
      ) : null}
      <ApprovedPostsTable posts={posts} />
    </>
  )
}

function JobsPanel({
  canWrite,
  jobs,
  posts,
}: Pick<RecruitmentPanelProps, "canWrite" | "jobs" | "posts">) {
  return (
    <>
      {canWrite ? (
        <PanelForm
          action={createJobAction}
          description="Create one active recruitment opening from a vacant approved post."
          panelId="jobsPanel"
          title="Create job post"
        >
          <Field>
            <FieldLabel htmlFor="job-post">
              Recruitable approved post
            </FieldLabel>
            <NativeSelect
              className="w-full"
              id="job-post"
              name="post_id"
              required
            >
              <NativeSelectOption value="">Select post</NativeSelectOption>
              {posts
                .filter(
                  (row) => row.status === "Vacant" || row.status === "Resigned"
                )
                .map((row) => (
                  <NativeSelectOption key={row.id} value={row.id}>
                    {row.postCode} · {row.designation}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </Field>
          <TextField label="Target date" name="target_date" type="date" />
          <Button className="md:col-span-2 xl:col-span-3" type="submit">
            Create recruitment opening
          </Button>
        </PanelForm>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Job posts</CardTitle>
          <CardDescription>{jobs.length} recruitment openings</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Vacancy</TableHead>
                <TableHead>Post</TableHead>
                <TableHead>Posted</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Applicants</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length ? (
                jobs.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {row.title}
                      <div className="font-mono text-xs text-muted-foreground">
                        {row.jobNumber}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">
                      {row.vacancyCode}
                    </TableCell>
                    <TableCell className="font-mono">
                      {row.postCode ?? "—"}
                    </TableCell>
                    <TableCell>{row.postDate}</TableCell>
                    <TableCell>{row.targetDate ?? "—"}</TableCell>
                    <TableCell>{row.applicantCount}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRow columns={7} label="No job posts found." />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

function CandidatesTable({
  candidates,
}: {
  candidates: RecruitmentCandidateRow[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Candidates</CardTitle>
        <CardDescription>
          {candidates.length} candidate profiles
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Departments</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Applications</TableHead>
              <TableHead>Logs</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.length ? (
              candidates.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.name}
                    <div className="text-xs text-muted-foreground">
                      {row.email ?? "No email"}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">{row.phone}</TableCell>
                  <TableCell>{row.departments.join(", ") || "—"}</TableCell>
                  <TableCell>{row.currentCompany ?? "—"}</TableCell>
                  <TableCell>{row.applicationCount}</TableCell>
                  <TableCell>{row.eventCount}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <EmptyRow columns={7} label="No candidates found." />
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function LogCandidatePanel({
  canWrite,
  candidates,
  masters,
}: Pick<RecruitmentPanelProps, "canWrite" | "candidates" | "masters">) {
  return (
    <>
      {canWrite ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <PanelForm
            action={saveCandidateAction}
            description="Phone number is the duplicate-safe candidate identity."
            panelId="candidatesPanel"
            title="Log candidate"
          >
            <TextField label="Candidate name" name="name" required />
            <TextField label="Phone" name="phone" required />
            <TextField label="Email" name="email" type="email" />
            <TextField label="Current company" name="current_company" />
            <TextField label="Experience" name="experience" />
            <TextField label="Source" name="source" />
            <Field>
              <FieldLabel htmlFor="candidate-department">
                Preferred department
              </FieldLabel>
              <NativeSelect
                className="w-full"
                id="candidate-department"
                name="department_code"
              >
                <NativeSelectOption value="">Not selected</NativeSelectOption>
                {masters.departments.map((row) => (
                  <NativeSelectOption key={row.id} value={row.code}>
                    {row.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field className="md:col-span-2 xl:col-span-3">
              <FieldLabel htmlFor="candidate-notes">Initial notes</FieldLabel>
              <Textarea id="candidate-notes" name="notes" />
            </Field>
            <Button className="md:col-span-2 xl:col-span-3" type="submit">
              Save candidate
            </Button>
          </PanelForm>
          <PanelForm
            action={logCandidateEventAction}
            description="Append an immutable conversation or follow-up to the candidate timeline."
            panelId="candidatesPanel"
            title="Log conversation"
          >
            <Field>
              <FieldLabel htmlFor="event-candidate">Candidate</FieldLabel>
              <NativeSelect
                className="w-full"
                id="event-candidate"
                name="candidate_id"
                required
              >
                <NativeSelectOption value="">
                  Select candidate
                </NativeSelectOption>
                {candidates.map((row) => (
                  <NativeSelectOption key={row.id} value={row.id}>
                    {row.name} · {row.phone}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <TextField label="Event type" name="event_type" />
            <TextField label="Title" name="title" required />
            <Field className="md:col-span-2 xl:col-span-3">
              <FieldLabel htmlFor="event-notes">Notes</FieldLabel>
              <Textarea id="event-notes" name="notes" />
            </Field>
            <Button className="md:col-span-2 xl:col-span-3" type="submit">
              Add to timeline
            </Button>
          </PanelForm>
        </div>
      ) : null}
      <CandidatesTable candidates={candidates} />
    </>
  )
}

function CandidateSearchPanel({
  canWrite,
  candidates,
  jobs,
}: Pick<RecruitmentPanelProps, "canWrite" | "candidates" | "jobs">) {
  return (
    <>
      {canWrite ? (
        <PanelForm
          action={assignCandidateAction}
          description="Create one candidate application for an open recruitment job."
          panelId="candidateSearchPanel"
          title="Assign candidate"
        >
          <Field>
            <FieldLabel htmlFor="assign-candidate">Candidate</FieldLabel>
            <NativeSelect
              className="w-full"
              id="assign-candidate"
              name="candidate_id"
              required
            >
              <NativeSelectOption value="">Select candidate</NativeSelectOption>
              {candidates.map((row) => (
                <NativeSelectOption key={row.id} value={row.id}>
                  {row.name} · {row.phone}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="assign-job">Open job</FieldLabel>
            <NativeSelect
              className="w-full"
              id="assign-job"
              name="job_id"
              required
            >
              <NativeSelectOption value="">Select job</NativeSelectOption>
              {jobs
                .filter((row) => row.status === "Open")
                .map((row) => (
                  <NativeSelectOption key={row.id} value={row.id}>
                    {row.vacancyCode} · {row.title}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </Field>
          <Button className="md:col-span-2 xl:col-span-3" type="submit">
            Assign to job
          </Button>
        </PanelForm>
      ) : null}
      <CandidatesTable candidates={candidates} />
    </>
  )
}

function InterviewsPanel({
  canWrite,
  interviews,
}: Pick<RecruitmentPanelProps, "canWrite" | "interviews">) {
  return (
    <>
      {canWrite ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <PanelForm
            action={scheduleInterviewAction}
            description="Plan the next interview round for a candidate application."
            panelId="interviewsPanel"
            title="Schedule interview"
          >
            <Field>
              <FieldLabel htmlFor="schedule-application">
                Application
              </FieldLabel>
              <NativeSelect
                className="w-full"
                id="schedule-application"
                name="application_id"
                required
              >
                <NativeSelectOption value="">
                  Select application
                </NativeSelectOption>
                {interviews.map((row) => (
                  <NativeSelectOption
                    key={row.applicationId}
                    value={row.applicationId}
                  >
                    {row.candidateName} · {row.jobTitle}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <TextField
              label="Interview date and time"
              name="interview_at"
              required
              type="datetime-local"
            />
            <Field>
              <FieldLabel htmlFor="schedule-round">Round</FieldLabel>
              <NativeSelect
                className="w-full"
                id="schedule-round"
                name="planned_round"
                required
              >
                {rounds.map((round) => (
                  <NativeSelectOption key={round} value={round}>
                    {round}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Button className="md:col-span-2 xl:col-span-3" type="submit">
              Schedule interview
            </Button>
          </PanelForm>
          <PanelForm
            action={recordInterviewAction}
            description="Record the round decision. Final approval requires a joining date."
            panelId="interviewsPanel"
            title="Interview outcome"
          >
            <Field>
              <FieldLabel htmlFor="outcome-application">Application</FieldLabel>
              <NativeSelect
                className="w-full"
                id="outcome-application"
                name="application_id"
                required
              >
                <NativeSelectOption value="">
                  Select application
                </NativeSelectOption>
                {interviews.map((row) => (
                  <NativeSelectOption
                    key={row.applicationId}
                    value={row.applicationId}
                  >
                    {row.candidateName} · {row.jobTitle}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="outcome-round">Round</FieldLabel>
              <NativeSelect
                className="w-full"
                id="outcome-round"
                name="round_name"
                required
              >
                {rounds.map((round) => (
                  <NativeSelectOption key={round} value={round}>
                    {round}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="outcome-status">Decision</FieldLabel>
              <NativeSelect
                className="w-full"
                id="outcome-status"
                name="status"
                required
              >
                <NativeSelectOption value="Approved">
                  Approved
                </NativeSelectOption>
                <NativeSelectOption value="Rejected">
                  Rejected
                </NativeSelectOption>
                <NativeSelectOption value="Hold">Hold</NativeSelectOption>
              </NativeSelect>
            </Field>
            <TextField label="Interviewer" name="interviewer_name" />
            <TextField label="Overall score / 10" name="score" type="number" />
            <TextField label="Joining date" name="joining_date" type="date" />
            <Field className="md:col-span-2 xl:col-span-3">
              <FieldLabel htmlFor="outcome-comments">Comments</FieldLabel>
              <Textarea id="outcome-comments" name="comments" />
            </Field>
            <Button className="md:col-span-2 xl:col-span-3" type="submit">
              Save outcome
            </Button>
          </PanelForm>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Interview workspace</CardTitle>
          <CardDescription>
            {interviews.length} candidate applications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Planned round</TableHead>
                <TableHead>Latest outcome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interviews.length ? (
                interviews.map((row) => (
                  <TableRow key={row.applicationId}>
                    <TableCell>{row.candidateName}</TableCell>
                    <TableCell>{row.jobTitle}</TableCell>
                    <TableCell>
                      {row.interviewAt
                        ? new Date(row.interviewAt).toLocaleString("en-IN")
                        : "Not scheduled"}
                    </TableCell>
                    <TableCell>{row.plannedRound ?? "—"}</TableCell>
                    <TableCell>
                      {row.latestRound
                        ? `${row.latestRound} · ${row.latestStatus}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>{row.joiningDate ?? "—"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRow
                  columns={7}
                  label="No candidate applications found."
                />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

export function RecruitmentPanel(props: RecruitmentPanelProps) {
  switch (props.panelId) {
    case "postMasterPanel":
      return (
        <TemplatePanel
          canWrite={props.canWrite}
          masters={props.masters}
          templates={props.templates}
        />
      )
    case "approvedPostPanel":
      return (
        <ApprovedPostPanel
          canWrite={props.canWrite}
          combinedRoles={props.combinedRoles}
          masters={props.masters}
          posts={props.posts}
          templates={props.templates}
        />
      )
    case "employeeMasterPanel":
      return (
        <EmployeePanel
          canManageEmployees={props.canManageEmployees}
          combinedRoles={props.combinedRoles}
          posts={props.posts}
        />
      )
    case "jobsPanel":
      return (
        <JobsPanel
          canWrite={props.canWrite}
          jobs={props.jobs}
          posts={props.posts}
        />
      )
    case "candidatesPanel":
      return (
        <LogCandidatePanel
          canWrite={props.canWrite}
          candidates={props.candidates}
          masters={props.masters}
        />
      )
    case "candidateSearchPanel":
      return (
        <CandidateSearchPanel
          canWrite={props.canWrite}
          candidates={props.candidates}
          jobs={props.jobs}
        />
      )
    case "interviewsPanel":
      return (
        <InterviewsPanel
          canWrite={props.canWrite}
          interviews={props.interviews}
        />
      )
    default:
      return <MastersPanel canWrite={props.canWrite} masters={props.masters} />
  }
}
