import type { PoolClient } from "pg"

export type ReplacementAppointment = {
  id: string
  employeeName: string
  employeeCode: string | null
  status: "Pending" | "Joined" | "Cancelled"
  appointedAt: string
  completedAt: string | null
  outgoingEmployeeName: string | null
  outgoingEmployeeCode: string | null
  outgoingLastWorkingDate: string | null
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
  },
  targets: readonly AssignmentTarget[]
) {
  const ids = targets.map((post) => post.id)
  const event = input.employeeEvent || "Appointed"
  const pending = await client.query<{
    id: string
    post_id: string
    employee_name: string
    employee_code: string | null
  }>(
    `SELECT id, post_id, employee_name, employee_code
     FROM recruitment.post_replacements
     WHERE organization_id = $1 AND post_id = ANY($2::uuid[]) AND status = 'Pending'
     ORDER BY post_id FOR UPDATE`,
    [input.organizationId, ids]
  )

  if (event === "Cancel Replacement" || event === "Replacement Joined") {
    if (pending.rows.length !== targets.length) {
      throw new Error(
        "Every post must have the same pending replacement before this action."
      )
    }
    const replacement = pending.rows[0]!
    if (
      pending.rows.some(
        (row) =>
          row.employee_name !== replacement.employee_name ||
          row.employee_code !== replacement.employee_code
      )
    ) {
      throw new Error(
        "Combined posts have different pending replacements. Resolve them separately first."
      )
    }
    if (event === "Replacement Joined") {
      if (
        targets.some((post) => post.status !== "Resigned" || !post.can_replace)
      ) {
        throw new Error(
          "Confirm replacement joining only after the outgoing employee's last working date."
        )
      }
      const employeeCode =
        input.employeeCode?.trim() || replacement.employee_code
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
      await client.query(
        `UPDATE recruitment.posts
         SET employee_name = $1, employee_code = $2, status = $3,
             joining_date = current_date, last_working_date = NULL,
             appointed_application_id = NULL, updated_by_user_id = $4,
             updated_at = now(), row_version = row_version + 1
         WHERE organization_id = $5 AND id = ANY($6::uuid[])`,
        [
          replacement.employee_name,
          employeeCode,
          "Occupied",
          input.actorUserId ?? null,
          input.organizationId,
          ids,
        ]
      )
      return "replacement_joined"
    }
    await client.query(
      `UPDATE recruitment.post_replacements SET status = 'Cancelled',
         completed_at = now(), updated_by_user_id = $3
       WHERE organization_id = $1 AND post_id = ANY($2::uuid[]) AND status = 'Pending'`,
      [input.organizationId, ids, input.actorUserId ?? null]
    )
    return "replacement_cancelled"
  }

  if (pending.rows.length && event !== "Resigned") {
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
         (organization_id, post_id, employee_name, employee_code, outgoing_assignment, created_by_user_id)
       SELECT $1, id, $3, $4, to_jsonb(post), $5
       FROM recruitment.posts post WHERE id = $2 AND organization_id = $1`,
      [
        input.organizationId,
        post.id,
        employeeName,
        employeeCode,
        input.actorUserId ?? null,
      ]
    )
  }
  return "replacement_appointed"
}
