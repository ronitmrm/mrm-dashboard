"use client"

import {
  recruitmentInterviewRound,
  type RecruitmentInterviewRoundName,
} from "@workspace/db/recruitment-interview-workflow"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { LockKeyhole } from "lucide-react"
import { useId, useState } from "react"

import { recordInterviewAction } from "@/app/hr/actions"

export type InterviewApplicationOption = {
  candidateName: string
  id: string
  scoreableRound: RecruitmentInterviewRoundName | null
}

const scoreOptions = [
  ["1", "1 - Poor"],
  ["2", "2 - Needs improvement"],
  ["3", "3 - Satisfactory"],
  ["4", "4 - Good"],
  ["5", "5 - Excellent"],
] as const

export function InterviewOutcomeForm({
  applications,
  panelId,
  returnJobId,
}: {
  applications: InterviewApplicationOption[]
  panelId?: string
  returnJobId?: string
}) {
  const fieldId = useId()
  const [applicationId, setApplicationId] = useState("")
  const [decision, setDecision] = useState("Approved")
  const selectedApplication = applications.find(
    (application) => application.id === applicationId
  )
  const round = recruitmentInterviewRound(selectedApplication?.scoreableRound)
  const availableApplications = applications.filter(
    (application) => application.scoreableRound !== null
  )

  return (
    <form action={recordInterviewAction}>
      {panelId ? <input name="panel" type="hidden" value={panelId} /> : null}
      {returnJobId ? (
        <input name="return_job_id" type="hidden" value={returnJobId} />
      ) : null}
      <input name="round_name" type="hidden" value={round?.name ?? ""} />
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${fieldId}-application`}>
              Applicant
            </FieldLabel>
            <NativeSelect
              className="w-full"
              id={`${fieldId}-application`}
              name="application_id"
              onChange={(event) => setApplicationId(event.target.value)}
              required
              value={applicationId}
            >
              <NativeSelectOption value="">Select applicant</NativeSelectOption>
              {availableApplications.map((application) => (
                <NativeSelectOption key={application.id} value={application.id}>
                  {application.candidateName} · {application.scoreableRound}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${fieldId}-round`}>Required round</FieldLabel>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                id={`${fieldId}-round`}
                placeholder="Select an applicant"
                readOnly
                value={round?.name ?? ""}
              />
            </div>
          </Field>
        </div>

        {round ? (
          <div className="grid gap-4 rounded-2xl border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">Preset assessment</p>
                <p className="text-sm text-muted-foreground">
                  Mark every question from 1 to 5. The overall score is
                  calculated automatically.
                </p>
              </div>
              <Badge>{round.name}</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {round.questions.map((question, index) => (
                <Field key={question.id}>
                  <FieldLabel htmlFor={`${fieldId}-${question.id}`}>
                    {index + 1}. {question.prompt}
                  </FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id={`${fieldId}-${question.id}`}
                    name={`question_${question.id}`}
                    required
                  >
                    <NativeSelectOption value="">
                      Select score
                    </NativeSelectOption>
                    {scoreOptions.map(([value, label]) => (
                      <NativeSelectOption key={value} value={value}>
                        {label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              ))}
            </div>
          </div>
        ) : (
          <Alert>
            <AlertDescription>
              Schedule the required interview first, then select the applicant
              to score the locked round.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${fieldId}-decision`}>Decision</FieldLabel>
            <NativeSelect
              className="w-full"
              id={`${fieldId}-decision`}
              name="status"
              onChange={(event) => setDecision(event.target.value)}
              required
              value={decision}
            >
              <NativeSelectOption value="Approved">Approved</NativeSelectOption>
              <NativeSelectOption value="Rejected">Rejected</NativeSelectOption>
              <NativeSelectOption value="Hold">Hold</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${fieldId}-interviewer`}>
              Interviewer
            </FieldLabel>
            <Input
              id={`${fieldId}-interviewer`}
              name="interviewer_name"
              required
            />
          </Field>
          {round?.name === "HR Round" ? (
            <Field>
              <FieldLabel htmlFor={`${fieldId}-joining-date`}>
                Joining date
              </FieldLabel>
              <Input
                id={`${fieldId}-joining-date`}
                name="joining_date"
                required={decision === "Approved"}
                type="date"
              />
            </Field>
          ) : null}
        </div>
        <Field>
          <FieldLabel htmlFor={`${fieldId}-comments`}>Comments</FieldLabel>
          <Textarea id={`${fieldId}-comments`} name="comments" />
        </Field>
        <Button disabled={!round} type="submit">
          Save interview outcome
        </Button>
      </FieldGroup>
    </form>
  )
}
