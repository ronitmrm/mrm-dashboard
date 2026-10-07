import { notFound } from "next/navigation"

import { createRecruitmentRepository } from "@workspace/db"

import { InterviewOutcomeWorkspace } from "@/components/hr/interview-outcome-workspace"
import { JobTemplatePreviewProvider } from "@/components/hr/job-template-preview"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { hrTaskCapabilities } from "@/lib/auth/task-capabilities"
import { recruitmentInterviewerOptions } from "@/lib/shared-employee-master"

export const dynamic = "force-dynamic"

export default async function InterviewOutcomePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ application?: string; source?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  await requireCapability(hrTaskCapabilities.recordInterview, `/hr/jobs/${id}/interview`)

  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const { workspace, posts, template } = await (async () => {
    try {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      const [workspace, posts] = await Promise.all([
        repository.getJobWorkspace(organizationId, id),
        repository.listPosts(organizationId),
      ])
      const template = workspace?.job.requirementTemplateCode
        ? (await repository.listTemplates(organizationId)).find(
            (row) => row.templateCode === workspace.job.requirementTemplateCode
          ) ?? null
        : null
      return { workspace, posts, template }
    } finally {
      await repository.close()
    }
  })()
  if (!workspace) notFound()

  const scoreable = workspace.applications.filter((row) => row.scoreableRound !== null)
  const requested = scoreable.find((row) => row.id === query.application)
  const initialApplicationId = requested?.id ?? (scoreable.length === 1 ? scoreable[0]!.id : "")

  return (
    <JobTemplatePreviewProvider templates={template ? [template] : []}>
      <InterviewOutcomeWorkspace
        applications={workspace.applications}
        initialApplicationId={initialApplicationId}
        interviewerOptions={recruitmentInterviewerOptions(posts)}
        job={workspace.job}
        source={query.source === "interviews" ? "schedule" : "job"}
      />
    </JobTemplatePreviewProvider>
  )
}
