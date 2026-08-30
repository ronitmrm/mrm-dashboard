export const employmentLetterTypes = [
  "offer",
  "appointment",
  "experience",
] as const
export type EmploymentLetterType = (typeof employmentLetterTypes)[number]

export type EmploymentLetterIdentity = {
  department: string
  designation: string
  employeeCode: string | null
  employeeName: string
  joiningDate: string
  lastWorkingDate?: string | null
}

type Signatory = { signatoryDesignation: string; signatoryName: string }
export type OfferLetterDetails = Signatory & {
  payPeriod: "day" | "month"
  postalAddress: string
  probationLength: number
  probationUnit: "days" | "months"
}
export type AppointmentLetterDetails = Signatory & {
  confirmationEffectiveDate: string
  grossMonthlySalary: number
  probationCompletedOn: string
  reportsTo: string
  workLocation: string
}
export type ExperienceLetterDetails = Signatory & {
  keyResponsibilities: string
  pronouns: "he-him" | "she-her" | "they-them"
  title: "Mr." | "Ms." | "Mx."
  workLocation: string
}

type BaseRequest = {
  identity: EmploymentLetterIdentity
  issuedOn: string
  ordinal: number
}
export type EmploymentLetterRequest =
  | (BaseRequest & {
      applicationStatus: string
      details: OfferLetterDetails
      salary: number
      type: "offer"
      willingToJoin: boolean
    })
  | (BaseRequest & {
      details: AppointmentLetterDetails
      postStatus: string
      type: "appointment"
    })
  | (BaseRequest & {
      details: ExperienceLetterDetails
      postStatus: string
      type: "experience"
    })
export type PreparedEmploymentLetter<
  Request extends EmploymentLetterRequest = EmploymentLetterRequest,
> = Request & { reference: string }
type OfferLetterRequest = Extract<EmploymentLetterRequest, { type: "offer" }>
type AppointmentLetterRequest = Extract<
  EmploymentLetterRequest,
  { type: "appointment" }
>
type ExperienceLetterRequest = Extract<
  EmploymentLetterRequest,
  { type: "experience" }
>

function text(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function positive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be greater than zero.`)
  return value
}

function date(value: string, label: string) {
  const normalized = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized))
    throw new Error(`${label} is required.`)
  return normalized
}

function reference(
  type: EmploymentLetterType,
  issuedOn: string,
  ordinal: number
) {
  const year = Number(issuedOn.slice(0, 4))
  const start = Number(issuedOn.slice(5, 7)) >= 4 ? year : year - 1
  const code = type === "offer" ? "OL" : type === "appointment" ? "AL" : "EL"
  return `MRMPL-HR-${start}${String(start + 1).slice(-2)}-${code}-${ordinal}`
}

function identity(value: EmploymentLetterIdentity) {
  return {
    department: text(value.department, "Department"),
    designation: text(value.designation, "Designation"),
    employeeCode: value.employeeCode?.trim() || null,
    employeeName: text(value.employeeName, "Employee name"),
    joiningDate: date(value.joiningDate, "Joining date"),
    lastWorkingDate: value.lastWorkingDate
      ? date(value.lastWorkingDate, "Last Working Date")
      : null,
  }
}

export function prepareEmploymentLetter(
  request: OfferLetterRequest
): PreparedEmploymentLetter<OfferLetterRequest>
export function prepareEmploymentLetter(
  request: AppointmentLetterRequest
): PreparedEmploymentLetter<AppointmentLetterRequest>
export function prepareEmploymentLetter(
  request: ExperienceLetterRequest
): PreparedEmploymentLetter<ExperienceLetterRequest>
export function prepareEmploymentLetter(
  request: EmploymentLetterRequest
): PreparedEmploymentLetter
export function prepareEmploymentLetter(
  request: EmploymentLetterRequest
): PreparedEmploymentLetter {
  const issuedOn = date(request.issuedOn, "Issue date")
  const ordinal = positive(request.ordinal, "Letter number")
  const person = identity(request.identity)
  const signer = {
    signatoryDesignation: text(
      request.details.signatoryDesignation,
      "Signatory designation"
    ),
    signatoryName: text(request.details.signatoryName, "Signatory name"),
  }
  const letterReference = reference(request.type, issuedOn, ordinal)
  if (request.type === "offer") {
    if (request.applicationStatus !== "Approved" || !request.willingToJoin)
      throw new Error(
        "An Offer Letter requires an approved candidate who is willing to join."
      )
    return {
      ...request,
      details: {
        ...request.details,
        ...signer,
        postalAddress: text(request.details.postalAddress, "Postal address"),
        probationLength: positive(
          request.details.probationLength,
          "Probation period"
        ),
      },
      identity: person,
      issuedOn,
      reference: letterReference,
      salary: positive(request.salary, "Salary"),
    }
  }
  if (request.type === "appointment") {
    if (request.postStatus !== "Occupied")
      throw new Error(
        "An Appointment Letter requires an employee who has joined."
      )
    const probationCompletedOn = date(
      request.details.probationCompletedOn,
      "Probation completion date"
    )
    if (probationCompletedOn > issuedOn)
      throw new Error(
        "Probation must be completed before issuing an Appointment Letter."
      )
    return {
      ...request,
      details: {
        ...request.details,
        ...signer,
        confirmationEffectiveDate: date(
          request.details.confirmationEffectiveDate,
          "Confirmation effective date"
        ),
        grossMonthlySalary: positive(
          request.details.grossMonthlySalary,
          "Gross monthly salary"
        ),
        probationCompletedOn,
        reportsTo: text(request.details.reportsTo, "Reports to"),
        workLocation: text(request.details.workLocation, "Work location"),
      },
      identity: person,
      issuedOn,
      reference: letterReference,
    }
  }
  if (request.postStatus !== "Resigned")
    throw new Error("An Experience Letter requires a resigned employee.")
  if (!person.lastWorkingDate || person.lastWorkingDate > issuedOn)
    throw new Error(
      "Last Working Date must be reached before issuing an Experience Letter."
    )
  return {
    ...request,
    details: {
      ...request.details,
      ...signer,
      keyResponsibilities: text(
        request.details.keyResponsibilities,
        "Key responsibilities"
      ),
      workLocation: text(request.details.workLocation, "Work location"),
    },
    identity: person,
    issuedOn,
    reference: letterReference,
  }
}
