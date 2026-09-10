import type { Pool, PoolClient } from "pg"
import { randomUUID } from "node:crypto"
import { withTransaction } from "./postgres-runtime"
import { nextRevisionNumber } from "./commercial-revisions"

export type EnquiryRevisionKind = "Terms" | "Pricing" | "Technical"

export async function completeRevisionFollowups(
  client: PoolClient,
  enquiryItemIds: string[],
  actorUserId?: string | null
) {
  await client.query(`
    UPDATE sales.followups followup
    SET status = 'Completed', completed_at = now(),
      note = concat_ws(E'\n', nullif(followup.note, ''), 'Revision initiated.'),
      updated_by_user_id = $2, updated_at = now(), row_version = followup.row_version + 1
    FROM sales.quote_items quote
    WHERE followup.quote_item_id = quote.id AND followup.status = 'Pending'
      AND quote.enquiry_item_id = ANY($1::uuid[])`,
    [enquiryItemIds, actorUserId ?? null])
}

export function enquiryRevisionMethods(pool: Pool) {
  return {
    async listSalesTermsRevisions(
      organizationCode: string,
      actorUserId: string
    ) {
      return (
        await pool.query<{
          id: string
          enquiryId: string
          enquiryNumber: string
          reason: string
        }>(
          `
        SELECT request.id,request.enquiry_id AS "enquiryId",enquiry.enquiry_number AS "enquiryNumber",request.reason
        FROM sales.enquiry_revision_requests request JOIN sales.enquiries enquiry ON enquiry.id=request.enquiry_id
        JOIN core.organizations org ON org.id=request.organization_id
        WHERE lower(org.code)=lower($1) AND request.status='Open' AND request.kind='Terms'
          AND EXISTS(SELECT 1 FROM sales.enquiry_items line WHERE line.enquiry_id=enquiry.id AND line.revision_stage='Sales')
          AND (enquiry.created_by_user_id=$2 OR identity.has_administrative_access($2)) ORDER BY request.created_at`,
          [organizationCode, actorUserId]
        )
      ).rows
    },
    async listEnquiryRevisionDesignTasks(organizationCode: string) {
      const result = await pool.query<{
        id: string
        enquiryNumber: string
        lineNumber: number
        description: string
        reason: string
        status: string
      }>(
        `
        SELECT ecn.id,enquiry.enquiry_number AS "enquiryNumber",line.line_number AS "lineNumber",line.description,request.reason,ecn.status
        FROM sales.enquiry_revision_requests request JOIN sales.enquiry_revision_lines link ON link.request_id=request.id
        JOIN sales.enquiry_items line ON line.id=link.enquiry_item_id JOIN sales.enquiries enquiry ON enquiry.id=request.enquiry_id
        JOIN sales.engineering_change_notes ecn ON ecn.id=link.engineering_change_note_id
        JOIN core.organizations org ON org.id=request.organization_id
        WHERE lower(org.code)=lower($1) AND request.status='Open' AND ecn.status IN ('Pending Design','Pending Design Approval')
        ORDER BY request.created_at,line.line_number`,
        [organizationCode]
      )
      return result.rows
    },
    async requestEnquiryRevision(input: {
      actorUserId?: string | null
      enquiryId: string
      kind: EnquiryRevisionKind
      reason: string
      enquiryItemIds: string[]
    }) {
      if (
        !["Terms", "Pricing", "Technical"].includes(input.kind) ||
        !input.reason.trim()
      )
        throw new Error(
          "Select a revision type and enter the customer's requested changes."
        )
      return withTransaction(pool, async (client) => {
        const enquiry = await client.query<{
          organization_id: string
          terms: Record<string, unknown>
        }>(
          `
          SELECT organization_id,to_jsonb(enquiry) AS terms FROM sales.enquiries enquiry
          WHERE id = $1 AND ($2::uuid IS NULL OR created_by_user_id = $2 OR identity.has_administrative_access($2)) FOR UPDATE`,
          [input.enquiryId, input.actorUserId ?? null]
        )
        const row = enquiry.rows[0]
        if (!row)
          throw new Error("Enquiry was not found or is not assigned to you.")
        if (
          (
            await client.query(
              "SELECT 1 FROM sales.enquiry_revision_requests WHERE enquiry_id = $1 AND status = 'Open'",
              [input.enquiryId]
            )
          ).rowCount
        )
          throw new Error("A revision is already open for this enquiry.")
        if (
          (
            await client.query(
              `SELECT 1 FROM sales.purchase_order_lines po JOIN sales.quote_items q ON q.id = po.quote_item_id WHERE q.enquiry_id = $1 LIMIT 1`,
              [input.enquiryId]
            )
          ).rowCount
        )
          throw new Error(
            "This enquiry has a purchase order. Use the order/ECN revision workflow."
          )
        const selected = [...new Set(input.enquiryItemIds)]
        const lines = await client.query<{
          id: string
          quote_id: string | null
          item_id: string | null
          next_stage_status: string | null
          customer_recost_required: boolean
        }>(
          `
          SELECT line.id,q.id quote_id,COALESCE(q.item_id,design.matched_product_id,line.item_id) item_id,design.next_stage_status,line.customer_recost_required
          FROM sales.enquiry_items line LEFT JOIN sales.design_tasks design ON design.enquiry_item_id=line.id
          LEFT JOIN LATERAL (SELECT id,item_id FROM sales.quote_items q WHERE enquiry_item_id=line.id AND status IN ('Ready','Sent','Accepted')
            AND NOT EXISTS(SELECT 1 FROM sales.quote_package_components component WHERE component.child_quote_item_id=q.id)
            ORDER BY created_at DESC,id DESC LIMIT 1) q ON true
          WHERE line.enquiry_id=$1 AND line.linked_enquiry_item_id IS NULL AND line.technical_review_status <> 'NotFeasible'
            AND ($2 OR line.id=ANY($3::uuid[])) FOR UPDATE OF line`,
          [input.enquiryId, input.kind === "Terms", selected]
        )
        if (
          !lines.rows.length ||
          (input.kind !== "Terms" && lines.rows.length !== selected.length)
        )
          throw new Error("Select valid enquiry lines for revision.")
        if (input.kind === "Terms" && lines.rows.some((line) => !line.quote_id || line.customer_recost_required))
          throw new Error(
            "Complete pending lines first, or update terms directly on the enquiry."
          )
        if (
          input.kind === "Pricing" &&
          lines.rows.some(
            (line) =>
              !line.item_id ||
              !["Product Costing Complete", "Started", "Quoted"].includes(
                line.next_stage_status ?? ""
              )
          )
        )
          throw new Error(
            "Complete Product Costing before requesting a pricing revision."
          )
        if (input.kind === "Technical") {
          for (const line of lines.rows) {
            if (
              !line.item_id ||
              !(
                await client.query(
                  "SELECT 1 FROM catalog.product_design_revisions WHERE item_id=$1 AND is_current AND status='Released'",
                  [line.item_id]
                )
              ).rowCount
            )
              throw new Error(
                "Complete Design and its controlled Product handoff before requesting a technical revision."
              )
            await client.query(
              "SELECT id FROM catalog.items WHERE id=$1 FOR UPDATE",
              [line.item_id]
            )
            if (
              (
                await client.query(
                  "SELECT 1 FROM sales.engineering_change_notes WHERE item_id=$1 AND status <> 'Completed'",
                  [line.item_id]
                )
              ).rowCount
            )
              throw new Error(
                "This Product already has an open technical revision."
              )
          }
        }
        const created = await client.query<{ id: string }>(
          `INSERT INTO sales.enquiry_revision_requests(organization_id,enquiry_id,kind,reason,terms_before,created_by_user_id)
          VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [
            row.organization_id,
            input.enquiryId,
            input.kind,
            input.reason.trim(),
            row.terms,
            input.actorUserId ?? null,
          ]
        )
        const id = created.rows[0]!.id
        await completeRevisionFollowups(client, lines.rows.map(line => line.id), input.actorUserId)
        const ecns = new Map<string, string>()
        for (const line of lines.rows) {
          let ecnId: string | null = null
          if (input.kind === "Technical") {
            ecnId = ecns.get(line.item_id!) ?? null
            if (!ecnId) {
              const number = await nextRevisionNumber(
                client,
                row.organization_id,
                "ECN"
              )
              const ecn = await client.query<{ id: string }>(
                `INSERT INTO sales.engineering_change_notes(organization_id,ecn_number,item_id,status,reason,effective_on,created_by_user_id,updated_by_user_id,source_system,source_table,source_id,source_payload)
                VALUES($1,$2,$3,'Pending Design',$4,current_date,$5,$5,'mrm-dashboard','enquiry_revision',gen_random_uuid()::text,jsonb_build_object('enquiryRevisionId',$6::text)) RETURNING id`,
                [
                  row.organization_id,
                  number,
                  line.item_id,
                  input.reason.trim(),
                  input.actorUserId ?? null,
                  id,
                ]
              )
              ecnId = ecn.rows[0]!.id
              ecns.set(line.item_id!, ecnId)
            }
          }
          await client.query(
            "INSERT INTO sales.enquiry_revision_lines(request_id,enquiry_item_id,previous_quote_item_id,engineering_change_note_id) VALUES($1,$2,$3,$4)",
            [id, line.id, line.quote_id, ecnId]
          )
          await client.query(
            "UPDATE sales.enquiry_items SET revision_stage=$2,customer_recost_required=$3,updated_at=now(),row_version=row_version+1 WHERE id=$1",
            [
              line.id,
              input.kind === "Terms"
                ? "Sales"
                : input.kind === "Technical"
                  ? "Design"
                  : "Customer Costing",
              input.kind !== "Terms",
            ]
          )
          if (input.kind === "Pricing")
            await client.query(
              "UPDATE sales.design_tasks SET next_stage_status='Product Costing Complete',updated_at=now() WHERE enquiry_item_id=$1",
              [line.id]
            )
          if (input.kind === "Technical")
            await client.query("UPDATE sales.design_tasks SET next_stage_status='Quoted',updated_at=now() WHERE enquiry_item_id=$1",[line.id])
        }
        return { id, kind: input.kind }
      })
    },
    async listEnquiryRevisions(enquiryId: string, actorUserId?: string | null) {
      const result = await pool.query<{
        id: string
        kind: EnquiryRevisionKind
        reason: string
        status: string
        createdAt: Date
        lines: Array<{
          enquiryItemId: string
          lineNumber: number
          stage: string | null
          engineeringChangeNoteId: string | null
        }>
      }>(
        `
        SELECT request.id,request.kind,request.reason,request.status,request.created_at AS "createdAt",
          COALESCE((SELECT jsonb_agg(jsonb_build_object('enquiryItemId',line.id,'lineNumber',line.line_number,'stage',line.revision_stage,'engineeringChangeNoteId',link.engineering_change_note_id) ORDER BY line.line_number)
            FROM sales.enquiry_revision_lines link JOIN sales.enquiry_items line ON line.id=link.enquiry_item_id WHERE link.request_id=request.id),'[]'::jsonb) lines
        FROM sales.enquiry_revision_requests request JOIN sales.enquiries enquiry ON enquiry.id=request.enquiry_id
        WHERE request.enquiry_id=$1 AND ($2::uuid IS NULL OR enquiry.created_by_user_id=$2 OR identity.has_administrative_access($2)) ORDER BY request.created_at DESC`,
        [enquiryId, actorUserId ?? null]
      )
      return result.rows
    },
  }
}

export async function assertRevisionCanSend(
  client: PoolClient,
  enquiryId: string
) {
  if (
    (
      await client.query(
        "SELECT 1 FROM sales.enquiry_items WHERE enquiry_id=$1 AND revision_stage IS NOT NULL AND revision_stage <> 'Ready To Send' LIMIT 1",
        [enquiryId]
      )
    ).rowCount
  )
    throw new Error("Complete the open enquiry revision before sending.")
}

// Copy saved quotation evidence, never recalculate terms-only revisions from live Product prices.
async function copyQuoteTree(
  client: PoolClient,
  quoteId: string,
  actorUserId?: string | null,
  copied = new Map<string, string>()
): Promise<string> {
  const cached = copied.get(quoteId)
  if (cached) return cached
  const id = randomUUID()
  copied.set(quoteId, id)
  await client.query(
    `INSERT INTO sales.quote_items SELECT (jsonb_populate_record(NULL::sales.quote_items,
    to_jsonb(q) || jsonb_build_object('id',$2::uuid,'revision',(SELECT max(revision)+1 FROM sales.quote_items WHERE organization_id=q.organization_id AND quote_number=q.quote_number),
      'status','Ready','is_active',false,'sent_at',NULL,'ordered_at',NULL,'superseded_by_quote_item_id',NULL,
      'created_at',now(),'updated_at',now(),'created_by_user_id',$3::uuid,'updated_by_user_id',$3::uuid,'row_version',1,'source_id',$2::text))).*
    FROM sales.quote_items q WHERE q.id=$1`,
    [quoteId, id, actorUserId ?? null]
  )
  const snapshots = await client.query<{ id: string }>(
    "SELECT id FROM sales.quote_product_snapshots WHERE quote_item_id=$1",
    [quoteId]
  )
  for (const snapshot of snapshots.rows) {
    const snapshotId = randomUUID()
    await client.query(
      `INSERT INTO sales.quote_product_snapshots SELECT (jsonb_populate_record(NULL::sales.quote_product_snapshots,
      to_jsonb(s) || jsonb_build_object('id',$2::uuid,'quote_item_id',$3::uuid,'created_at',now(),'source_id',$2::text))).*
      FROM sales.quote_product_snapshots s WHERE id=$1`,
      [snapshot.id, snapshotId, id]
    )
    const components = await client.query<{
      id: string
      child_quote_item_id: string | null
    }>(
      "SELECT id,child_quote_item_id FROM sales.quote_package_components WHERE quote_product_snapshot_id=$1",
      [snapshot.id]
    )
    for (const component of components.rows) {
      const childId = component.child_quote_item_id
        ? await copyQuoteTree(
            client,
            component.child_quote_item_id,
            actorUserId,
            copied
          )
        : null
      await client.query(
        `INSERT INTO sales.quote_package_components SELECT (jsonb_populate_record(NULL::sales.quote_package_components,
        to_jsonb(c) || jsonb_build_object('id',gen_random_uuid(),'quote_product_snapshot_id',$2::uuid,'child_quote_item_id',$3::uuid,'created_at',now(),'source_id',gen_random_uuid()::text))).*
        FROM sales.quote_package_components c WHERE id=$1`,
        [component.id, snapshotId, childId]
      )
    }
  }
  return id
}

export async function prepareTermsRevision(
  client: PoolClient,
  enquiryId: string,
  actorUserId?: string | null
) {
  const lines = await client.query<{
    id: string
    previous_quote_item_id: string
  }>(
    `
    SELECT line.id,link.previous_quote_item_id FROM sales.enquiry_revision_requests request
    JOIN sales.enquiry_revision_lines link ON link.request_id=request.id
    JOIN sales.enquiry_items line ON line.id=link.enquiry_item_id
    WHERE request.enquiry_id=$1 AND request.status='Open' AND request.kind='Terms' AND line.revision_stage='Sales'`,
    [enquiryId]
  )
  const copied = new Map<string, string>()
  for (const line of lines.rows) {
    await copyQuoteTree(
      client,
      line.previous_quote_item_id,
      actorUserId,
      copied
    )
    await client.query(
      "UPDATE sales.enquiry_items SET revision_stage='Ready To Send' WHERE id=$1",
      [line.id]
    )
  }
}
