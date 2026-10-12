import type { PoolClient } from "pg"
import { createBrandingRepository } from "./branding"
import { createMaintenanceRepository } from "./maintenance"
import { createStoreRepository } from "./store"
import { listIsoDocumentStaff } from "./iso-document-staff"
import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import {
  defaultIsoWorkflow,
  isoDate,
  isoId,
  isoText,
  isoToday,
  IsoWorkflowError,
  type IsoModule,
  type IsoTaskKind,
  type IsoTaskStatus,
} from "./iso-workflow-domain"

export type IsoWorkflowAccess = {
  organizationId: string
  userId: string
  userName: string
  canManage: boolean
  canVerify: boolean
  canAssignDepartment: boolean
  departments: string[]
}
export type IsoWorkflowDocument = {
  id: string
  title: string
  department: string
  ownerUserId: string | null
  ownerName: string | null
  module: IsoModule | null
  text: string
  version: number
  metadataVersion: number
  dueOn: string | null
  number: string | null
  released: boolean
}
export type IsoPendingTask = {
  key: string
  kind: IsoTaskKind
  sourceId: string
  module: IsoModule | null
  reference: string
  title: string
  department: string
  ownerUserId: string | null
  ownerName: string | null
  dueOn: string | null
  status: IsoTaskStatus
  version: number
  href: string
  documentId: string
  documentTitle: string
  controlId: string | null
  sourceCompleted: boolean
  canAssign: boolean
  canWork: boolean
  native: boolean
}
type SourceTask = Omit<
  IsoPendingTask,
  | "documentId"
  | "documentTitle"
  | "ownerName"
  | "canAssign"
  | "canWork"
  | "native"
> & { documentId: string | null; documentTitle: string | null; native: boolean }
type ActionRow = {
  id: string
  documentId: string
  sourceKey: string | null
  sourceHref: string
  title: string
  expectedResult: string
  department: string
  ownerUserId: string | null
  dueOn: string | null
  status: "Open" | "In Progress" | "Completed" | "Closed"
  workDone: string
  evidence: string
  qaFindings: string
  workflowSnapshot: string
  workflowVersion: number
  version: number
}
const actionColumns = `id,document_id AS "documentId",source_key AS "sourceKey",source_href AS "sourceHref",title,expected_result AS "expectedResult",department,owner_user_id AS "ownerUserId",due_on::text AS "dueOn",status,work_done AS "workDone",evidence,qa_findings AS "qaFindings",workflow_snapshot AS "workflowSnapshot",workflow_version AS "workflowVersion",version`
const nativeKinds = new Set<IsoTaskKind>([
  "analysis",
  "analysis-review",
  "meeting",
  "meeting-action",
  "interested-party",
  "sipoc",
  "satisfaction",
  "document",
])
function departmentAllowed(access: IsoWorkflowAccess, department: string) {
  return (
    access.canManage ||
    (access.canAssignDepartment &&
      access.departments.some(
        (value) =>
          value.trim().toLowerCase() === department.trim().toLowerCase()
      ))
  )
}
function visible(
  access: IsoWorkflowAccess,
  row: { department: string; ownerUserId: string | null }
) {
  return (
    access.canManage ||
    access.canVerify ||
    row.ownerUserId === access.userId ||
    departmentAllowed(access, row.department)
  )
}
function checkVersion(actual: number, expected: number) {
  if (actual !== expected)
    throw new IsoWorkflowError("This record changed. Refresh before saving.")
}

export function createIsoWorkflowRepository(options: RepositoryPoolOptions) {
  const { pool, close } = repositoryPool(options)
  async function documents(organizationId: string) {
    return (
      await pool.query<IsoWorkflowDocument>(
        `SELECT d.id,COALESCE(NULLIF(d.workflow_title,''),r.content->>'title','Document') AS title,
      COALESCE(NULLIF(d.workflow_department,''),r.content->>'department','') AS department,d.responsible_user_id AS "ownerUserId",u.name AS "ownerName",
      d.iso_module AS module,d.workflow_text AS text,d.workflow_version AS version,d.metadata_version AS "metadataVersion",d.work_target_on::text AS "dueOn",d.number,
      EXISTS(SELECT 1 FROM branding.revisions WHERE document_id=d.id AND state='issued') AS released
      FROM branding.documents d LEFT JOIN identity.users u ON u.id=d.responsible_user_id LEFT JOIN LATERAL(SELECT content FROM branding.revisions WHERE document_id=d.id ORDER BY (state='issued') DESC,revision DESC LIMIT 1) r ON true
      WHERE d.organization_id=$1 AND d.type<>'notice' ORDER BY title,d.id`,
        [organizationId]
      )
    ).rows
  }
  async function audit(
    client: PoolClient,
    access: IsoWorkflowAccess,
    table: string,
    id: string,
    operation: string,
    reason: string,
    before: unknown,
    after: unknown
  ) {
    await client.query(
      `INSERT INTO audit.events(organization_id,event_type,target_schema,target_table,target_id,actor_user_id,reason,before_state,after_state,metadata,source_system,source_table,source_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'mrm-dashboard','iso-workflow',gen_random_uuid()::text)`,
      [
        access.organizationId,
        `iso_workflow.${operation}`,
        table === "documents" ? "branding" : "document_control",
        table,
        id,
        access.userId,
        reason,
        before,
        after,
        { actorName: access.userName },
      ]
    )
  }
  async function staff(organizationId: string) {
    const [people, departments] = await Promise.all([
      listIsoDocumentStaff(pool, organizationId),
      pool.query<{ id: string; departments: string[] }>(
        `SELECT u.id,COALESCE(array_agg(DISTINCT dep.name) FILTER(WHERE dep.name IS NOT NULL),'{}') AS departments
      FROM identity.users u LEFT JOIN identity.employee_links link ON link.user_id=u.id AND link.organization_id=$1
      LEFT JOIN recruitment.posts p ON p.organization_id=$1 AND lower(trim(p.employee_code))=lower(trim(link.employee_code))
        AND (p.status='Occupied' OR (p.status='Appointed' AND p.joining_date<=current_date) OR (p.status='Resigned' AND p.last_working_date>=current_date))
      LEFT JOIN recruitment.departments dep ON dep.id=p.department_id AND dep.active GROUP BY u.id`,
        [organizationId]
      ),
    ])
    const employees = (
      await pool.query<{ userId: string; department: string }>(
        "SELECT user_id AS \"userId\",department FROM workforce.employees WHERE organization_id=$1 AND active AND user_id IS NOT NULL AND nullif(trim(department),'') IS NOT NULL",
        [organizationId]
      )
    ).rows
    return people.map((person) => ({
      ...person,
      departments: [
        ...new Set([
          ...(departments.rows.find((row) => row.id === person.id)
            ?.departments ?? []),
          ...employees
            .filter((row) => row.userId === person.id)
            .map((row) => row.department),
        ]),
      ],
    }))
  }
  async function validateAssignment(
    access: IsoWorkflowAccess,
    department: string,
    owner: string | null,
    existingDepartment: string,
    currentOwner: string | null = null
  ) {
    if (!departmentAllowed(access, existingDepartment))
      throw new IsoWorkflowError(
        "Assign work only in your own department. QA allocates unassigned work."
      )
    if (
      !access.canManage &&
      existingDepartment.trim().toLowerCase() !==
        department.trim().toLowerCase()
    )
      throw new IsoWorkflowError(
        "Only QA may change the responsible department."
      )
    if (
      !department ||
      !(
        await pool.query(
          "SELECT 1 FROM recruitment.departments WHERE organization_id=$1 AND active AND lower(trim(name))=lower(trim($2))",
          [access.organizationId, department]
        )
      ).rowCount
    )
      throw new IsoWorkflowError("Select an active department.")
    const person = (await staff(access.organizationId)).find(
      (row) => row.id === owner
    )
    if (owner && !person)
      throw new IsoWorkflowError("Select an active staff account.")
    if (
      owner &&
      !access.canManage &&
      owner !== currentOwner &&
      !person?.departments.some(
        (value) => value.toLowerCase() === department.toLowerCase()
      )
    )
      throw new IsoWorkflowError("Assign a person from your department.")
  }
  async function action(
    id: string,
    organizationId: string,
    client = pool as Pick<PoolClient, "query">,
    lock = false
  ) {
    return (
      await client.query<ActionRow>(
        `SELECT ${actionColumns} FROM document_control.workflow_actions WHERE organization_id=$1 AND id=$2 ${lock ? "FOR UPDATE" : ""}`,
        [organizationId, id]
      )
    ).rows[0]
  }
  async function list(
    access: IsoWorkflowAccess,
    includeClosed = false
  ): Promise<IsoPendingTask[]> {
    const today = isoToday()
    const [docs, people, source, controls] = await Promise.all([
      documents(access.organizationId),
      staff(access.organizationId),
      pool.query<SourceTask>(
        `
      SELECT 'analysis:'||r.id AS key,'analysis'::text AS kind,r.id::text AS "sourceId",lower(r.kind) AS module,r.kind||'-'||lpad(r.record_number::text,5,'0') AS reference,
        r.description AS title,r.department,r.owner_user_id AS "ownerUserId",r.due_on::text AS "dueOn",CASE WHEN r.status='Completed' THEN 'Awaiting QA' ELSE r.status END AS status,r.version,
        '/iso-document/analysis/'||lower(r.kind)||'/'||r.id AS href,NULL::uuid AS "documentId",NULL::text AS "documentTitle",NULL::uuid AS "controlId",r.completed_at IS NOT NULL AS "sourceCompleted",true AS native
      FROM document_control.analysis_records r WHERE r.organization_id=$1 AND ($3 OR r.status<>'Closed') AND r.risk_state<>'Retired'
      UNION ALL SELECT 'analysis-review:'||r.id,'analysis-review',r.id::text,lower(r.kind),r.kind||'-'||lpad(r.record_number::text,5,'0'),'Review: '||r.description,r.department,r.owner_user_id,r.next_review_on::text,'Review due',r.version,
        '/iso-document/analysis/'||lower(r.kind)||'/'||r.id,NULL,NULL,NULL,false,true FROM document_control.analysis_records r WHERE r.organization_id=$1 AND r.status='Closed' AND r.risk_state<>'Retired' AND r.next_review_on <=$2::date
      UNION ALL SELECT 'meeting-action:'||a.id,'meeting-action',a.id::text,'management-review','MRM-A-'||lpad(a.record_number::text,4,'0'),a.description,a.department,a.owner_user_id,a.due_on::text,CASE WHEN a.status='Completed' THEN 'Awaiting QA' ELSE a.status END,a.version,
        '/iso-document/management-review/actions/'||a.id,NULL,NULL,NULL,a.completed_at IS NOT NULL,true FROM document_control.management_review_actions a WHERE a.organization_id=$1 AND ($3 OR a.status<>'Closed')
      UNION ALL SELECT 'meeting:'||m.id,'meeting',m.id::text,'management-review','MRM-'||lpad(m.record_number::text,4,'0'),'Prepare / approve minutes: '||m.title,m.work_department,m.owner_user_id,m.work_target_on::text,CASE WHEN m.status='For Approval' THEN 'Awaiting QA' ELSE 'Open' END,m.version,
        '/iso-document/management-review/'||m.id,NULL,NULL,NULL,false,true FROM document_control.management_reviews m WHERE m.organization_id=$1 AND m.status<>'Approved'
      UNION ALL SELECT 'interested-party:'||r.id,'interested-party',r.id::text,'interested-parties','IPR-'||lpad(r.record_number::text,4,'0'),CASE WHEN r.lifecycle='Draft' THEN 'Prepare plan: ' ELSE 'Monitor / follow up: ' END||r.party_group||' - '||r.requirement,r.department,r.owner_user_id,
        COALESCE(r.work_target_on,v.follow_up_due_on,r.next_review_on)::text,CASE WHEN p.id IS NOT NULL THEN 'Awaiting QA' WHEN r.lifecycle='Active' AND r.next_review_on <= $2::date THEN 'Review due' ELSE 'Open' END,r.version,
        '/iso-document/interested-parties/'||r.id,NULL,NULL,NULL,false,true FROM document_control.interested_party_requirements r
        LEFT JOIN document_control.interested_party_monitoring v ON v.id=r.last_verified_review_id LEFT JOIN document_control.interested_party_monitoring p ON p.requirement_id=r.id AND p.status='Submitted'
        WHERE r.organization_id=$1 AND r.lifecycle<>'Inactive' AND (r.lifecycle='Draft' OR p.id IS NOT NULL OR v.id IS NULL OR v.outcome<>'Met' OR v.plan_revision<>r.plan_revision OR r.next_review_on <=$2::date)
      UNION ALL SELECT 'sipoc:'||m.id,'sipoc',m.id::text,'sipoc','SIPOC-'||m.record_number,CASE WHEN m.status='Approved' THEN 'Review process map: ' ELSE 'Prepare / approve map: ' END||(m.fields->>'name'),COALESCE(m.fields->>'department',''),(m.fields->>'ownerUserId')::uuid,
        COALESCE(m.work_target_on::text,CASE WHEN m.status='Approved' THEN approved.fields->>'nextReviewOn' END),CASE WHEN m.status='Submitted' THEN 'Awaiting QA' WHEN m.status='Approved' THEN 'Review due' ELSE 'Open' END,m.version,
        '/iso-document/sipoc/'||m.id,NULL,NULL,NULL,false,true FROM document_control.sipoc_maps m LEFT JOIN document_control.sipoc_revisions approved ON approved.map_id=m.id AND approved.revision=m.approved_revision
        WHERE m.organization_id=$1 AND (m.status<>'Approved' OR (approved.fields->>'nextReviewOn')::date <=$2::date)
      UNION ALL SELECT 'satisfaction:'||r.id,'satisfaction',r.id::text,'customer-satisfaction','CS-'||r.record_number,CASE WHEN r.status='Approved' THEN 'Review customer feedback: ' ELSE 'Prepare / approve report: ' END||(r.fields->>'title'),r.work_department,(r.fields->>'ownerUserId')::uuid,
        COALESCE(r.work_target_on::text,CASE WHEN r.status='Approved' THEN r.fields->>'nextReviewOn' END),CASE WHEN r.status='Submitted' THEN 'Awaiting QA' WHEN r.status='Approved' THEN 'Review due' ELSE 'Open' END,r.version,
        '/iso-document/customer-satisfaction/'||r.id,NULL,NULL,NULL,false,true FROM document_control.customer_satisfaction_reports r WHERE r.organization_id=$1 AND (r.status<>'Approved' OR (r.fields->>'nextReviewOn')::date <=$2::date)
      UNION ALL SELECT 'document:'||d.id,'document',d.id::text,d.iso_module,COALESCE(d.number,'Document'),CASE WHEN revision.id IS NULL THEN 'Assign document owner: ' ELSE 'Prepare / release: ' END||COALESCE(NULLIF(d.workflow_title,''),revision.content->>'title','Document'),
        COALESCE(NULLIF(d.workflow_department,''),revision.content->>'department',''),d.responsible_user_id,d.work_target_on::text,CASE WHEN revision.workflow_state='pending-approval' THEN 'Awaiting Department Approval' WHEN revision.workflow_state='approved' THEN 'Awaiting QA' ELSE 'Open' END,d.metadata_version,
        CASE WHEN revision.id IS NULL THEN '/iso-document/documents/'||d.id||'/workflow' ELSE '/iso-document/documents/'||d.id END,d.id,COALESCE(NULLIF(d.workflow_title,''),revision.content->>'title','Document'),NULL,false,true
        FROM branding.documents d LEFT JOIN branding.revisions revision ON revision.document_id=d.id AND revision.state='draft'
        WHERE d.organization_id=$1 AND d.type<>'notice' AND (revision.id IS NOT NULL OR (d.iso_module IS NOT NULL AND (d.responsible_user_id IS NULL OR d.workflow_text='')))
      `,
        [access.organizationId, today, includeClosed]
      ),
      pool.query<ActionRow>(
        `SELECT ${actionColumns} FROM document_control.workflow_actions WHERE organization_id=$1`,
        [access.organizationId]
      ),
    ])
    const rows = source.rows
    const obligations = (
      await pool.query<{
        documentId: string
        kind: "document-review" | "record-check"
        dueOn: string
        period: string
      }>(
        `
        WITH base AS(SELECT d.*,r.issued_at,(SELECT max(completed_at) FROM document_control.monitoring_confirmations WHERE document_id=d.id AND obligation_type='document-review') AS reviewed,
          (SELECT max(completed_at) FROM document_control.monitoring_confirmations WHERE document_id=d.id AND obligation_type='data-record') AS recorded FROM branding.documents d
          JOIN LATERAL(SELECT issued_at FROM branding.revisions WHERE document_id=d.id AND state='issued' ORDER BY revision DESC LIMIT 1) r ON true WHERE d.organization_id=$1 AND d.type<>'notice' AND d.use_status='in-use')
        SELECT id AS "documentId",'document-review' AS kind,(COALESCE(reviewed,issued_at)+make_interval(months=>review_cycle_months))::date::text AS "dueOn",COALESCE(reviewed,issued_at)::text AS period FROM base WHERE review_cycle_months IS NOT NULL
        UNION ALL SELECT id,'record-check',(COALESCE(recorded,issued_at)+make_interval(days=>data_frequency_interval_days))::date::text,COALESCE(recorded,issued_at)::text FROM base WHERE data_frequency_type='scheduled-interval' AND data_frequency_interval_days IS NOT NULL`,
        [access.organizationId]
      )
    ).rows
    for (const obligation of obligations) {
      const doc = docs.find((row) => row.id === obligation.documentId)
      if (doc && obligation.dueOn <= today)
        rows.push({
          key: `${obligation.kind}:${doc.id}:${obligation.period}`,
          kind: obligation.kind,
          sourceId: doc.id,
          module: doc.module,
          reference: doc.number ?? "Document",
          title: `${obligation.kind === "document-review" ? "Review document" : "Confirm record activity"}: ${doc.title}`,
          department: doc.department,
          ownerUserId: doc.ownerUserId,
          dueOn: obligation.dueOn,
          status: "Review due",
          version: 0,
          href: `/iso-document/documents/${doc.id}`,
          documentId: doc.id,
          documentTitle: doc.title,
          controlId: null,
          sourceCompleted: true,
          native: false,
        })
    }
    // Operational execution stays in its source. ISO work adds assignment/evidence/QA verification.
    const maintenance = createMaintenanceRepository({ pool }),
      store = createStoreRepository({ pool })
    const [machines, assets, calibration] = await Promise.all([
      maintenance.listMachineMaintenancePlan(
        access.organizationId,
        "1900-01-01",
        "9999-12-31"
      ),
      maintenance.listAssetMaintenancePlan(
        access.organizationId,
        "1900-01-01",
        "9999-12-31"
      ),
      store.listCalibrationPlan(
        access.organizationId,
        "1900-01-01",
        "9999-12-31"
      ),
    ])
    for (const row of [
      ...machines.map((row) => ({
        ...row,
        kind: "maintenance" as const,
        name: row.machineNumber,
        done: row.status === "Completed",
      })),
      ...assets.map((row) => ({
        ...row,
        kind: "asset-maintenance" as const,
        name: row.assetCode,
        done: row.status === "Completed",
      })),
    ]) {
      const key = `${row.kind}:${row.scheduleId}:${row.dueOn}`,
        doc = docs.find((doc) => doc.module === "maintenance")
      if (
        !doc ||
        (row.done &&
          !controls.rows.some((control) => control.sourceKey === key))
      )
        continue
      rows.push({
        key,
        kind: row.kind,
        sourceId: row.id,
        module: "maintenance",
        reference: row.name,
        title: `${row.maintenance}: ${row.name}`,
        department: doc.department,
        ownerUserId: null,
        dueOn: row.dueOn,
        status: "Open",
        version: 0,
        href: row.done
          ? `/iso-document/machine-maintenance-report/${row.kind === "maintenance" ? "machine" : "asset"}/${row.kind === "maintenance" ? row.id : (assets.find((asset) => asset.id === row.id)?.reportId ?? row.id)}`
          : "/iso-document/machine-maintenance-plan",
        documentId: doc.id,
        documentTitle: doc.title,
        controlId: null,
        sourceCompleted: row.done,
        native: false,
      })
    }
    for (const row of calibration) {
      const key = `calibration:${row.scheduleId}:${row.dueOn}`,
        doc = docs.find((doc) => doc.module === "calibration")
      if (
        !doc ||
        (row.status === "PASSED" &&
          !controls.rows.some((control) => control.sourceKey === key))
      )
        continue
      rows.push({
        key,
        kind: "calibration",
        sourceId: row.id,
        module: "calibration",
        reference: row.unitId,
        title: `${row.scheduleName}: ${row.unitId}`,
        department: doc.department,
        ownerUserId: null,
        dueOn: row.dueOn,
        status: "Open",
        version: 0,
        href: `/store/assets/${encodeURIComponent(row.typeCode)}`,
        documentId: doc.id,
        documentTitle: doc.title,
        controlId: null,
        sourceCompleted: row.status === "PASSED",
        native: false,
      })
    }
    // A reopened review remains actionable after its previous confirmation advances the cycle.
    for (const control of controls.rows.filter(
      (control) =>
        !control.sourceKey || !rows.some((row) => row.key === control.sourceKey)
    )) {
      const doc = docs.find((doc) => doc.id === control.documentId)
      if (doc)
        rows.push({
          key: control.sourceKey || `action:${control.id}`,
          kind: "action",
          sourceId: control.id,
          module: doc.module,
          reference: `ISO-${control.id.slice(0, 8).toUpperCase()}`,
          title: control.title,
          department: control.department,
          ownerUserId: control.ownerUserId,
          dueOn: control.dueOn,
          status:
            control.status === "Completed" ? "Awaiting QA" : control.status,
          version: control.version,
          href:
            control.sourceHref || `/iso-document/documents/${doc.id}/workflow`,
          documentId: doc.id,
          documentTitle: doc.title,
          controlId: control.id,
          sourceCompleted:
            !control.sourceKey ||
            control.sourceKey.startsWith("document-review:") ||
            control.sourceKey.startsWith("record-check:"),
          native: false,
        })
    }
    return rows
      .flatMap((row) => {
        const doc = docs.find(
          (doc) =>
            doc.id === row.documentId ||
            (row.module && doc.module === row.module)
        )
        if (!doc) return []
        const control = controls.rows.find(
          (control) => control.sourceKey === row.key
        )
        const merged = {
          ...row,
          documentId: doc.id,
          documentTitle: doc.title,
          ...(control
            ? {
                department: control.department,
                ownerUserId: control.ownerUserId,
                dueOn: control.dueOn,
                status:
                  control.status === "Completed"
                    ? ("Awaiting QA" as const)
                    : control.status,
                version: control.version,
                controlId: control.id,
              }
            : {}),
        }
        if (
          !visible(access, merged) ||
          (!includeClosed && merged.status === "Closed")
        )
          return []
        return [
          {
            ...merged,
            ownerName:
              people.find((person) => person.id === merged.ownerUserId)?.name ??
              null,
            canAssign:
              departmentAllowed(access, merged.department) &&
              merged.status !== "Closed" &&
              merged.status !== "Awaiting QA" &&
              merged.kind !== "analysis-review",
            canWork:
              !row.native &&
              (access.canManage || merged.ownerUserId === access.userId),
            native: row.native,
          },
        ]
      })
      .sort(
        (a, b) =>
          (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") ||
          a.title.localeCompare(b.title)
      )
  }
  return {
    close,
    documents,
    list,
    staff,
    async departments(organizationId: string) {
      return (
        await pool.query<{ name: string }>(
          "SELECT name FROM recruitment.departments WHERE organization_id=$1 AND active ORDER BY name",
          [organizationId]
        )
      ).rows.map((row) => row.name)
    },
    async userDepartments(organizationId: string, userId: string) {
      return (
        (await createBrandingRepository({ pool }).approvalDepartments({
          organizationId,
          userId,
        })) ?? []
      )
    },
    async task(access: IsoWorkflowAccess, key: string) {
      const found = (await list(access, true)).find((row) => row.key === key)
      if (found) return found
      const control = (
        await pool.query<ActionRow>(
          `SELECT ${actionColumns} FROM document_control.workflow_actions WHERE organization_id=$1 AND source_key=$2`,
          [access.organizationId, key]
        )
      ).rows[0]
      if (!control || !visible(access, control)) return null
      const doc = (await documents(access.organizationId)).find(
        (row) => row.id === control.documentId
      )
      if (!doc) return null
      return {
        key,
        kind: "action" as const,
        sourceId: control.id,
        module: doc.module,
        reference: `ISO-${control.id.slice(0, 8).toUpperCase()}`,
        title: control.title,
        department: control.department,
        ownerUserId: control.ownerUserId,
        ownerName:
          (await staff(access.organizationId)).find(
            (person) => person.id === control.ownerUserId
          )?.name ?? null,
        dueOn: control.dueOn,
        status:
          control.status === "Completed"
            ? ("Awaiting QA" as const)
            : control.status,
        version: control.version,
        href:
          control.sourceHref || `/iso-document/documents/${doc.id}/workflow`,
        documentId: doc.id,
        documentTitle: doc.title,
        controlId: control.id,
        sourceCompleted: false,
        canAssign: false,
        canWork: false,
        native: false,
      }
    },
    async actionDetails(access: IsoWorkflowAccess, id: string) {
      const row = await action(id, access.organizationId)
      return row && visible(access, row) ? row : null
    },
    async history(access: IsoWorkflowAccess, table: string, id: string) {
      return (
        await pool.query<{
          id: string
          eventType: string
          actorName: string
          occurredAt: string
          remarks: string
          before: Record<string, unknown> | null
          after: Record<string, unknown> | null
        }>(
          `SELECT e.id,e.event_type AS "eventType",COALESCE(u.name,e.metadata->>'actorName','System') AS "actorName",e.occurred_at::text AS "occurredAt",COALESCE(e.reason,'') AS remarks,e.before_state AS before,e.after_state AS after FROM audit.events e LEFT JOIN identity.users u ON u.id=e.actor_user_id WHERE e.organization_id=$1 AND e.target_table=$2 AND e.target_id=$3 AND e.target_schema IN ('branding','document_control') AND ($2<>'documents' OR e.event_type LIKE 'iso_workflow.%' OR e.event_type LIKE 'document.workflow.%') ORDER BY e.occurred_at DESC,e.id DESC`,
          [access.organizationId, table, id]
        )
      ).rows
    },
    async saveWorkflow(
      access: IsoWorkflowAccess,
      input: {
        documentId: string
        version: number
        metadataVersion: number
        text: string
        department: string
        ownerUserId: string | null
        dueOn: string | null
        reason: string
      }
    ) {
      if (!access.canManage)
        throw new IsoWorkflowError("QA controls workflow documents.")
      const text = isoText(input.text, true, 6000),
        department = isoText(input.department, true, 160),
        reason = isoText(input.reason, true),
        dueOn = isoDate(input.dueOn)
      await validateAssignment(
        access,
        department,
        isoId(input.ownerUserId),
        department
      )
      return withTransaction(pool, async (client) => {
        const before = (
          await client.query<{
            text: string
            department: string
            owner: string | null
            dueOn: string | null
            version: number
            metadataVersion: number
          }>(
            `SELECT workflow_text AS text,workflow_department AS department,responsible_user_id AS owner,work_target_on::text AS "dueOn",workflow_version AS version,metadata_version AS "metadataVersion" FROM branding.documents WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
            [access.organizationId, input.documentId]
          )
        ).rows[0]
        if (!before) throw new IsoWorkflowError("Document not found.")
        checkVersion(before.version, input.version)
        checkVersion(before.metadataVersion, input.metadataVersion)
        await client.query(
          `UPDATE branding.documents SET workflow_text=$1,workflow_department=$2,responsible_user_id=$3,work_target_on=$5,workflow_version=workflow_version+1,metadata_version=metadata_version+1 WHERE id=$4`,
          [text, department, input.ownerUserId, input.documentId, dueOn]
        )
        await audit(
          client,
          access,
          "documents",
          input.documentId,
          "text_updated",
          reason,
          before,
          {
            text,
            department,
            owner: input.ownerUserId,
            dueOn,
            version: before.version + 1,
          }
        )
      })
    },
    async assign(
      access: IsoWorkflowAccess,
      input: {
        key: string
        version: number
        department: string
        ownerUserId: string | null
        dueOn: string | null
        reason: string
      }
    ) {
      const before = (await list(access, true)).find(
        (row) => row.key === input.key
      )
      if (!before || !before.canAssign)
        throw new IsoWorkflowError(
          "This task cannot be reassigned at this stage."
        )
      const department = isoText(input.department, true, 160),
        owner = isoId(input.ownerUserId),
        due = isoDate(input.dueOn),
        reason = isoText(input.reason, true)
      await validateAssignment(
        access,
        department,
        owner,
        before.department,
        before.ownerUserId
      )
      return withTransaction(pool, async (client) => {
        let table = "workflow_actions",
          id = before.controlId ?? before.sourceId
        if (!nativeKinds.has(before.kind)) {
          const existing = before.controlId
            ? await action(
                before.controlId,
                access.organizationId,
                client,
                true
              )
            : null
          checkVersion(existing?.version ?? 0, input.version)
          if (existing?.status === "Closed")
            throw new IsoWorkflowError(
              "QA must reopen this action before reassignment."
            )
          if (existing)
            await client.query(
              `UPDATE document_control.workflow_actions SET department=$1,owner_user_id=$2,due_on=$3,version=version+1,updated_at=now() WHERE id=$4`,
              [department, owner, due, existing.id]
            )
          else {
            const doc = (await documents(access.organizationId)).find(
              (row) => row.id === before.documentId
            )!
            id = (
              await client.query<{ id: string }>(
                `INSERT INTO document_control.workflow_actions(organization_id,document_id,source_key,source_href,title,expected_result,department,owner_user_id,due_on,workflow_snapshot,workflow_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
                [
                  access.organizationId,
                  doc.id,
                  before.key,
                  before.href,
                  before.title,
                  "Complete the task and provide evidence for QA verification.",
                  department,
                  owner,
                  due,
                  doc.text || defaultIsoWorkflow("complete the assigned task."),
                  doc.version,
                ]
              )
            ).rows[0]!.id
          }
        } else {
          const spec = {
            analysis: {
              table: "analysis_records",
              lock: "department,owner_user_id,due_on,status",
              update: "department=$1,owner_user_id=$2,due_on=$3",
            },
            "meeting-action": {
              table: "management_review_actions",
              lock: "department,owner_user_id,due_on,status",
              update: "department=$1,owner_user_id=$2,due_on=$3",
            },
            meeting: {
              table: "management_reviews",
              lock: "work_department AS department,owner_user_id,work_target_on,status",
              update: "work_department=$1,owner_user_id=$2,work_target_on=$3",
            },
            "interested-party": {
              table: "interested_party_requirements",
              lock: "department,owner_user_id,work_target_on,lifecycle AS status",
              update:
                "department=$1,owner_user_id=$2,work_target_on=$3,plan_revision=plan_revision+CASE WHEN owner_user_id IS DISTINCT FROM $2::uuid OR department IS DISTINCT FROM $1 THEN 1 ELSE 0 END",
            },
            sipoc: {
              table: "sipoc_maps",
              lock: "fields->>'department' AS department,fields->>'ownerUserId' AS owner_user_id,work_target_on,status",
              update:
                "fields=jsonb_set(jsonb_set(fields,'{department}',to_jsonb($1::text)),'{ownerUserId}',COALESCE(to_jsonb($2::text),'null'::jsonb)),work_target_on=$3",
            },
            satisfaction: {
              table: "customer_satisfaction_reports",
              lock: "work_department AS department,fields->>'ownerUserId' AS owner_user_id,work_target_on,status",
              update:
                "work_department=$1,fields=jsonb_set(fields,'{ownerUserId}',COALESCE(to_jsonb($2::text),'null'::jsonb)),work_target_on=$3",
            },
            document: {
              table: "documents",
              lock: "workflow_department AS department,responsible_user_id AS owner_user_id,work_target_on",
              update:
                "workflow_department=$1,responsible_user_id=$2,work_target_on=$3",
            },
          }[
            before.kind as Exclude<
              IsoTaskKind,
              | "analysis-review"
              | "document-review"
              | "record-check"
              | "action"
              | "maintenance"
              | "asset-maintenance"
              | "calibration"
            >
          ]
          if (!spec)
            throw new IsoWorkflowError(
              "Use the module's QA review controls for this item."
            )
          table = spec.table
          const schema =
              table === "documents" ? "branding" : "document_control",
            versionColumn =
              table === "documents" ? "metadata_version" : "version"
          const locked = (
            await client.query<{
              department: string
              version: number
              status?: string
            }>(
              `SELECT ${spec.lock},${versionColumn} AS version FROM ${schema}.${table} WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
              [access.organizationId, before.sourceId]
            )
          ).rows[0]
          if (!locked) throw new IsoWorkflowError("Record not found.")
          checkVersion(locked.version, input.version)
          if (
            [
              "Closed",
              "Approved",
              "Submitted",
              "For Approval",
              "Inactive",
            ].includes(locked.status ?? "")
          )
            throw new IsoWorkflowError(
              "Resolve QA review or reopen before changing this assignment."
            )
          await validateAssignment(
            access,
            department,
            owner,
            locked.department || before.department,
            before.ownerUserId
          )
          if (
            before.kind === "interested-party" &&
            (
              await client.query(
                "SELECT 1 FROM document_control.interested_party_monitoring WHERE requirement_id=$1 AND status='Submitted'",
                [before.sourceId]
              )
            ).rowCount
          )
            throw new IsoWorkflowError(
              "Resolve the submitted monitoring result before changing its plan."
            )
          await client.query(
            `UPDATE ${schema}.${table} SET ${spec.update},${versionColumn}=${versionColumn}+1${table === "documents" ? "" : ",updated_at=now()"} WHERE id=$4`,
            [department, owner, due, before.sourceId]
          )
        }
        await audit(
          client,
          access,
          table,
          id,
          "assigned",
          reason,
          {
            department: before.department,
            owner: before.ownerUserId,
            dueOn: before.dueOn,
          },
          { department, owner, dueOn: due }
        )
      })
    },
    async createAction(
      access: IsoWorkflowAccess,
      input: {
        documentId: string
        title: string
        expectedResult: string
        department: string
        ownerUserId: string | null
        dueOn: string | null
        sourceHref?: string
        reason: string
      }
    ) {
      const doc = (await documents(access.organizationId)).find(
        (row) => row.id === input.documentId
      )
      if (!doc) throw new IsoWorkflowError("Document not found.")
      const department = isoText(input.department, true, 160),
        title = isoText(input.title, true),
        expected = isoText(input.expectedResult, true),
        reason = isoText(input.reason, true),
        owner = isoId(input.ownerUserId),
        due = isoDate(input.dueOn),
        href = isoText(input.sourceHref, false, 1000)
      if (
        href &&
        (!href.startsWith("/") || href.startsWith("//") || /[\s\\]/.test(href))
      )
        throw new IsoWorkflowError("Use an internal source-record link.")
      await validateAssignment(access, department, owner, department)
      return withTransaction(pool, async (client) => {
        const id = (
          await client.query<{ id: string }>(
            `INSERT INTO document_control.workflow_actions(organization_id,document_id,title,expected_result,department,owner_user_id,due_on,source_href,workflow_snapshot,workflow_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [
              access.organizationId,
              doc.id,
              title,
              expected,
              department,
              owner,
              due,
              href,
              doc.text || defaultIsoWorkflow("complete the assigned task."),
              doc.version,
            ]
          )
        ).rows[0]!.id
        await audit(
          client,
          access,
          "workflow_actions",
          id,
          "created",
          reason,
          null,
          {
            title,
            expectedResult: expected,
            department,
            owner,
            dueOn: due,
            workflowVersion: doc.version,
          }
        )
        return id
      })
    },
    async updateAction(
      access: IsoWorkflowAccess,
      input: {
        id: string
        version: number
        operation: "progress" | "complete" | "verify" | "return" | "reopen"
        remarks: string
        evidence?: string
      }
    ) {
      const remarks = isoText(input.remarks, true),
        evidence = isoText(input.evidence)
      return withTransaction(pool, async (client) => {
        const before = await action(
          input.id,
          access.organizationId,
          client,
          true
        )
        if (!before || !visible(access, before))
          throw new IsoWorkflowError("Action not found.")
        checkVersion(before.version, input.version)
        const qa = ["verify", "return", "reopen"].includes(input.operation)
        if (
          qa
            ? !access.canVerify
            : !(access.canManage || before.ownerUserId === access.userId)
        )
          throw new IsoWorkflowError(
            qa
              ? "QA verification is required."
              : "Only the responsible person may record work."
          )
        let status: ActionRow["status"]
        if (input.operation === "reopen") {
          if (before.status !== "Closed")
            throw new IsoWorkflowError("Only a closed action can be reopened.")
          status = "In Progress"
        } else if (input.operation === "verify") {
          if (before.status !== "Completed")
            throw new IsoWorkflowError("Verify completed work before closure.")
          status = "Closed"
        } else if (input.operation === "return") {
          if (before.status !== "Completed")
            throw new IsoWorkflowError("Return completed work awaiting QA.")
          status = "In Progress"
        } else {
          if (!["Open", "In Progress"].includes(before.status))
            throw new IsoWorkflowError(
              "QA must return or reopen this action before work changes."
            )
          status = input.operation === "complete" ? "Completed" : "In Progress"
        }
        if (
          input.operation === "complete" &&
          (!before.ownerUserId ||
            !before.dueOn ||
            !before.department ||
            !evidence ||
            !before.expectedResult)
        )
          throw new IsoWorkflowError(
            "Assign a person and target date, record the expected result and provide completion evidence."
          )
        if (
          input.operation === "complete" &&
          !(await staff(access.organizationId)).some(
            (person) => person.id === before.ownerUserId
          )
        )
          throw new IsoWorkflowError(
            "Assign an active staff account before completing work."
          )
        if (
          ["complete", "verify"].includes(input.operation) &&
          before.sourceKey
        ) {
          const task = (await list(access, true)).find(
            (row) => row.key === before.sourceKey
          )
          if (!task || !task.sourceCompleted)
            throw new IsoWorkflowError(
              "Complete the operational work and its required checks in the source register first."
            )
        }
        await client.query(
          `UPDATE document_control.workflow_actions SET status=$1,work_done=CASE WHEN $2 IN ('progress','complete') THEN $3 ELSE work_done END,evidence=CASE WHEN $2 IN ('progress','complete') THEN $4 ELSE evidence END,
          qa_findings=CASE WHEN $2 IN ('verify','return','reopen') THEN $3 ELSE qa_findings END,
          completed_at=CASE WHEN $2='complete' THEN now() WHEN $2 IN ('return','reopen') THEN NULL ELSE completed_at END,
          completed_by_user_id=CASE WHEN $2='complete' THEN $5 WHEN $2 IN ('return','reopen') THEN NULL ELSE completed_by_user_id END,
          verified_at=CASE WHEN $2='verify' THEN now() ELSE NULL END,verified_by_user_id=CASE WHEN $2='verify' THEN $5 ELSE NULL END,version=version+1,updated_at=now() WHERE id=$6`,
          [status, input.operation, remarks, evidence, access.userId, before.id]
        )
        if (
          input.operation === "verify" &&
          before.sourceKey &&
          (before.sourceKey.startsWith("document-review:") ||
            before.sourceKey.startsWith("record-check:"))
        ) {
          const kind = before.sourceKey.startsWith("document-review:")
            ? "document-review"
            : "data-record"
          await client.query(
            `INSERT INTO document_control.monitoring_confirmations(organization_id,document_id,obligation_type,period_label,evidence_location,remarks,completed_by_user_id,completed_by_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              access.organizationId,
              before.documentId,
              kind,
              `${before.sourceKey}:verification:${before.version}`,
              before.evidence,
              remarks,
              access.userId,
              access.userName,
            ]
          )
        }
        await audit(
          client,
          access,
          "workflow_actions",
          before.id,
          input.operation,
          remarks,
          before,
          {
            status,
            workDone: qa ? before.workDone : remarks,
            evidence: qa ? before.evidence : evidence,
            qaFindings: qa ? remarks : before.qaFindings,
          }
        )
      })
    },
  }
}
