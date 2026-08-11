import {
  createRecruitmentRepository,
  type RecruitmentCandidateEventRow,
  type RecruitmentCandidateRow,
  type RecruitmentCombinedRoleRow,
  type RecruitmentInterviewRow,
  type RecruitmentInterviewRecordRow,
  type RecruitmentJobRow,
  type RecruitmentMasterSnapshot,
  type RecruitmentPostRow,
  type RecruitmentTemplateRow,
} from "@workspace/db"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { MetricCard } from "@workspace/ui/components/card"
import { BriefcaseBusiness } from "lucide-react"
import { redirect } from "next/navigation"

import { RecruitmentPanel } from "@/components/hr/recruitment-panel"
import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import { hrNavigation } from "@/lib/unified-navigation"

export const dynamic = "force-dynamic"

export default async function HrRecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    appointment?: string
    error?: string
    job?: string
    panel?: string
    returnJob?: string
    success?: string
    template?: string
  }>
}) {
  const feedback = await searchParams
  const requestedItem = hrNavigation.find(
    (item) => item.panelId === feedback.panel
  )
  const activeItem = requestedItem ?? hrNavigation[0]
  if (!activeItem) redirect("/unauthorized")

  const session = await requireCapability(
    activeItem.requiredCapability,
    activeItem.href
  )
  const grants = await listGrantedCapabilities(session.user.id, [
    "hr.recruitment.write",
    "hr.employees.write",
  ])
  const canWrite = grants.includes("hr.recruitment.write")
  const canManageEmployees = grants.includes("hr.employees.write")

  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  let candidates: RecruitmentCandidateRow[] = []
  let candidateEvents: RecruitmentCandidateEventRow[] = []
  let combinedRoles: RecruitmentCombinedRoleRow[] = []
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
      "employeeMasterPanel",
    ].includes(panelId)
    const needsPosts = [
      "approvedPostPanel",
      "employeeMasterPanel",
      "jobsPanel",
    ].includes(panelId)
    const needsCombinedRoles = [
      "postMasterPanel",
      "approvedPostPanel",
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
  } finally {
    await repository.close()
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
        <p className="max-w-3xl text-sm text-muted-foreground">
          {activeItem.label} Is Part Of The Authenticated Mrmpl Dashboard And
          Uses The Same Account, Permissions, And Postgresql Records.
        </p>
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

      {activeItem.panelId !== "interviewsPanel" &&
      activeItem.panelId !== "interviewWorkspacePanel" ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Approved Posts", stats.posts],
            ["Vacant Posts", stats.vacantPosts],
            ["Templates", stats.templates],
            ["Open Jobs", stats.openJobs],
            ["Candidates", stats.candidates],
            ["Interviews", stats.interviews],
          ].map(([label, value]) => (
            <MetricCard key={label} label={label} value={value} />
          ))}
        </section>
      ) : null}

      <RecruitmentPanel
        canManageEmployees={canManageEmployees}
        canWrite={canWrite}
        candidates={candidates}
        candidateEvents={candidateEvents}
        combinedRoles={combinedRoles}
        interviews={interviews}
        interviewRecords={interviewRecords}
        jobs={jobs}
        masters={masters}
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
