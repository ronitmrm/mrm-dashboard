import Link from "next/link"

import {
  nextRecruitmentTemplateCode,
  type RecruitmentCandidateEventRow,
  type RecruitmentCandidateRow,
  type RecruitmentCombinedRoleRow,
  type RecruitmentEmploymentLetterRow,
  type RecruitmentInterviewRow,
  type RecruitmentInterviewRecordRow,
  type RecruitmentJobRow,
  type RecruitmentMasterSnapshot,
  type RecruitmentPostRow,
  type RecruitmentTemplateRow,
} from "@workspace/db"
import { listRecruitableApprovedPosts } from "@workspace/db/recruitment-domain"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
 SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
 OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import {
  createJobAction,
  saveCandidateAction,
  saveMasterAction,
  savePostAction,
  saveTemplateAction,
} from "@/app/hr/actions"
import {
  importApprovedPostsCsvAction,
  importCandidatesCsvAction,
  importCombinedRolesCsvAction,
  importEmployeeAssignmentsCsvAction,
  importJobTemplatesCsvAction,
  importRecruitmentMastersCsvAction,
} from "@/app/hr/master-transfer-actions"
import { ApprovedPostFields } from "@/components/hr/approved-post-fields"
import { ApprovedPostsTable } from "@/components/hr/approved-posts-table"
import {
  CandidateAssignmentPanel,
  CandidatesTable,
} from "@/components/hr/candidate-assignment-panel"
import { CombinedRoleForm } from "@/components/hr/combined-role-form"
import { CombinedRolesTable as EditableCombinedRolesTable } from "@/components/hr/combined-roles-table"
import { CompanyWideMasterScope } from "@/components/company-wide-master-scope"
import { DataDownloadButton } from "@/components/data-download-button"
import { ConversationLogsTable } from "@/components/hr/conversation-logs-table"
import { EmployeeAssignmentUpload } from "@/components/hr/employee-assignment-upload"
import {
  InterviewResultsWorkspace,
  InterviewScheduleBoard,
} from "@/components/hr/interview-workspace"
import { InterviewScheduleForm } from "@/components/hr/interview-schedule-form"
import { JobTemplatesTable } from "@/components/hr/job-templates-table"
import { MasterDataViewTabs } from "@/components/master-data-view-tabs"
import {
  MasterDataCsvDownloadButton,
  MasterDataCsvImportButton,
} from "@/components/master-data-csv-import-button"
import { MasterTables } from "@/components/hr/master-tables"
import { RecruitablePostFields } from "@/components/hr/recruitable-post-fields"
import { TemplateScopeFields } from "@/components/hr/template-scope-fields"
import { candidateSourceOptions } from "@/lib/recruitment-candidate-sources"
import { recruitmentInterviewerOptions } from "@/lib/shared-employee-master"
import {
  recruitmentMasterHref,
  type RecruitmentMasterKind,
} from "@/lib/recruitment-master-navigation"

type RecruitmentPanelProps = {
  canManageEmployees: boolean
  canWrite: boolean
  candidateEvents: RecruitmentCandidateEventRow[]
  candidates: RecruitmentCandidateRow[]
  combinedRoles: RecruitmentCombinedRoleRow[]
  employmentLetters: RecruitmentEmploymentLetterRow[]
  interviews: RecruitmentInterviewRow[]
  interviewRecords: RecruitmentInterviewRecordRow[]
  jobs: RecruitmentJobRow[]
  masters: RecruitmentMasterSnapshot
  masterView?: "dataEntry" | "masterTables"
  masterKind?: RecruitmentMasterKind
  panelId: string
  posts: RecruitmentPostRow[]
  returnJobId?: string
  selectedAppointmentApplicationId?: string
  selectedJobId?: string
  selectedTemplateCode?: string
  templates: RecruitmentTemplateRow[]
}

function PanelForm({
  action,
  children,
  description,
  panelId,
  masterView,
  title,
}: {
  action: (formData: FormData) => Promise<void>
  children: React.ReactNode
  description: string
  panelId: string
  masterView?: "dataEntry" | "masterTables"
  title: string
}) {
  return (
 <SectionCard>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action}>
          <input name="panel" type="hidden" value={panelId} />
          {masterView ? (
            <input name="master_view" type="hidden" value={masterView} />
          ) : null}
          <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {children}
          </FieldGroup>
        </form>
      </CardContent>
 </SectionCard>
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

function MastersPanel({
  canWrite,
  masterKind = "department",
  masterView,
  masters,
}: Pick<
  RecruitmentPanelProps,
  "canWrite" | "masterKind" | "masterView" | "masters"
>) {
  const activeMasterKind =
    masterKind === "designation" ? "designation" : "department"
  const activeView = masterView ?? "dataEntry"
  const showDataEntry = activeView === "dataEntry"
  const showMasterTables = activeView === "masterTables"
  return (
    <>
      <MasterDataViewTabs
        activeView={activeView}
        allMastersHref="/?tab=dataEntryTab"
        csvDownloadAction={
          <MasterDataCsvDownloadButton
            columns={["name"]}
            fileName={`${masterKind}-master-template.csv`}
          />
        }
        csvImportAction={
          canWrite ? (
            <MasterDataCsvImportButton
              action={importRecruitmentMastersCsvAction}
              fields={{ master_kind: masterKind }}
            />
          ) : null
        }
        dataEntryHref={recruitmentMasterHref("dataEntry", masterKind)}
        exportAction={
          <DataDownloadButton
            href={`/hr/masters/export.csv?kind=${masterKind}`}
            label="Download CSV"
          />
        }
        masterTablesHref={recruitmentMasterHref("masterTables", masterKind)}
      />
      {canWrite && showDataEntry ? (
        <PanelForm
          action={saveMasterAction}
          description="The Code Is Generated Automatically From The Department Or Designation Name."
          panelId="mastersPanel"
          masterView={activeView}
          title={`Add A ${activeMasterKind === "department" ? "Department" : "Designation"}`}
        >
          <CompanyWideMasterScope />
          <input name="kind" type="hidden" value={activeMasterKind} />
          <TextField label="Name" name="name" required />
          <Button className="md:col-span-2 xl:col-span-3" type="submit">
            Save Master
          </Button>
        </PanelForm>
      ) : null}
      {showMasterTables ? (
        <MasterTables
          canWrite={canWrite}
          kind={activeMasterKind}
          masterView={activeView}
          masters={masters}
        />
      ) : null}
    </>
  )
}

function TemplatePanel({
  canWrite,
  combinedRoles,
  masterView,
  masters,
  selectedTemplateCode,
  templates,
}: Pick<
  RecruitmentPanelProps,
  | "canWrite"
  | "combinedRoles"
  | "masterView"
  | "masters"
  | "selectedTemplateCode"
  | "templates"
>) {
  const templateCode = nextRecruitmentTemplateCode(
    templates.map((template) => template.templateCode)
  )
  const activeView = masterView ?? "dataEntry"
  const showDataEntry = activeView === "dataEntry"
  const showMasterTables = activeView === "masterTables"
  const templateParam = selectedTemplateCode
    ? `&template=${encodeURIComponent(selectedTemplateCode)}`
    : ""

  return (
    <>
      <MasterDataViewTabs
        activeView={activeView}
        allMastersHref="/?tab=dataEntryTab"
        csvDownloadAction={
          <MasterDataCsvDownloadButton
            columns={[
              "template_code",
              "name",
              "department_code",
              "designation_code",
              "combined_role_id",
              "education",
              "experience_requirement",
              "gender",
              "minimum_salary",
              "maximum_salary",
              "role_responsibilities",
            ]}
            fileName="job-template-master-template.csv"
          />
        }
        csvImportAction={
          canWrite ? (
            <MasterDataCsvImportButton action={importJobTemplatesCsvAction} />
          ) : null
        }
        dataEntryHref={`/hr?panel=postMasterPanel&masterView=dataEntry${templateParam}`}
        exportAction={
          <DataDownloadButton
            href="/hr/masters/export.csv?kind=job_template"
            label="Download CSV"
          />
        }
        masterTablesHref={`/hr?panel=postMasterPanel&masterView=masterTables${templateParam}`}
      />
      {canWrite && showDataEntry ? (
        <PanelForm
          action={saveTemplateAction}
          description="Create The Reusable Qualification And Salary Profile Used By Recruitment Openings."
          panelId="postMasterPanel"
          masterView={activeView}
          title="Job Requirement Template"
        >
          <CompanyWideMasterScope />
          <TextField
            defaultValue={templateCode}
            label="Template Code (Auto-Generated)"
            name="template_code"
            readOnly
            required
          />
          <TextField label="Template Name" name="name" required />
          <TemplateScopeFields
            combinedRoles={combinedRoles}
            masters={masters}
            prefix="template"
          />
          <TextField label="Gender" name="gender" />
          <TextField label="Education" name="education" />
          <TextField
            label="Experience Requirement"
            name="experience_requirement"
          />
          <TextField
            label="Minimum Salary"
            name="minimum_salary"
            type="number"
          />
          <TextField
            label="Maximum Salary"
            name="maximum_salary"
            type="number"
          />
          <Field className="md:col-span-2 xl:col-span-3">
            <FieldLabel htmlFor="template-responsibilities">
              Role Responsibilities
            </FieldLabel>
            <Textarea
              id="template-responsibilities"
              name="role_responsibilities"
            />
          </Field>
          <Button className="md:col-span-2 xl:col-span-3" type="submit">
            Save Template
          </Button>
        </PanelForm>
      ) : null}
      {showMasterTables ? (
        <JobTemplatesTable
          canWrite={canWrite}
          combinedRoles={combinedRoles}
          initialTemplateCode={selectedTemplateCode}
          masterView={activeView}
          masters={masters}
          templates={templates}
        />
      ) : null}
    </>
  )
}

function ApprovedPostPanel({
  canWrite,
  jobs,
  masters,
  masterView,
  posts,
  templates,
}: Pick<
  RecruitmentPanelProps,
  "canWrite" | "jobs" | "masters" | "masterView" | "posts" | "templates"
>) {
  const activeView = masterView ?? "dataEntry"
  const showDataEntry = activeView === "dataEntry"
  const showMasterTables = activeView === "masterTables"

  return (
    <>
      <MasterDataViewTabs
        activeView={activeView}
        allMastersHref="/?tab=dataEntryTab"
        csvDownloadAction={
          <MasterDataCsvDownloadButton
            columns={[
              "department_code",
              "designation_code",
              "requirement_template_code",
            ]}
            fileName="approved-posts-template.csv"
          />
        }
        csvImportAction={
          canWrite ? (
            <MasterDataCsvImportButton
              action={importApprovedPostsCsvAction}
              fields={{
                masterMain: "hr_masters",
                masterSub: "approved_posts",
                masterUnit: "universal",
              }}
            />
          ) : null
        }
        dataEntryHref="/hr?panel=approvedPostPanel&masterView=dataEntry"
        exportAction={<DataDownloadButton href="/hr/approved-posts/export" />}
        masterTablesHref="/hr?panel=approvedPostPanel&masterView=masterTables"
      />
      {canWrite && showDataEntry ? (
        <PanelForm
          action={savePostAction}
          description="Register A Sanctioned Post And Connect It To Its Requirement Template."
          masterView={activeView}
          panelId="approvedPostPanel"
          title="Approved Post Form"
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
            Save Approved Post
          </Button>
        </PanelForm>
      ) : null}
      {showMasterTables ? (
        <ApprovedPostsTable
          canWrite={canWrite}
          jobs={jobs}
          masterView={activeView}
          posts={posts}
          templates={templates.filter((template) => !template.combinedRoleId)}
        />
      ) : null}
    </>
  )
}

function CombinedRolePanel({
  canWrite,
  combinedRoles,
  masterView,
  posts,
  templates,
}: Pick<
  RecruitmentPanelProps,
  "canWrite" | "combinedRoles" | "masterView" | "posts" | "templates"
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
  const activeView = masterView ?? "dataEntry"
  const showDataEntry = activeView === "dataEntry"
  const showMasterTables = activeView === "masterTables"

  return (
    <>
      <MasterDataViewTabs
        activeView={activeView}
        csvDownloadAction={
          <MasterDataCsvDownloadButton
            columns={["combined_role_name", "post_codes", "primary_post_code"]}
            fileName="combined-approved-posts-template.csv"
          />
        }
        csvImportAction={
          canWrite ? (
            <MasterDataCsvImportButton
              action={importCombinedRolesCsvAction}
              fields={{
                masterMain: "hr_masters",
                masterSub: "combined_approved_posts",
                masterUnit: "universal",
              }}
            />
          ) : null
        }
        dataEntryHref="/hr?panel=combinedRolesPanel&masterView=dataEntry"
        masterTablesHref="/hr?panel=combinedRolesPanel&masterView=masterTables"
      />
      {canWrite && showDataEntry ? (
        <CombinedRoleForm
          existingVacancyCodes={combinedRoles.flatMap((role) =>
            role.vacancyCode ? [role.vacancyCode] : []
          )}
          masterView={activeView}
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
      {showMasterTables ? (
        <EditableCombinedRolesTable
          canWrite={canWrite}
          combinedRoles={combinedRoles}
          masterView={activeView}
          posts={posts}
          templates={templates}
        />
      ) : null}
    </>
  )
}

function EmployeePanel({
  canManageEmployees,
  canWrite,
  combinedRoles,
  employmentLetters,
  jobs,
  masterView,
  posts,
  templates,
}: Pick<
  RecruitmentPanelProps,
  | "canManageEmployees"
  | "canWrite"
  | "combinedRoles"
  | "employmentLetters"
  | "jobs"
  | "masterView"
  | "posts"
  | "templates"
>) {
  const standalone = masterView === undefined
  const activeView = masterView ?? "masterTables"
  const showDataEntry = activeView === "dataEntry"
  const showMasterTables = activeView === "masterTables"

  return (
    <>
      {standalone ? null : (
        <MasterDataViewTabs
          activeView={activeView}
          allMastersHref="/?tab=dataEntryTab"
          csvDownloadAction={
            <MasterDataCsvDownloadButton href="/hr/employee-assignments/template.csv" />
          }
          csvImportAction={
            canManageEmployees ? (
              <MasterDataCsvImportButton
                action={importEmployeeAssignmentsCsvAction}
                fields={{
                  masterMain: "hr_masters",
                  masterSub: "employee_assignments",
                  masterUnit: "universal",
                }}
              />
            ) : null
          }
          dataEntryHref={recruitmentMasterHref(
            "dataEntry",
            "employee-assignment"
          )}
          exportAction={<DataDownloadButton href="/hr/approved-posts/export" />}
          masterTablesHref={recruitmentMasterHref(
            "masterTables",
            "employee-assignment"
          )}
        />
      )}
      {showDataEntry && canManageEmployees ? (
 <SectionCard>
          <CardHeader>
            <CardTitle>Bulk Employee Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            <EmployeeAssignmentUpload />
          </CardContent>
 </SectionCard>
      ) : null}
      {showMasterTables ? (
        <ApprovedPostsTable
          canWrite={canWrite}
          combinedRoles={combinedRoles}
          employeeManagement={canManageEmployees}
          employmentLetters={employmentLetters}
          jobs={jobs}
          masterView={masterView}
          posts={posts}
          templates={templates.filter((template) => !template.combinedRoleId)}
        />
      ) : null}
    </>
  )
}

function JobsPanel({
  canWrite,
  combinedRoles,
  jobs,
  posts,
}: Pick<
  RecruitmentPanelProps,
  "canWrite" | "combinedRoles" | "jobs" | "posts"
>) {
  const recruitablePosts = listRecruitableApprovedPosts(posts, jobs)
  const combinedRoleById = new Map(combinedRoles.map((role) => [role.id, role]))
  const recruitablePostOptions = recruitablePosts.map((post) => ({
    combinedPostCodes: post.combinedRoleId
      ? (combinedRoleById.get(post.combinedRoleId)?.postCodes ?? [])
      : [],
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
          description="Create One Active Recruitment Opening From A Vacant Or Resigned Approved Post."
          panelId="jobsPanel"
          title="Create Job Post"
        >
          <RecruitablePostFields posts={recruitablePostOptions} />
          <TextField label="Target Date" name="target_date" type="date" />
          <Button className="md:col-span-2 xl:col-span-3" type="submit">
            Create Recruitment Opening
          </Button>
        </PanelForm>
      ) : null}
 <SectionCard>
        <CardHeader>
          <CardTitle>Job Posts</CardTitle>
          <CardDescription>{jobs.length} Recruitment Openings</CardDescription>
        </CardHeader>
        <CardContent>
 <OperationalTable>
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
                      <StatusBadge value={row.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/hr/jobs/${row.id}`}>Open Job</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRow columns={8} label="No Job Posts Found." />
              )}
            </TableBody>
 </OperationalTable>
        </CardContent>
 </SectionCard>
    </>
  )
}

function LogCandidatePanel({
  canWrite,
  candidates,
  masters,
  masterView,
}: Pick<
  RecruitmentPanelProps,
  "canWrite" | "candidates" | "masters" | "masterView"
>) {
  const activeView = masterView ?? "dataEntry"
  const showDataEntry = activeView === "dataEntry"
  const showMasterTables = activeView === "masterTables"

  return (
    <>
      <MasterDataViewTabs
        activeView={activeView}
        csvDownloadAction={
          <MasterDataCsvDownloadButton
            columns={[
              "candidate_name",
              "phone",
              "email",
              "current_company",
              "experience",
              "source",
              "department_code",
              "designation_code",
              "initial_notes",
            ]}
            fileName="candidate-master-template.csv"
          />
        }
        csvImportAction={
          canWrite ? (
            <MasterDataCsvImportButton
              action={importCandidatesCsvAction}
              fields={{
                masterMain: "hr_masters",
                masterSub: "candidates",
                masterUnit: "universal",
              }}
            />
          ) : null
        }
        dataEntryHref="/hr?panel=candidatesPanel&masterView=dataEntry"
        masterTablesHref="/hr?panel=candidatesPanel&masterView=masterTables"
      />
      {canWrite && showDataEntry ? (
        <PanelForm
          action={saveCandidateAction}
          description="Phone Number Is The Duplicate-Safe Candidate Identity."
          masterView={activeView}
          panelId="candidatesPanel"
          title="Log Candidate"
        >
          <TextField label="Candidate Name" name="name" required />
          <TextField label="Phone" name="phone" required />
          <TextField label="Email" name="email" type="email" />
          <TextField label="Current Company" name="current_company" />
          <TextField label="Experience" name="experience" />
          <Field>
            <FieldLabel htmlFor="candidate-source">Source</FieldLabel>
            <NativeSelect
              className="w-full"
              id="candidate-source"
              name="source"
            >
              <NativeSelectOption value="">Not Selected</NativeSelectOption>
              {candidateSourceOptions.map((source) => (
                <NativeSelectOption key={source} value={source}>
                  {source}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="candidate-department">
              Preferred Department
            </FieldLabel>
            <NativeSelect
              className="w-full"
              id="candidate-department"
              name="department_code"
            >
              <NativeSelectOption value="">Not Selected</NativeSelectOption>
              {masters.departments.map((row) => (
                <NativeSelectOption key={row.id} value={row.code}>
                  {row.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="candidate-designation">Designation</FieldLabel>
            <NativeSelect
              className="w-full"
              id="candidate-designation"
              name="designation_code"
            >
              <NativeSelectOption value="">Not Selected</NativeSelectOption>
              {masters.designations.map((row) => (
                <NativeSelectOption key={row.id} value={row.code}>
                  {row.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="candidate-resume">Resume (Pdf)</FieldLabel>
            <Input
              accept="application/pdf,.pdf"
              id="candidate-resume"
              name="resume"
              type="file"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Maximum 10 Mb.
            </p>
          </Field>
          <Field className="md:col-span-2 xl:col-span-3">
            <FieldLabel htmlFor="candidate-notes">Initial Notes</FieldLabel>
            <Textarea id="candidate-notes" name="notes" />
          </Field>
          <Button className="md:col-span-2 xl:col-span-3" type="submit">
            Save Candidate
          </Button>
        </PanelForm>
      ) : null}
      {showMasterTables ? (
        <CandidatesTable
          canWrite={canWrite}
          candidates={candidates}
          masterView={activeView}
        />
      ) : null}
    </>
  )
}

function CandidateSearchPanel({
  canWrite,
  candidates,
  jobs,
  returnJobId,
  selectedJobId,
}: Pick<
  RecruitmentPanelProps,
  "canWrite" | "candidates" | "jobs" | "returnJobId" | "selectedJobId"
>) {
  return (
    <CandidateAssignmentPanel
      canWrite={canWrite}
      candidates={candidates}
      initialJobId={selectedJobId}
      jobs={jobs}
      returnJobId={returnJobId}
    />
  )
}

function InterviewsPanel({
  canWrite,
  interviews,
  posts,
  selectedAppointmentApplicationId,
}: Pick<
  RecruitmentPanelProps,
  "canWrite" | "interviews" | "posts" | "selectedAppointmentApplicationId"
>) {
  const interviewerOptions = recruitmentInterviewerOptions(posts)
  return (
    <>
      <InterviewScheduleBoard
        appointmentApplicationId={selectedAppointmentApplicationId}
        canWrite={canWrite}
        interviews={interviews}
        interviewerOptions={interviewerOptions}
      />
      {canWrite ? <InterviewScheduleForm interviews={interviews} /> : null}
    </>
  )
}

export function RecruitmentPanel(props: RecruitmentPanelProps) {
  switch (props.panelId) {
    case "postMasterPanel":
      return (
        <TemplatePanel
          canWrite={props.canWrite}
          combinedRoles={props.combinedRoles}
          masterView={props.masterView}
          masters={props.masters}
          selectedTemplateCode={props.selectedTemplateCode}
          templates={props.templates}
        />
      )
    case "approvedPostPanel":
      return (
        <ApprovedPostPanel
          canWrite={props.canWrite}
          jobs={props.jobs}
          masters={props.masters}
          masterView={props.masterView}
          posts={props.posts}
          templates={props.templates}
        />
      )
    case "combinedRolesPanel":
      return (
        <CombinedRolePanel
          canWrite={props.canWrite}
          combinedRoles={props.combinedRoles}
          masterView={props.masterView}
          posts={props.posts}
          templates={props.templates}
        />
      )
    case "employeeMasterPanel":
      return (
        <EmployeePanel
          canManageEmployees={props.canManageEmployees}
          canWrite={props.canWrite}
          combinedRoles={props.combinedRoles}
          employmentLetters={props.employmentLetters}
          jobs={props.jobs}
          masterView={props.masterView}
          posts={props.posts}
          templates={props.templates}
        />
      )
    case "jobsPanel":
      return (
        <JobsPanel
          canWrite={props.canWrite}
          combinedRoles={props.combinedRoles}
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
          masterView={props.masterView}
        />
      )
    case "candidateSearchPanel":
      return (
        <CandidateSearchPanel
          canWrite={props.canWrite}
          candidates={props.candidates}
          jobs={props.jobs}
          returnJobId={props.returnJobId}
          selectedJobId={props.selectedJobId}
        />
      )
    case "interviewsPanel":
      return (
        <InterviewsPanel
          canWrite={props.canWrite}
          interviews={props.interviews}
          posts={props.posts}
          selectedAppointmentApplicationId={
            props.selectedAppointmentApplicationId
          }
        />
      )
    case "interviewWorkspacePanel":
      return <InterviewResultsWorkspace records={props.interviewRecords} />
    case "conversationLogsPanel":
      return (
        <ConversationLogsTable
          canWrite={props.canWrite}
          events={props.candidateEvents}
        />
      )
    default:
      return (
        <MastersPanel
          canWrite={props.canWrite}
          masterKind={props.masterKind}
          masterView={props.masterView}
          masters={props.masters}
        />
      )
  }
}
