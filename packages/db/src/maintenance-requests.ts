import type { PoolClient, QueryResultRow } from "pg"

import {
  maintenanceManagerTransition,
  maintenanceTradeTransition,
  type MaintenanceCategory,
  type MaintenancePriority,
  type MaintenanceRequestStatus,
} from "./maintenance-request-domain"
import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"

export type MaintenanceRequestPhoto = {
  fileName: string
  url: string
}

export type MaintenanceRequestRow = {
  approvedAt: string | null
  approvedByName: string | null
  assigneeName: string | null
  completedAt: string | null
  department: string
  finalCategory: MaintenanceCategory | null
  finalPriority: MaintenancePriority | null
  id: string
  location: string
  managerNote: string | null
  photos: MaintenanceRequestPhoto[]
  problemDescription: string
  requestedPriority: MaintenancePriority
  requesterName: string
  requesterUserId: string
  requestNumber: string
  startedAt: string | null
  status: MaintenanceRequestStatus
  submittedAt: string
  suggestedCategory: MaintenanceCategory
  updatedAt: string
}

type RequestRecord = QueryResultRow & MaintenanceRequestRow

function requiredText(value: unknown, label: string) {
  const result = String(value ?? "").trim()
  if (!result) throw new Error(`${label} is required.`)
  return result
}

async function requesterContextWithClient(
  client: Pick<PoolClient, "query">,
  input: { organizationId: string; userId: string }
) {
  const [account, departments] = await Promise.all([
    client.query<{ email: string; name: string }>(
      `SELECT email, name FROM identity.users WHERE id = $1`,
      [input.userId]
    ),
    client.query<{ department: string }>(
      `WITH linked_employee_codes AS (
         SELECT employee_code
         FROM identity.employee_links
         WHERE user_id = $1 AND organization_id = $2
         UNION
         SELECT employee_code
         FROM workforce.employees
         WHERE user_id = $1 AND organization_id = $2 AND active
       ), assigned_departments AS (
         SELECT department.name AS department
         FROM linked_employee_codes employee
         JOIN recruitment.posts post
           ON post.organization_id = $2
          AND lower(btrim(post.employee_code)) =
              lower(btrim(employee.employee_code))
         JOIN recruitment.departments department
           ON department.id = post.department_id AND department.active
         WHERE post.status = 'Occupied'
            OR (post.status = 'Appointed' AND post.joining_date <= current_date)
            OR (post.status = 'Resigned' AND post.last_working_date >= current_date)
         UNION
         SELECT employee.department
         FROM workforce.employees employee
         WHERE employee.user_id = $1
           AND employee.organization_id = $2
           AND employee.active
           AND nullif(btrim(employee.department), '') IS NOT NULL
       )
       SELECT DISTINCT btrim(department) AS department
       FROM assigned_departments
       WHERE nullif(btrim(department), '') IS NOT NULL
       ORDER BY department`,
      [input.userId, input.organizationId]
    ),
  ])
  const user = account.rows[0]
  if (!user) throw new Error("The signed-in user account was not found.")
  if (!departments.rows.length) {
    throw new Error(
      "Your account must be linked to one active Employee Master department."
    )
  }
  if (departments.rows.length > 1) {
    throw new Error(
      "Your account is linked to multiple departments; ask an administrator to correct Employee Master."
    )
  }
  return {
    department: departments.rows[0]!.department,
    requesterEmail: user.email,
    requesterName: user.name,
  }
}

const requestSelect = `
  SELECT request.id,
    'MR-' || lpad(request.request_number::text, 6, '0') AS "requestNumber",
    request.requester_user_id AS "requesterUserId",
    request.requester_name AS "requesterName",
    request.department,
    request.location,
    request.problem_description AS "problemDescription",
    request.suggested_category AS "suggestedCategory",
    request.requested_priority AS "requestedPriority",
    request.final_category AS "finalCategory",
    request.final_priority AS "finalPriority",
    request.status,
    request.manager_note AS "managerNote",
    approver.name AS "approvedByName",
    request.approved_at::text AS "approvedAt",
    assignee.name AS "assigneeName",
    request.started_at::text AS "startedAt",
    request.completed_at::text AS "completedAt",
    request.submitted_at::text AS "submittedAt",
    request.updated_at::text AS "updatedAt",
    COALESCE(photo_list.photos, '[]'::jsonb) AS photos
  FROM maintenance.requests request
  LEFT JOIN identity.users approver ON approver.id = request.approved_by_user_id
  LEFT JOIN identity.users assignee ON assignee.id = request.assigned_to_user_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object('fileName', file.file_name, 'url', object.public_url)
      ORDER BY link.created_at, link.id
    ) AS photos
    FROM core.file_links link
    JOIN core.files file ON file.id = link.file_id
    JOIN core.file_objects object ON object.id = file.physical_object_id
    WHERE link.organization_id = request.organization_id
      AND link.target_schema = 'maintenance'
      AND link.target_table = 'requests'
      AND link.target_id = request.id
      AND link.purpose LIKE 'request-photo:%'
      AND link.is_current
      AND file.lifecycle_state = 'current'
      AND object.lifecycle_state = 'available'
  ) photo_list ON true
`

export async function authorizeMaintenanceRequestPhotoTarget(
  client: PoolClient,
  input: {
    organizationId: string
    requestId: string
    requesterUserId: string
  },
  options: { requirePendingState: boolean }
) {
  const target = await client.query<{ id: string }>(
    `SELECT id
     FROM maintenance.requests
     WHERE id = $1 AND organization_id = $2 AND requester_user_id = $3
       AND ($4::boolean = false OR status = 'Pending Approval')
     FOR UPDATE`,
    [
      input.requestId,
      input.organizationId,
      input.requesterUserId,
      options.requirePendingState,
    ]
  )
  if (!target.rows[0]) {
    throw new Error("Maintenance request photo target was not found or locked.")
  }
}

export function createMaintenanceRequestRepository(
  options: RepositoryPoolOptions
) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async organizationIdForCode(code: string) {
      const result = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
        [requiredText(code, "Organization code")]
      )
      if (!result.rows[0]) throw new Error("Organization was not found.")
      return result.rows[0].id
    },

    async requesterContext(input: { organizationId: string; userId: string }) {
      return requesterContextWithClient(pool, input)
    },

    async submitRequest(input: {
      location: string
      organizationId: string
      problemDescription: string
      requestedPriority: MaintenancePriority
      requesterUserId: string
      suggestedCategory: MaintenanceCategory
    }) {
      return withTransaction(pool, async (client) => {
        const context = await requesterContextWithClient(client, {
          organizationId: input.organizationId,
          userId: input.requesterUserId,
        })
        const result = await client.query<{ id: string }>(
          `INSERT INTO maintenance.requests (
             organization_id, requester_user_id, requester_name, department,
             location, problem_description, suggested_category,
             requested_priority, updated_by_user_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $2)
           RETURNING id`,
          [
            input.organizationId,
            input.requesterUserId,
            context.requesterName,
            context.department,
            requiredText(input.location, "Location"),
            requiredText(input.problemDescription, "Problem description"),
            input.suggestedCategory,
            input.requestedPriority,
          ]
        )
        const requestId = result.rows[0]!.id
        await client.query(
          `INSERT INTO maintenance.request_events (
             organization_id, request_id, action, to_status, category,
             priority, actor_user_id
           ) VALUES ($1, $2, 'Submitted', 'Pending Approval', $3, $4, $5)`,
          [
            input.organizationId,
            requestId,
            input.suggestedCategory,
            input.requestedPriority,
            input.requesterUserId,
          ]
        )
        return { ...context, id: requestId }
      })
    },

    async listRequests(input: {
      organizationId: string
      scope:
        | { kind: "manager" }
        | { department: string; kind: "department" }
        | { kind: "trade"; trade: MaintenanceCategory }
    }): Promise<MaintenanceRequestRow[]> {
      const values: unknown[] = [input.organizationId]
      let scopeClause = ""
      if (input.scope.kind === "department") {
        values.push(input.scope.department)
        scopeClause =
          "AND lower(btrim(request.department)) = lower(btrim($2::text))"
      } else if (input.scope.kind === "trade") {
        values.push(input.scope.trade)
        scopeClause = `AND request.final_category = $2
          AND request.status IN ('Approved', 'In Progress', 'Completed')`
      }
      const result = await pool.query<RequestRecord>(
        `${requestSelect}
         WHERE request.organization_id = $1 ${scopeClause}
         ORDER BY
           CASE COALESCE(request.final_priority, request.requested_priority)
             WHEN 'Urgent' THEN 0 ELSE 1 END,
           request.submitted_at DESC, request.id DESC`,
        values
      )
      return result.rows
    },

    async reviewRequest(input: {
      action: "approve" | "reject" | "return"
      actorUserId: string
      category: MaintenanceCategory
      note?: string | null
      organizationId: string
      priority: MaintenancePriority
      requestId: string
    }) {
      return withTransaction(pool, async (client) => {
        const current = await client.query<{
          status: MaintenanceRequestStatus
        }>(
          `SELECT status FROM maintenance.requests
           WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
          [input.requestId, input.organizationId]
        )
        if (!current.rows[0])
          throw new Error("Maintenance request was not found.")
        const transition = maintenanceManagerTransition({
          action: input.action,
          category: input.category,
          priority: input.priority,
          status: current.rows[0].status,
        })
        await client.query(
          `UPDATE maintenance.requests
           SET final_category = $3, final_priority = $4, status = $5,
             manager_note = $6, approved_by_user_id = $7,
             approved_at = CASE WHEN $5 = 'Approved' THEN now() ELSE NULL END,
             updated_by_user_id = $7, updated_at = now(),
             row_version = row_version + 1
           WHERE id = $1 AND organization_id = $2`,
          [
            input.requestId,
            input.organizationId,
            transition.category,
            transition.priority,
            transition.status,
            input.note?.trim() || null,
            input.actorUserId,
          ]
        )
        await client.query(
          `INSERT INTO maintenance.request_events (
             organization_id, request_id, action, from_status, to_status,
             category, priority, note, actor_user_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            input.organizationId,
            input.requestId,
            input.action,
            current.rows[0].status,
            transition.status,
            transition.category,
            transition.priority,
            input.note?.trim() || null,
            input.actorUserId,
          ]
        )
      })
    },

    async updateTradeStatus(input: {
      action: "start" | "complete"
      actorUserId: string
      organizationId: string
      requestId: string
      trade: MaintenanceCategory
    }) {
      return withTransaction(pool, async (client) => {
        const current = await client.query<{
          final_category: MaintenanceCategory | null
          status: MaintenanceRequestStatus
        }>(
          `SELECT final_category, status FROM maintenance.requests
           WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
          [input.requestId, input.organizationId]
        )
        const row = current.rows[0]
        if (!row || row.final_category !== input.trade) {
          throw new Error("Maintenance request is not assigned to this trade.")
        }
        const status = maintenanceTradeTransition(row.status, input.action)
        await client.query(
          `UPDATE maintenance.requests
           SET status = $3,
             assigned_to_user_id = COALESCE(assigned_to_user_id, $4),
             started_at = CASE WHEN $3 = 'In Progress'
               THEN COALESCE(started_at, now()) ELSE started_at END,
             completed_at = CASE WHEN $3 = 'Completed' THEN now()
               ELSE completed_at END,
             updated_by_user_id = $4, updated_at = now(),
             row_version = row_version + 1
           WHERE id = $1 AND organization_id = $2`,
          [input.requestId, input.organizationId, status, input.actorUserId]
        )
        await client.query(
          `INSERT INTO maintenance.request_events (
             organization_id, request_id, action, from_status, to_status,
             category, actor_user_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            input.organizationId,
            input.requestId,
            input.action,
            row.status,
            status,
            input.trade,
            input.actorUserId,
          ]
        )
      })
    },

    async closeRequest(input: {
      actorUserId: string
      organizationId: string
      requestId: string
    }) {
      return withTransaction(pool, async (client) => {
        const result = await client.query<{ status: MaintenanceRequestStatus }>(
          `UPDATE maintenance.requests
           SET status = 'Closed', closed_at = now(), updated_at = now(),
             updated_by_user_id = $3, row_version = row_version + 1
           WHERE id = $1 AND organization_id = $2 AND status = 'Completed'
           RETURNING status`,
          [input.requestId, input.organizationId, input.actorUserId]
        )
        if (!result.rows[0]) {
          throw new Error("Only completed maintenance requests can be closed.")
        }
        await client.query(
          `INSERT INTO maintenance.request_events (
             organization_id, request_id, action, from_status, to_status,
             actor_user_id
           ) VALUES ($1, $2, 'close', 'Completed', 'Closed', $3)`,
          [input.organizationId, input.requestId, input.actorUserId]
        )
      })
    },
  }
}
