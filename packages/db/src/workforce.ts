import { randomUUID } from "node:crypto"

import { Pool, type PoolClient } from "pg"

type RepositoryOptions = {
  connectionString: string
}

function requiredText(value: unknown, label: string) {
  const result = String(value ?? "").trim()
  if (!result) throw new Error(`${label} is required.`)
  return result
}

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await operation(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

async function employeeIdFor(
  client: PoolClient,
  organizationId: string,
  employeeCode: string,
  label = "Employee"
) {
  const result = await client.query<{ id: string }>(
    `
      SELECT id FROM workforce.employees
      WHERE organization_id = $1 AND lower(employee_code) = lower($2)
    `,
    [organizationId, requiredText(employeeCode, label)]
  )
  if (!result.rows[0]) throw new Error(`${label} was not found.`)
  return result.rows[0].id
}

export function createWorkforceRepository({
  connectionString,
}: RepositoryOptions) {
  const pool = new Pool({ connectionString })

  return {
    async close() {
      await pool.end()
    },

    async organizationIdForCode(code: string) {
      const result = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
        [requiredText(code, "Organization code")]
      )
      if (!result.rows[0]) throw new Error("Organization was not found.")
      return result.rows[0].id
    },

    async upsertEmployee(input: {
      actorUserId?: string | null
      active?: boolean
      department?: string | null
      designation?: string | null
      employeeCode: string
      joinedOn?: string | null
      leftOn?: string | null
      name: string
      organizationId: string
      payload?: Record<string, unknown>
    }) {
      const result = await pool.query<{ id: string }>(
        `
          INSERT INTO workforce.employees (
            organization_id, employee_code, name, department, designation,
            active, joined_on, left_on, created_by_user_id,
            updated_by_user_id, source_system, source_table, source_id,
            source_payload
          )
          VALUES ($1, $2, $3, $4, $5, $6, migration.try_date($7),
            migration.try_date($8), $9, $9, 'mrm-dashboard', 'employee',
            $10, $11)
          ON CONFLICT (organization_id, lower(employee_code))
          DO UPDATE SET name = EXCLUDED.name,
            department = EXCLUDED.department,
            designation = EXCLUDED.designation,
            active = EXCLUDED.active,
            joined_on = EXCLUDED.joined_on,
            left_on = EXCLUDED.left_on,
            updated_by_user_id = EXCLUDED.updated_by_user_id,
            source_payload = EXCLUDED.source_payload,
            updated_at = now(), row_version = workforce.employees.row_version + 1
          RETURNING id
        `,
        [
          input.organizationId,
          requiredText(input.employeeCode, "Employee code"),
          requiredText(input.name, "Employee name"),
          input.department ?? null,
          input.designation ?? null,
          input.active ?? true,
          input.joinedOn ?? null,
          input.leftOn ?? null,
          input.actorUserId ?? null,
          randomUUID(),
          input.payload ?? {},
        ]
      )
      return result.rows[0]!
    },

    async recordAttendance(input: {
      actorUserId?: string | null
      attendanceDate: string
      clockIn?: string | null
      clockOut?: string | null
      employeeCode: string
      legacyActor?: string | null
      organizationId: string
      payload: Record<string, unknown>
      shift?: string | null
      status: string
    }) {
      return transaction(pool, async (client) => {
        const employeeId = await employeeIdFor(
          client,
          input.organizationId,
          input.employeeCode
        )
        const shift = String(input.shift ?? "").trim()
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('workforce.attendance'), hashtext($1))",
          [
            `${employeeId}|${requiredText(input.attendanceDate, "Attendance date")}|${shift}`,
          ]
        )
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO workforce.attendance_records (
              organization_id, employee_id, attendance_date, shift, status,
              clock_in, clock_out, recorded_by_user_id, legacy_actor,
              source_system, source_table, source_id, source_payload
            )
            VALUES ($1, $2, COALESCE(migration.try_date($3), current_date),
              NULLIF($4, ''), $5, NULLIF($6, '')::time,
              NULLIF($7, '')::time, $8, $9, 'mrm-dashboard',
              'attendanceRecords', $10, $11)
            ON CONFLICT (employee_id, attendance_date, shift)
            DO UPDATE SET status = EXCLUDED.status,
              clock_in = EXCLUDED.clock_in,
              clock_out = EXCLUDED.clock_out,
              recorded_at = now(),
              recorded_by_user_id = EXCLUDED.recorded_by_user_id,
              legacy_actor = EXCLUDED.legacy_actor,
              source_payload = EXCLUDED.source_payload
            RETURNING id
          `,
          [
            input.organizationId,
            employeeId,
            input.attendanceDate,
            shift,
            requiredText(input.status, "Attendance status"),
            input.clockIn ?? null,
            input.clockOut ?? null,
            input.actorUserId ?? null,
            input.legacyActor ?? null,
            randomUUID(),
            input.payload,
          ]
        )
        await client.query(
          `
            INSERT INTO workforce.attendance_record_events (
              organization_id, attendance_record_id, status, actor_user_id,
              legacy_actor, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            input.organizationId,
            result.rows[0]!.id,
            input.status,
            input.actorUserId ?? null,
            input.legacyActor ?? null,
            input.payload,
          ]
        )
        return result.rows[0]!
      })
    },

    async recordTraining(input: {
      actorUserId?: string | null
      durationMinutes?: number | null
      employeeCode: string
      legacyTrainer?: string | null
      organizationId: string
      payload: Record<string, unknown>
      result?: string | null
      topic: string
      trainerEmployeeCode?: string | null
      trainingDate: string
    }) {
      return transaction(pool, async (client) => {
        const employeeId = await employeeIdFor(
          client,
          input.organizationId,
          input.employeeCode
        )
        const trainerEmployeeId = input.trainerEmployeeCode
          ? await employeeIdFor(
              client,
              input.organizationId,
              input.trainerEmployeeCode,
              "Trainer"
            )
          : null
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO workforce.training_records (
              organization_id, employee_id, trainer_employee_id, topic,
              training_date, duration_minutes, result, recorded_by_user_id,
              legacy_trainer, source_system, source_table, source_id,
              source_payload
            )
            VALUES ($1, $2, $3, $4,
              COALESCE(migration.try_date($5), current_date), $6, $7, $8,
              $9, 'mrm-dashboard', 'trainingRecords', $10, $11)
            RETURNING id
          `,
          [
            input.organizationId,
            employeeId,
            trainerEmployeeId,
            requiredText(input.topic, "Training topic"),
            input.trainingDate,
            input.durationMinutes ?? null,
            input.result ?? null,
            input.actorUserId ?? null,
            input.legacyTrainer ?? null,
            randomUUID(),
            input.payload,
          ]
        )
        return result.rows[0]!
      })
    },
  }
}
