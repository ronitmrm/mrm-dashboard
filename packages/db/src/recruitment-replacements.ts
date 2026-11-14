import type { PoolClient } from "pg"

export type ReplacementAppointment = {
  applicationId?: string | null
  id: string
  employeeName: string
  employeeCode: string | null
  status: "Pending" | "Joined" | "Cancelled"
  appointedAt: string
  joiningDate?: string | null
  completedAt: string | null
  outgoingEmployeeName: string | null
  outgoingEmployeeCode: string | null
  outgoingLastWorkingDate: string | null
  outgoingJoiningDate?: string | null
  outgoingStillEmployed?: boolean
}

type AssignmentTarget = {
  id: string
  status: string
  can_replace: boolean
  last_working_date: string | null
  employee_name: string | null
  employee_code: string | null
}

export async function applyReplacementAssignment(
  client: PoolClient,
  input: {
    organizationId: string
    actorUserId?: string | null
    employeeEvent?: string | null
    employeeName?: string | null
    employeeCode?: string | null
    appointedApplicationId?: string | null
    joiningDate?: string | null
  },
  targets: readonly AssignmentTarget[]
) {
  const ids = targets.map((post) => post.id)
  const event = input.employeeEvent?.trim() || "Appointed"
  const pending = await client.query<{
    id: string
    post_id: string
    employee_name: string
    employee_code: string | null
    application_id: string | null
  }>(
    `SELECT id, post_id, employee_name, employee_code, application_id
     FROM recruitment.post_replacements
     WHERE organization_id = $1 AND post_id = ANY($2::uuid[]) AND status = 'Pending'
     ORDER BY post_id FOR UPDATE`,
    [input.organizationId, ids]
  )

  const directJoin = event === "Joined" && targets.some((post) => post.status === "Resigned")
  if (directJoin && pending.rows.length) {
    throw new Error("A replacement is already pending. Confirm their joining or cancel the replacement first.")
  }
  const replacement = pending.rows[0]
  if (event === "Cancel Replacement" || event === "Replacement Joined") {
    if (!replacement || pending.rows.length !== targets.length) {
      throw new Error(
        "Every post must have the same pending replacement before this action."
      )
    }
    if (
      pending.rows.some(
        (row) =>
          row.employee_name !== replacement.employee_name ||
          row.employee_code !== replacement.employee_code ||
          row.application_id !== replacement.application_id
      )
    ) {
      throw new Error(
        "Combined posts have different pending replacements. Resolve them separately first."
      )
    }
  }
  if (event === "Replacement Joined" || directJoin) {
    if (
      targets.some((post) => post.status !== "Resigned" || !post.last_working_date)
    ) {
      throw new Error(
        "The outgoing employee must be Resigned with a recorded last working date."
      )
    }
    const employeeCode = input.employeeCode?.trim() || replacement?.employee_code
    if (!employeeCode || !/^\d+$/.test(employeeCode)) {
      throw new Error(
        "A numeric Employee ID is required for the replacement to join."
      )
    }
    if (targets.some((post) => post.employee_code === employeeCode)) {
      throw new Error(
        "The replacement must have a different Employee ID from the outgoing employee."
      )
    }
    const employeeName = directJoin ? input.employeeName?.trim() : replacement?.employee_name
    if (!employeeName) throw new Error("Replacement employee name is required.")
    const joiningDate = input.joiningDate?.trim() || null
    if (directJoin) {
      const date = new Date(`${joiningDate}T00:00:00Z`)
      if (!joiningDate || !/^\d{4}-\d{2}-\d{2}$/.test(joiningDate) || Number.isNaN(date.getTime()) ||
          date.toISOString().slice(0, 10) !== joiningDate) {
        throw new Error("Enter a valid actual joining date.")
      }
      await client.query(
        `INSERT INTO recruitment.post_replacements
           (organization_id, post_id, employee_name, employee_code, outgoing_assignment, status,
            completed_at, created_by_user_id, updated_by_user_id)
         SELECT $1, id, $3, $4, to_jsonb(post), 'Joined', now(), $5, $5
         FROM recruitment.posts post WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
        [input.organizationId, ids, employeeName, employeeCode, input.actorUserId ?? null]
      )
    } else {
      // Freeze the outgoing assignment before publishing the incoming employee.
      await client.query(
        `UPDATE recruitment.post_replacements replacement
       SET outgoing_assignment = to_jsonb(post), employee_code = $3,
           status = 'Joined', completed_at = now(), updated_by_user_id = $4
       FROM recruitment.posts post
       WHERE replacement.post_id = post.id AND replacement.organization_id = $1
         AND post.organization_id = $1 AND post.id = ANY($2::uuid[])
         AND replacement.status = 'Pending'`,
        [input.organizationId, ids, employeeCode, input.actorUserId ?? null]
      )
    }
    await client.query(
      `UPDATE recruitment.posts
       SET employee_name = $1, employee_code = $2, status = $3,
           joining_date = COALESCE(migration.try_date($8), current_date), last_working_date = NULL,
           appointed_application_id = $7, updated_by_user_id = $4,
           updated_at = now(), row_version = row_version + 1
       WHERE organization_id = $5 AND id = ANY($6::uuid[])`,
      [
        employeeName,
        employeeCode,
        "Occupied",
        input.actorUserId ?? null,
        input.organizationId,
        ids,
        replacement?.application_id ?? null,
        joiningDate,
      ]
    )
    return "replacement_joined"
  }
  if (event === "Cancel Replacement" && replacement) {
    if (replacement.application_id) {
      throw new Error(
        "Record Did Not Join in the candidate's job to cancel this appointment and reopen the job."
      )
    }
    await client.query(
      `UPDATE recruitment.post_replacements SET status = 'Cancelled',
         completed_at = now(), updated_by_user_id = $3
       WHERE organization_id = $1 AND post_id = ANY($2::uuid[]) AND status = 'Pending'`,
      [input.organizationId, ids, input.actorUserId ?? null]
    )
    return "replacement_cancelled"
  }

  if (pending.rows.length && event !== "Resigned" && event !== "Resigned Without Process") {
    throw new Error(
      "A replacement is already pending. Confirm their joining or cancel the replacement first."
    )
  }
  if (
    event !== "Appointed" ||
    !targets.every((post) => post.status === "Resigned")
  )
    return null
  const employeeName = input.employeeName?.trim()
  const employeeCode = input.employeeCode?.trim() || null
  if (!employeeName) throw new Error("Replacement employee name is required.")
  if (employeeCode && !/^\d+$/.test(employeeCode))
    throw new Error("Employee ID must contain numbers only.")
  if (
    targets.some(
      (post) =>
        post.employee_name?.trim().toLowerCase() ===
          employeeName.toLowerCase() ||
        (employeeCode && post.employee_code === employeeCode)
    )
  )
    throw new Error(
      "Enter the incoming employee's details, not the resigning employee's details."
    )
  for (const post of targets) {
    await client.query(
      `INSERT INTO recruitment.post_replacements
         (organization_id, post_id, employee_name, employee_code, outgoing_assignment, created_by_user_id, application_id)
       SELECT $1, id, $3, $4, to_jsonb(post), $5, $6
       FROM recruitment.posts post WHERE id = $2 AND organization_id = $1`,
      [
        input.organizationId,
        post.id,
        employeeName,
        employeeCode,
        input.actorUserId ?? null,
        input.appointedApplicationId ?? null,
      ]
    )
  }
  return "replacement_appointed"
}
