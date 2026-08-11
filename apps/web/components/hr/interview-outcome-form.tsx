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
  initialApplicationId = "",
  panelId,
  returnJobId,
}: {
  applications: InterviewApplicationOption[]
  initialApplicationId?: string
  panelId?: string
  returnJobId?: string
}) {
  const fieldId = useId()
  const [applicationId, setApplicationId] = useState(initialApplicationId)
  const [decision, setDecision] = useState("Approved")
  const [willingToJoin, setWillingToJoin] = useState("")
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
              <NativeSelectOption value="">Select Applicant</NativeSelectOption>
              {availableApplications.map((application) => (
                <NativeSelectOption key={application.id} value={application.id}>
                  {application.candidateName} · {application.scoreableRound}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${fieldId}-round`}>Required Round</FieldLabel>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                id={`${fieldId}-round`}
                placeholder="Select An Applicant"
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
                <p className="font-medium">Preset Assessment</p>
                <p className="text-sm text-muted-foreground">
                  Mark Every Question From 1 To 5. The Overall Score Is
                  Calculated Automatically.
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
                      Select Score
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
              Schedule The Required Interview First, Then Select The Applicant
              To Score The Locked Round.
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
        </div>
        {round?.name === "HR Round" && decision === "Approved" ? (
          <div className="grid gap-4 rounded-2xl border bg-muted/20 p-4">
            <div>
              <p className="font-medium">Appointment Confirmation</p>
              <p className="text-sm text-muted-foreground">
                Confirm The Candidate&apos;s Willingness Before Creating The
                Appointment.
              </p>
            </div>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-willing-to-join`}>
                Is The Candidate Willing To Join?
              </FieldLabel>
              <NativeSelect
                className="w-full"
                id={`${fieldId}-willing-to-join`}
                name="willing_to_join"
                onChange={(event) => setWillingToJoin(event.target.value)}
                required
                value={willingToJoin}
              >
                <NativeSelectOption value="">
                  Select Yes Or No
                </NativeSelectOption>
                <NativeSelectOption value="yes">Yes</NativeSelectOption>
                <NativeSelectOption value="no">No</NativeSelectOption>
              </NativeSelect>
            </Field>

            {willingToJoin === "yes" ? (
              <>
                <Field>
                  <FieldLabel htmlFor={`${fieldId}-joining-date`}>
                    Joining Date
                  </FieldLabel>
                  <Input
                    id={`${fieldId}-joining-date`}
                    name="joining_date"
                    required
                    type="date"
                  />
                </Field>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="grid gap-4 rounded-xl border bg-background p-4">
                    <div>
                      <p className="font-medium">Before Probation</p>
                      <p className="text-xs text-muted-foreground">
                        Enter One Fixed Monthly Salary.
                      </p>
                    </div>
                    <Field>
                      <FieldLabel htmlFor={`${fieldId}-salary-before`}>
                        Fixed Salary (₹)
                      </FieldLabel>
                      <Input
                        id={`${fieldId}-salary-before`}
                        inputMode="decimal"
                        min="1"
                        name="salary_before_probation"
                        placeholder="15000"
                        required
                        step="0.01"
                        type="number"
                      />
                    </Field>
                  </div>
                  <div className="grid gap-4 rounded-xl border bg-background p-4">
                    <div>
                      <p className="font-medium">After Probation</p>
                      <p className="text-xs text-muted-foreground">
                        Enter The Monthly Salary Range.
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor={`${fieldId}-salary-after-min`}>
                          Minimum (₹)
                        </FieldLabel>
                        <Input
                          id={`${fieldId}-salary-after-min`}
                          inputMode="decimal"
                          min="1"
                          name="salary_after_probation_minimum"
                          placeholder="15000"
                          required
                          step="0.01"
                          type="number"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`${fieldId}-salary-after-max`}>
                          Maximum (₹)
                        </FieldLabel>
                        <Input
                          id={`${fieldId}-salary-after-max`}
                          inputMode="decimal"
                          min="1"
                          name="salary_after_probation_maximum"
                          placeholder="20000"
                          required
                          step="0.01"
                          type="number"
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`${fieldId}-comments`}>Comments</FieldLabel>
          <Textarea id={`${fieldId}-comments`} name="comments" />
        </Field>
        <Button disabled={!round} type="submit">
          Save Interview Outcome
        </Button>
      </FieldGroup>
    </form>
  )
}
