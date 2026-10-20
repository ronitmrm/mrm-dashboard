"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogTrigger } from "@workspace/ui/components/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { StandardState } from "@workspace/ui/components/standard-state"
import { Plus, Trash2 } from "lucide-react"
import { FormGrid, FormSection, StandardDialogContent } from "@/components/ui/golden-patterns"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"
import { hasNonNumericQualityTolerance } from "@workspace/db/quality-parameter-input"

function newInspectionParameter(id: number) {
  return { id, parameterName: "", specification: "", instrumentUsed: "", tolerancePlus: "", toleranceMinus: "", inputType: "number", remark: "" }
}

function InspectionParameterFields({
  name,
  setupNumber,
  parameterNames,
  instrumentNames,
}: {
  name: string
  setupNumber: number
  parameterNames: string[]
  instrumentNames: string[]
}) {
  const [parameters, setParameters] = useState([newInspectionParameter(0)])
  function update(id: number, key: keyof Omit<ReturnType<typeof newInspectionParameter>, "id">, value: string) {
    setParameters(current => current.map(parameter => {
      if (parameter.id !== id) return parameter
      const next = { ...parameter, [key]: value }
      if (next.inputType === "number" && hasNonNumericQualityTolerance(next)) next.inputType = "text"
      return next
    }))
  }

  return (
    <FieldSet className="gap-3 sm:col-span-2 xl:col-span-3">
      <FieldLegend variant="label">
        First-piece &amp; In-process Checks
      </FieldLegend>
      <FieldDescription id={`${name}-help`}>
        Use the same parameters, specifications, instruments and tolerances as Quality Parameters.
      </FieldDescription>
      <FieldGroup className="gap-3">
        {parameters.map((parameter, index) => {
          const fieldId = (key: string) => `${name}-${parameter.id}-${key}`
          const fieldName = (key: string) => `${name}-${key}`
          return <FieldSet key={parameter.id} className="gap-3 rounded-md border p-3">
            <FieldLegend variant="label">Parameter {index + 1}</FieldLegend>
            <FormGrid>
              <Field><FieldLabel htmlFor={fieldId("parameterName")}>Parameter</FieldLabel>
                <SearchableSelect id={fieldId("parameterName")} name={fieldName("parameterName")} required
                  value={parameter.parameterName} onChange={event => update(parameter.id, "parameterName", event.target.value)}>
                  <option value="">Select Parameter</option>{parameterNames.map(value => <option key={value} value={value}>{value}</option>)}
                </SearchableSelect>
              </Field>
              <Field><FieldLabel htmlFor={fieldId("specification")}>Specification</FieldLabel>
                <Input id={fieldId("specification")} name={fieldName("specification")} value={parameter.specification}
                  onChange={event => update(parameter.id, "specification", event.target.value)} required />
              </Field>
              <Field><FieldLabel htmlFor={fieldId("instrumentUsed")}>Instrument Used</FieldLabel>
                <SearchableSelect id={fieldId("instrumentUsed")} name={fieldName("instrumentUsed")}
                  value={parameter.instrumentUsed} onChange={event => update(parameter.id, "instrumentUsed", event.target.value)}>
                  <option value="">Select Measuring Instrument</option>{instrumentNames.map(value => <option key={value} value={value}>{value}</option>)}
                </SearchableSelect>
              </Field>
              {([["tolerancePlus", "Tolerance +"], ["toleranceMinus", "Tolerance -"]] as const).map(([key, label]) =>
                <Field key={key}><FieldLabel htmlFor={fieldId(key)}>{label}</FieldLabel>
                  <Input id={fieldId(key)} name={fieldName(key)} value={parameter[key]} onChange={event => update(parameter.id, key, event.target.value)} />
                </Field>)}
              <Field><FieldLabel htmlFor={fieldId("inputType")}>Input Type</FieldLabel>
                <SearchableSelect id={fieldId("inputType")} name={fieldName("inputType")} value={parameter.inputType}
                  onChange={event => update(parameter.id, "inputType", event.target.value)}>
                  <option value="number" disabled={hasNonNumericQualityTolerance(parameter)}>Number</option>
                  <option value="text">Text</option><option value="pass_fail">Ok / Not Ok</option>
                </SearchableSelect>
              </Field>
              <Field className="sm:col-span-2 xl:col-span-3"><FieldLabel htmlFor={fieldId("remark")}>Remark</FieldLabel>
                <Input id={fieldId("remark")} name={fieldName("remark")} value={parameter.remark} onChange={event => update(parameter.id, "remark", event.target.value)} />
              </Field>
            </FormGrid>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={parameters.length === 1}
                aria-label={`Remove parameter ${index + 1} from setup ${setupNumber}`}
                onClick={() =>
                  setParameters((current) =>
                    current.filter((value) => value.id !== parameter.id)
                  )
                }
              >
                <Trash2 data-icon="inline-start" />
                Remove
              </Button>
            </div>
          </FieldSet>
        })}
      </FieldGroup>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setParameters((current) => [...current, newInspectionParameter(Math.max(...current.map(parameter => parameter.id)) + 1)])
          }
        >
          <Plus data-icon="inline-start" />
          Add parameter
        </Button>
      </div>
    </FieldSet>
  )
}

export function ReworkRouteEditor({ jobCardNumber, machineFamilies, toolingCodes, parameterNames, instrumentNames, submitAction }: {
  jobCardNumber: string
  machineFamilies: string[]
  toolingCodes: string[]
  parameterNames: string[]
  instrumentNames: string[]
  submitAction: (path: string, body: Record<string, unknown>, options?: { throwOnError?: boolean }) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [setups, setSetups] = useState([0])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    const route = setups.map(id => {
      const value = (name: string) => String(form.get(`${id}-${name}`) ?? "").trim()
      const inspectionChecks = form.getAll(`${id}-inspectionChecks-parameterName`).map((_, index) => {
        const checkValue = (field: string) => String(form.getAll(`${id}-inspectionChecks-${field}`)[index] ?? "").trim()
        return { parameterName: checkValue("parameterName"), specification: checkValue("specification"),
          instrumentUsed: checkValue("instrumentUsed"), tolerancePlus: checkValue("tolerancePlus"),
          toleranceMinus: checkValue("toleranceMinus"), inputType: checkValue("inputType"), remark: checkValue("remark") }
      })
      return { setupName: value("setupName"), machineFamily: value("machineFamily"),
        cycleTimeSeconds: Number(value("cycleTimeSeconds")), setupTimeMinutes: Number(value("setupTimeMinutes")),
        stageWeight: Number(value("stageWeight")), operationWeight: Number(value("operationWeight")) || undefined,
        fixture: value("fixture"), tooling: value("tooling"), foamTool: value("foamTool"),
        inspectionChecks }
    })
    setPending(true)
    setError("")
    try {
      await submitAction("rework-route", { jcNo: jobCardNumber, setups: route }, { throwOnError: true })
      setOpen(false)
      setSetups([0])
    } catch (error) {
      setError(error instanceof Error ? error.message : "Rework route could not be saved.")
    } finally {
      setPending(false)
    }
  }

  return <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value) }}>
    <DialogTrigger asChild><Button type="button" size="sm" variant="outline">Create Rework Route</Button></DialogTrigger>
    <StandardDialogContent title="Create Rework Route" description={`${jobCardNumber} · Used only for this rework activity. Retained with its history.`} className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
      <form onSubmit={save} aria-busy={pending} className="grid gap-4">
        {error ? <StandardState variant="error" title="Route not saved" description={error} /> : null}
        <fieldset disabled={pending} className="contents">
          {setups.map((id, index) => {
            const name = (key: string) => `${id}-${key}`
            return <FormSection key={id} title={`Setup ${index + 1}`} width="full">
              <FormGrid>
                <Field><FieldLabel htmlFor={name("setupName")}>Operation / Setup Name</FieldLabel><Input id={name("setupName")} name={name("setupName")} required placeholder="e.g. Thread correction" /></Field>
                <Field><FieldLabel htmlFor={name("machineFamily")}>Machine Family</FieldLabel><SearchableSelect id={name("machineFamily")} name={name("machineFamily")} required defaultValue=""><option value="">Select Machine Family</option>{machineFamilies.map(value => <option key={value} value={value}>{value}</option>)}</SearchableSelect></Field>
                <Field><FieldLabel htmlFor={name("cycleTimeSeconds")}>Cycle Time (seconds / piece)</FieldLabel><Input id={name("cycleTimeSeconds")} name={name("cycleTimeSeconds")} type="number" min="0.001" step="any" required /></Field>
                <Field><FieldLabel htmlFor={name("setupTimeMinutes")}>Setup Time (minutes)</FieldLabel><Input id={name("setupTimeMinutes")} name={name("setupTimeMinutes")} type="number" min="0" step="any" defaultValue="0" required /></Field>
                <Field><FieldLabel htmlFor={name("stageWeight")}>Piece Weight at Setup (grams)</FieldLabel><Input id={name("stageWeight")} name={name("stageWeight")} type="number" min="0.001" step="any" required /></Field>
                <Field><FieldLabel htmlFor={name("operationWeight")}>Weight after Operation (grams, optional)</FieldLabel><Input id={name("operationWeight")} name={name("operationWeight")} type="number" min="0.001" step="any" /></Field>
                {([ ["fixture", "Fixture"], ["tooling", "Tooling"], ["foamTool", "Foam Tool"] ] as const).map(([key, label]) => <Field key={key}><FieldLabel htmlFor={name(key)}>{label} (optional)</FieldLabel>{toolingCodes.length ? <SearchableSelect id={name(key)} name={name(key)} defaultValue=""><option value="">None required</option>{toolingCodes.map(value => <option key={value} value={value}>{value}</option>)}</SearchableSelect> : <Input id={name(key)} name={name(key)} placeholder="Existing Store Asset Code, if required" />}</Field>)}
                <InspectionParameterFields name={name("inspectionChecks")} setupNumber={index + 1} parameterNames={parameterNames} instrumentNames={instrumentNames} />
              </FormGrid>
              {setups.length > 1 ? <Button type="button" variant="ghost" size="sm" onClick={() => setSetups(current => current.filter(value => value !== id))}><Trash2 data-icon="inline-start" />Remove Setup {index + 1}</Button> : null}
            </FormSection>
          })}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={setups.length >= 20} onClick={() => setSetups(current => [...current, Math.max(...current) + 1])}><Plus data-icon="inline-start" />Add Setup</Button>
            <Button type="submit">{pending ? "Saving…" : "Save & Use Rework Route"}</Button>
          </div>
        </fieldset>
      </form>
    </StandardDialogContent>
  </Dialog>
}
