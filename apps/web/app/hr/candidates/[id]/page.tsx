import Link from "next/link"
import { notFound } from "next/navigation"

import { createRecruitmentRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { ArrowLeft, FileText } from "lucide-react"

import { ConversationLogsTable } from "@/components/hr/conversation-logs-table"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

export default async function CandidateWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireCapability("hr.recruitment.read", "/hr?panel=candidatesPanel")
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const workspace = await (async () => {
    try {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      return repository.getCandidateWorkspace(organizationId, id)
    } finally {
      await repository.close()
    }
  })()
  if (!workspace) notFound()

  const { applications, candidate, events } = workspace
  return (
    <div className="grid gap-6">
      <Button asChild className="w-fit" size="sm" variant="ghost">
        <Link href="/hr?panel=candidatesPanel">
          <ArrowLeft data-icon="inline-start" />
          Back to candidates
        </Link>
      </Button>

      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {candidate.name}
            </h2>
            <Badge variant="outline">{candidate.status}</Badge>
          </div>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {candidate.phone} · {candidate.email ?? "No email"}
          </p>
        </div>
        {candidate.hasResume ? (
          <Button asChild>
            <a
              href={`/hr/candidates/${candidate.id}/resume`}
              rel="noreferrer"
              target="_blank"
            >
              <FileText data-icon="inline-start" />
              View resume
            </a>
          </Button>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Departments", candidate.departments.join(", ") || "—"],
          ["Current company", candidate.currentCompany ?? "—"],
          ["Experience", candidate.experience ?? "—"],
          ["Source", candidate.source ?? "—"],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
            </CardHeader>
            <CardContent className="font-medium">{value}</CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Job application history</CardTitle>
          <CardDescription>
            Every job this candidate has been assigned to.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Interview rounds</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((application) => (
                <TableRow key={application.applicationId}>
                  <TableCell className="font-mono">
                    <Button
                      asChild
                      className="h-auto p-0 font-mono"
                      variant="link"
                    >
                      <Link href={`/hr/jobs/${application.jobId}`}>
                        {application.jobNumber}
                      </Link>
                    </Button>
                  </TableCell>
                  <TableCell>{application.jobTitle}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{application.status}</Badge>
                  </TableCell>
                  <TableCell>{application.interviewCount}</TableCell>
                </TableRow>
              ))}
              {!applications.length ? (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={4}
                  >
                    No job applications yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConversationLogsTable
        events={events}
        showCandidate={false}
        title="Candidate conversation history"
      />
    </div>
  )
}
