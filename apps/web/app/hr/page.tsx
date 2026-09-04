import {
  createRecruitmentEmploymentLetterRepository,
  createRecruitmentRepository,
  type RecruitmentCandidateEventRow,
  type RecruitmentCandidateRow,
  type RecruitmentCombinedRoleRow,
  type RecruitmentInterviewRow,
  type RecruitmentInterviewRecordRow,
  type RecruitmentJobRow,
  type RecruitmentMasterSnapshot,
  type RecruitmentEmploymentLetterRow,
  type RecruitmentPostRow,
  type RecruitmentTemplateRow,
} from "@workspace/db"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { MetricCard } from "@workspace/ui/components/card"
import { BriefcaseBusiness } from "lucide-react"
import { redirect } from "next/navigation"
import { PinDashboardMetricButton } from "@/components/dashboard/pin-dashboard-metric-button"

import { RecruitmentPanel } from "@/components/hr/recruitment-panel"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { listGrantedCapabilities } from "@/lib/auth/require-capability"
import { requireHrPage } from "@/lib/auth/require-hr-page"
import { hrTaskCapabilities } from "@/lib/auth/task-capabilities"
import { hrMasterNavigation, hrNavigation } from "@/lib/unified-navigation"
import { normalizeRecruitmentMasterKind } from "@/lib/recruitment-master-navigation"

export const dynamic = "force-dynamic"

export default async function HrRecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    appointment?: string
    error?: string
    job?: string
    kind?: string
    masterView?: string
    panel?: string
    returnJob?: string
    success?: string
    template?: string
  }>
}) {
  const feedback = await searchParams
  const routeNavigation = [...hrMasterNavigation, ...hrNavigation]
  const requestedItem = routeNavigation.find(
    (item) => item.panelId === feedback.panel
  )
  const activeItem = requestedItem ?? hrNavigation[0]
  if (!activeItem) redirect("/unauthorized")

  const session = await requireHrPage(
    activeItem.requiredCapability,
    activeItem.href
  )
  const grants = await listGrantedCapabilities(
    session.user.id,
    Object.values(hrTaskCapabilities)
  )
  const canManageEmployees =
    grants.includes(hrTaskCapabilities.assignEmployee) ||
    grants.includes(hrTaskCapabilities.bulkAssignEmployees)
  const canWrite = grants.some(
    (capability) =>
      capability !== hrTaskCapabilities.assignEmployee &&
      capability !== hrTaskCapabilities.bulkAssignEmployees
  )

  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const letterRepository = createRecruitmentEmploymentLetterRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  let candidates: RecruitmentCandidateRow[] = []
  let candidateEvents: RecruitmentCandidateEventRow[] = []
  let combinedRoles: RecruitmentCombinedRoleRow[] = []
  let employmentLetters: RecruitmentEmploymentLetterRow[] = []
  let interviews: RecruitmentInterviewRow[] = []
  let interviewRecords: RecruitmentInterviewRecordRow[] = []
  let jobs: RecruitmentJobRow[] = []
  let posts: RecruitmentPostRow[] = []
  let templates: RecruitmentTemplateRow[] = []
  let masters: RecruitmentMasterSnapshot = {
    departments: [],
    designations: [],
  }
  let stats
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const panelId = activeItem.panelId
    const needsMasters = [
      "mastersPanel",
      "postMasterPanel",
      "approvedPostPanel",
      "candidatesPanel",
    ].includes(panelId)
    const needsTemplates = [
      "postMasterPanel",
      "approvedPostPanel",
      "combinedRolesPanel",
      "employeeMasterPanel",
    ].includes(panelId)
    const needsPosts = [
      "approvedPostPanel",
      "combinedRolesPanel",
      "employeeMasterPanel",
      "interviewsPanel",
      "jobsPanel",
    ].includes(panelId)
    const needsCombinedRoles = [
      "postMasterPanel",
      "approvedPostPanel",
      "combinedRolesPanel",
      "employeeMasterPanel",
      "jobsPanel",
    ].includes(panelId)
    const needsCandidates = [
      "candidatesPanel",
      "candidateSearchPanel",
    ].includes(panelId)
    const needsJobs = [
      "approvedPostPanel",
      "jobsPanel",
      "candidateSearchPanel",
      "employeeMasterPanel",
    ].includes(panelId)

    const [
      loadedStats,
      loadedMasters,
      loadedTemplates,
      loadedPosts,
      loadedCombinedRoles,
      loadedCandidates,
      loadedJobs,
      loadedInterviews,
      loadedInterviewRecords,
      loadedCandidateEvents,
      loadedEmploymentLetters,
    ] = await Promise.all([
      repository.count(organizationId),
      needsMasters
        ? repository.listMasters(organizationId)
        : Promise.resolve(masters),
      needsTemplates
        ? repository.listTemplates(organizationId)
        : Promise.resolve(templates),
      needsPosts
        ? repository.listPosts(organizationId)
        : Promise.resolve(posts),
      needsCombinedRoles
        ? repository.listCombinedRoles(organizationId)
        : Promise.resolve(combinedRoles),
      needsCandidates
        ? repository.listCandidates(organizationId)
        : Promise.resolve(candidates),
      needsJobs ? repository.listJobs(organizationId) : Promise.resolve(jobs),
      ["interviewsPanel", "interviewWorkspacePanel"].includes(panelId)
        ? repository.listInterviews(organizationId)
        : Promise.resolve(interviews),
      panelId === "interviewWorkspacePanel"
        ? repository.listInterviewRecords(organizationId)
        : Promise.resolve(interviewRecords),
      panelId === "conversationLogsPanel"
        ? repository.listCandidateEvents(organizationId)
        : Promise.resolve(candidateEvents),
      panelId === "employeeMasterPanel"
        ? letterRepository.list(organizationId)
        : Promise.resolve(employmentLetters),
    ])
    stats = loadedStats
    masters = loadedMasters
    templates = loadedTemplates
    posts = loadedPosts
    combinedRoles = loadedCombinedRoles
    candidates = loadedCandidates
    jobs = loadedJobs
    interviews = loadedInterviews
    interviewRecords = loadedInterviewRecords
    candidateEvents = loadedCandidateEvents
    employmentLetters = loadedEmploymentLetters
  } finally {
    await Promise.all([repository.close(), letterRepository.close()])
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-2">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">
            Hr Recruitment
          </h2>
        </div>
      </section>

      {feedback.error ? (
        <Alert variant="destructive">
          <AlertDescription>{feedback.error}</AlertDescription>
        </Alert>
      ) : null}
      {feedback.success ? (
        <Alert>
          <AlertDescription>{feedback.success}</AlertDescription>
        </Alert>
      ) : null}

      {activeItem.panelId !== "mastersPanel" &&
      activeItem.panelId !== "postMasterPanel" &&
      activeItem.panelId !== "approvedPostPanel" &&
      activeItem.panelId !== "combinedRolesPanel" &&
      activeItem.panelId !== "candidatesPanel" &&
      activeItem.panelId !== "employeeMasterPanel" &&
      activeItem.panelId !== "interviewsPanel" &&
      activeItem.panelId !== "interviewWorkspacePanel" ? (
        <section
          aria-label="HR overview"
          className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3"
        >
          {(
            [
              {
                label: "Approved Posts",
                metricId: "hr.approved-posts",
                value: stats.posts,
                tone: "information",
              },
              {
                label: "Vacant Posts",
                metricId: "hr.vacant-posts",
                value: stats.vacantPosts,
                tone: "warning",
              },
              {
                label: "Templates",
                metricId: "hr.templates",
                value: stats.templates,
                tone: "brand",
              },
              {
                label: "Open Jobs",
                metricId: "hr.open-jobs",
                value: stats.openJobs,
                tone: "accent",
              },
              {
                label: "Candidates",
                metricId: "hr.candidates",
                value: stats.candidates,
                tone: "information",
              },
              {
                label: "Interviews",
                metricId: "hr.interviews",
                value: stats.interviews,
                tone: "brand",
              },
            ] as const
          ).map(({ label, metricId, value, tone }) => (
            <MetricCard
              action={<PinDashboardMetricButton metricId={metricId} />}
              key={label}
              label={label}
              tone={tone}
              value={value.toLocaleString("en-IN")}
            />
          ))}
          <p className="col-span-full text-xs text-muted-foreground">
            HR overview · all records, before table filters
          </p>
        </section>
      ) : null}

      <RecruitmentPanel
        canManageEmployees={canManageEmployees}
        canWrite={canWrite}
        candidates={candidates}
        candidateEvents={candidateEvents}
        combinedRoles={combinedRoles}
        employmentLetters={employmentLetters}
        interviews={interviews}
        interviewRecords={interviewRecords}
        jobs={jobs}
        masters={masters}
        masterKind={normalizeRecruitmentMasterKind(feedback.kind)}
        masterView={
          feedback.masterView === "dataEntry" ||
          feedback.masterView === "masterTables"
            ? feedback.masterView
            : undefined
        }
        panelId={activeItem.panelId}
        posts={posts}
        returnJobId={feedback.returnJob}
        selectedAppointmentApplicationId={feedback.appointment}
        selectedJobId={feedback.job}
        selectedTemplateCode={feedback.template}
        templates={templates}
      />
    </div>
  )
}
