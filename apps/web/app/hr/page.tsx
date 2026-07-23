import { BriefcaseBusiness, ExternalLink, Link2Off } from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

type RecruitmentService =
  | { status: "connected"; url: string }
  | { status: "invalid" | "missing" }

function recruitmentService(): RecruitmentService {
  const configuredUrl = process.env.HR_RECRUITMENT_URL?.trim()
  if (!configuredUrl) return { status: "missing" }

  try {
    const url = new URL(configuredUrl)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { status: "invalid" }
    }
    return { status: "connected", url: url.toString() }
  } catch {
    return { status: "invalid" }
  }
}

export default function HrRecruitmentPage() {
  const service = recruitmentService()

  return (
    <>
      <section className="grid gap-2">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">
            HR Recruitment
          </h2>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Recruitment remains a separately managed service inside the unified
          MRMPL application.
        </p>
      </section>

      {service.status === "connected" ? (
        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="grid gap-1.5">
                <CardTitle>Recruitment workspace</CardTitle>
                <CardDescription>
                  The external HR service is shown inside the authenticated
                  MRMPL shell.
                </CardDescription>
              </div>
              <Button asChild variant="outline">
                <a href={service.url} rel="noopener noreferrer" target="_blank">
                  <ExternalLink />
                  Open separately
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <iframe
              allow="clipboard-read; clipboard-write"
              className="min-h-[75vh] w-full border-0"
              referrerPolicy="strict-origin-when-cross-origin"
              src={service.url}
              title="MRMPL HR Recruitment"
            />
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <Link2Off />
          <AlertTitle>HR Recruitment service is not connected</AlertTitle>
          <AlertDescription>
            {service.status === "invalid"
              ? "The configured HR Recruitment URL is invalid. Ask the application administrator to correct HR_RECRUITMENT_URL."
              : "The HR Recruitment service and its records were not included in this repository. Configure HR_RECRUITMENT_URL to reconnect the existing external service."}
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}
