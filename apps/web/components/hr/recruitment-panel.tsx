import Link from "next/link"

import {
  nextRecruitmentTemplateCode,
  type RecruitmentCandidateEventRow,
  type RecruitmentCandidateRow,
  type RecruitmentCombinedRoleRow,
  type RecruitmentInterviewRow,
  type RecruitmentJobRow,
  type RecruitmentMasterSnapshot,
  type RecruitmentPostRow,
  type RecruitmentTemplateRow,
} from "@workspace/db"
import { listRecruitableApprovedPosts } from "@workspace/db/recruitment-domain"
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
  assignEmployeeAction,
  createJobAction,
  logCandidateEventAction,
  saveCandidateAction,
  saveMasterAction,
  savePostAction,
  saveTemplateAction,
  scheduleInterviewAction,
} from "@/app/hr/actions"
import { ApprovedPostFields } from "@/components/hr/approved-post-fields"
import { ApprovedPostsTable } from "@/components/hr/approved-posts-table"
import {
  CandidateAssignmentPanel,
  CandidatesTable,
} from "@/components/hr/candidate-assignment-panel"
import { CombinedRoleForm } from "@/components/hr/combined-role-form"
import { CombinedRolesTable as EditableCombinedRolesTable } from "@/components/hr/combined-roles-table"
import { ConversationLogsTable } from "@/components/hr/conversation-logs-table"
import { EmployeeAssignmentUpload } from "@/components/hr/employee-assignment-upload"
import { EmployeeStatusFields } from "@/components/hr/employee-status-fields"
import { InterviewOutcomeForm } from "@/components/hr/interview-outcome-form"
import { JobTemplatesTable } from "@/components/hr/job-templates-table"
import { MasterTables } from "@/components/hr/master-tables"
import { RecruitablePostFields } from "@/components/hr/recruitable-post-fields"

type RecruitmentPanelProps = {
  canManageEmployees: boolean
  canWrite: boolean
  candidateEvents: RecruitmentCandidateEventRow[]
  candidates: RecruitmentCandidateRow[]
  combinedRoles: RecruitmentCombinedRoleRow[]
  interviews: RecruitmentInterviewRow[]
  jobs: RecruitmentJobRow[]
  masters: RecruitmentMasterSnapshot
  panelId: string
  posts: RecruitmentPostRow[]
  selectedJobId?: string
  selectedTemplateCode?: string
  templates: RecruitmentTemplateRow[]
}

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
      <MasterTables masters={masters} />
    </>
  )
}

function TemplatePanel({
  canWrite,
  masters,
  selectedTemplateCode,
  templates,
}: Pick<
  RecruitmentPanelProps,
  "canWrite" | "masters" | "selectedTemplateCode" | "templates"
>) {
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
      <JobTemplatesTable
        canWrite={canWrite}
        initialTemplateCode={selectedTemplateCode}
        masters={masters}
        templates={templates}
      />
    </>
  )
}

function ApprovedPostPanel({
  canWrite,
  combinedRoles,
  jobs,
  masters,
  posts,
  templates,
}: Pick<
  RecruitmentPanelProps,
  "canWrite" | "combinedRoles" | "jobs" | "masters" | "posts" | "templates"
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
        jobs={jobs}
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
            <EmployeeStatusFields />
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
  const recruitablePosts = listRecruitableApprovedPosts(posts, jobs)
  const recruitablePostOptions = recruitablePosts.map((post) => ({
    combinedRoleId: post.combinedRoleId,
    combinedRoleName: post.combinedRoleName,
    combinedVacancyCode: post.combinedVacancyCode,
    department: post.department,
    designation: post.designation,
    id: post.id,
    postCode: post.postCode,
    status: post.status,
    vacancyCode: post.vacancyCode,
  }))

  return (
    <>
      {canWrite ? (
        <PanelForm
          action={createJobAction}
          description="Create one active recruitment opening from a vacant or resigned approved post."
          panelId="jobsPanel"
          title="Create job post"
        >
          <RecruitablePostFields posts={recruitablePostOptions} />
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
                <TableHead className="text-right">Workspace</TableHead>
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
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/hr/jobs/${row.id}`}>Open job</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRow columns={8} label="No job posts found." />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
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
            <Field>
              <FieldLabel htmlFor="candidate-resume">Resume (PDF)</FieldLabel>
              <Input
                accept="application/pdf,.pdf"
                id="candidate-resume"
                name="resume"
                type="file"
              />
              <p className="text-xs text-muted-foreground">
                Optional. Maximum 10 MB.
              </p>
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
            <Field>
              <FieldLabel htmlFor="event-type">Conversation type</FieldLabel>
              <NativeSelect
                className="w-full"
                id="event-type"
                name="event_type"
                required
              >
                {[
                  "Phone Call",
                  "WhatsApp",
                  "Email",
                  "In Person",
                  "Interview Follow-up",
                  "Offer / Joining",
                  "Other",
                ].map((option) => (
                  <NativeSelectOption key={option} value={option}>
                    {option}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="event-title">Conversation field</FieldLabel>
              <NativeSelect
                className="w-full"
                id="event-title"
                name="title"
                required
              >
                {[
                  "Initial Contact",
                  "Follow-up",
                  "Interview Scheduling",
                  "Document Request",
                  "Salary Discussion",
                  "Offer Discussion",
                  "Joining Confirmation",
                  "Not Interested",
                  "Other",
                ].map((option) => (
                  <NativeSelectOption key={option} value={option}>
                    {option}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
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
  selectedJobId,
}: Pick<
  RecruitmentPanelProps,
  "canWrite" | "candidates" | "jobs" | "selectedJobId"
>) {
  return (
    <CandidateAssignmentPanel
      canWrite={canWrite}
      candidates={candidates}
      initialJobId={selectedJobId}
      jobs={jobs}
    />
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
                {interviews
                  .filter((row) => row.nextRound !== null)
                  .map((row) => (
                    <NativeSelectOption
                      key={row.applicationId}
                      value={row.applicationId}
                    >
                      {row.candidateName} · {row.jobTitle} · {row.nextRound}
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
            <Button
              className="md:col-span-2 xl:col-span-3"
              disabled={!interviews.some((row) => row.nextRound !== null)}
              type="submit"
            >
              Schedule interview
            </Button>
          </PanelForm>
          <Card>
            <CardHeader>
              <CardTitle>Interview outcome</CardTitle>
              <CardDescription>
                The required round is locked. Complete every preset question to
                save a unified assessment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InterviewOutcomeForm
                applications={interviews.map((row) => ({
                  candidateName: `${row.candidateName} · ${row.jobTitle}`,
                  id: row.applicationId,
                  scoreableRound: row.scoreableRound,
                }))}
                panelId="interviewsPanel"
              />
            </CardContent>
          </Card>
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
                <TableHead>Required round</TableHead>
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
                    <TableCell>
                      {row.nextRound ??
                        (row.status === "Approved"
                          ? "All rounds approved"
                          : "Application closed")}
                    </TableCell>
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
          selectedTemplateCode={props.selectedTemplateCode}
          templates={props.templates}
        />
      )
    case "approvedPostPanel":
      return (
        <ApprovedPostPanel
          canWrite={props.canWrite}
          combinedRoles={props.combinedRoles}
          jobs={props.jobs}
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
          selectedJobId={props.selectedJobId}
        />
      )
    case "interviewsPanel":
      return (
        <InterviewsPanel
          canWrite={props.canWrite}
          interviews={props.interviews}
        />
      )
    case "conversationLogsPanel":
      return <ConversationLogsTable events={props.candidateEvents} />
    default:
      return <MastersPanel canWrite={props.canWrite} masters={props.masters} />
  }
}
