"use client"
import { useId } from "react"
import {
  riskTreatments,
  type RiskAssessment,
  type RiskReview,
} from "@workspace/db/risk-thinking-domain"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { FormGrid } from "@/components/ui/golden-patterns"

function Rating({
  name,
  label,
  value,
  disabled,
}: {
  name: string
  label: string
  value: number | null | undefined
  disabled: boolean
}) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        name={name}
        defaultValue={value?.toString() ?? ""}
        disabled={disabled}
      >
        <NativeSelectOption value="">Not assessed</NativeSelectOption>
        {[1, 2, 3].map((x) => (
          <NativeSelectOption key={x} value={String(x)}>
            {x} · {x === 1 ? "Low" : x === 2 ? "Medium" : "High"}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}
export function RiskAssessmentFields({
  value,
  disabled,
}: {
  value?: RiskAssessment | null
  disabled: boolean
}) {
  const id = useId()
  return (
    <FieldGroup className="col-span-full">
      <p className="text-sm text-muted-foreground">
        Likelihood: 1 unlikely, 2 possible, 3 recurring. Severity: 1
        limited/local, 2 significant quality/delivery disruption, 3 serious
        customer/safety/legal impact. Score = likelihood × severity; 1–2 Low,
        3–4 Medium, 6–9 High. Severity 3 always needs High attention. Ratings
        need a recorded basis; obligations still apply.
      </p>
      <FormGrid>
        <Rating
          name="risk_likelihood"
          label="Current Likelihood"
          value={value?.likelihood}
          disabled={disabled}
        />
        <Rating
          name="risk_severity"
          label="Current Severity"
          value={value?.severity}
          disabled={disabled}
        />
      </FormGrid>
      {(
        [
          ["process", "Affected Process / Scope"],
          ["cause", "Cause / Source of Risk"],
          ["controls", "Existing Controls"],
          ["basis", "Assessment Basis / Evidence"],
        ] as const
      ).map(([key, label]) => (
        <Field key={key}>
          <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
          <Textarea
            id={`${id}-${key}`}
            name={`risk_${key}`}
            maxLength={4000}
            defaultValue={value?.[key] ?? ""}
            disabled={disabled}
          />
        </Field>
      ))}
      <Field>
        <FieldLabel htmlFor={`${id}-treatment`}>Treatment Decision</FieldLabel>
        <NativeSelect
          id={`${id}-treatment`}
          name="risk_treatment"
          defaultValue={value?.treatment ?? "Not assessed"}
          disabled={disabled}
        >
          {riskTreatments.map((x) => (
            <NativeSelectOption key={x} value={x}>
              {x}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {(
        [
          ["monitoring", "Monitoring Method / Indicator"],
          ["frequency", "Monitoring Frequency"],
          ["triggers", "Review Triggers"],
          [
            "references",
            "Related PEST / SWOT / SIPOC / CAR / Meeting References",
          ],
        ] as const
      ).map(([key, label]) => (
        <Field key={key}>
          <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
          <Textarea
            id={`${id}-${key}`}
            name={`risk_${key}`}
            maxLength={4000}
            defaultValue={value?.[key] ?? ""}
            disabled={disabled}
          />
        </Field>
      ))}
    </FieldGroup>
  )
}
export function RiskReviewFields({
  value,
  disabled,
  verifying,
  nextReviewOn,
}: {
  value?: RiskReview | null
  disabled: boolean
  verifying: boolean
  nextReviewOn?: string | null
}) {
  const id = useId()
  return (
    <FieldGroup>
      <FormGrid>
        <Rating
          name="residual_likelihood"
          label="Residual Likelihood"
          value={value?.likelihood}
          disabled={disabled}
        />
        <Rating
          name="residual_severity"
          label="Residual Severity"
          value={value?.severity}
          disabled={disabled}
        />
      </FormGrid>
      <Field>
        <FieldLabel htmlFor={`${id}-decision`}>Risk Review Decision</FieldLabel>
        <NativeSelect
          id={`${id}-decision`}
          name="residual_decision"
          defaultValue="Continue monitoring"
          disabled={disabled}
        >
          {(verifying
            ? ["Continue monitoring"]
            : [
                "Continue monitoring",
                "Further treatment required",
                "No longer applicable",
              ]
          ).map((x) => (
            <NativeSelectOption key={x} value={x}>
              {x}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-acceptance`}>
          Residual Risk Decision / Acceptance Basis
        </FieldLabel>
        <Textarea
          id={`${id}-acceptance`}
          name="residual_acceptance"
          maxLength={4000}
          required
          disabled={disabled}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-authorization`}>
          Management Authorization Reference for High Residual Risk
        </FieldLabel>
        <Input
          id={`${id}-authorization`}
          name="residual_authorization"
          maxLength={4000}
          disabled={disabled}
        />
      </Field>
      {verifying ? (
        <Field>
          <FieldLabel htmlFor={`${id}-review`}>Next Review Date</FieldLabel>
          <Input
            id={`${id}-review`}
            name="nextReviewOn"
            type="date"
            required
            defaultValue={nextReviewOn ?? ""}
            disabled={disabled}
          />
        </Field>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Verification completes the action; ongoing risks stay under monitoring.
        Further treatment reopens work. Retire only when evidence shows the risk
        no longer applies.
      </p>
    </FieldGroup>
  )
}
