import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

type ProposalRow = {
  id: string
  reference: string
  revision_of: string | null
  input: unknown
  result: unknown
  state: "draft" | "approved"
  version: number
  updated_at: string
  approved_at: string | null
}
export function createOrderAcceptanceRepository(
  options: RepositoryPoolOptions
) {
  const { pool, close } = repositoryPool(options)
  return {
    close,
    async list(organization: string, floor: string) {
      return (
        await pool.query<ProposalRow>(
          `SELECT id, reference, revision_of, state, version, updated_at, approved_at FROM manufacturing.order_acceptance_proposals WHERE organization_id=$1 AND floor_code=$2 ORDER BY updated_at DESC LIMIT 100`,
          [organization, floor]
        )
      ).rows
    },
    async get(organization: string, floor: string, id: string) {
      return (
        await pool.query<ProposalRow>(
          `SELECT * FROM manufacturing.order_acceptance_proposals WHERE organization_id=$1 AND floor_code=$2 AND id=$3`,
          [organization, floor, id]
        )
      ).rows[0]
    },
    async save(input: {
      organization: string
      floor: string
      actor: string
      id?: string
      version: number
      reference: string
      revisionOf: string
      content: unknown
      result: unknown
      approve: boolean
    }) {
      if (input.id) {
        const result = await pool.query<ProposalRow>(
          `UPDATE manufacturing.order_acceptance_proposals SET input=$5, result=$6, reference=$7, updated_by=$8, updated_at=now(), version=version+1, state=$9, approved_at=CASE WHEN $9='approved' THEN now() ELSE NULL END WHERE organization_id=$1 AND floor_code=$2 AND id=$3 AND version=$4 AND state='draft' RETURNING *`,
          [
            input.organization,
            input.floor,
            input.id,
            input.version,
            JSON.stringify(input.content),
            input.result ? JSON.stringify(input.result) : null,
            input.reference,
            input.actor,
            input.approve ? "approved" : "draft",
          ]
        )
        if (!result.rows[0])
          throw new Error(
            "Proposal changed or was approved. Reload before continuing."
          )
        return result.rows[0]
      }
      if (input.approve)
        throw new Error("Save and calculate the proposal before approval.")
      if (input.revisionOf) {
        const parent = await pool.query(
          `SELECT id FROM manufacturing.order_acceptance_proposals WHERE id=$1 AND organization_id=$2 AND floor_code=$3 AND state='approved'`,
          [input.revisionOf, input.organization, input.floor]
        )
        if (!parent.rowCount)
          throw new Error("Approved proposal revision source was not found.")
      }
      return (
        await pool.query<ProposalRow>(
          `INSERT INTO manufacturing.order_acceptance_proposals (organization_id, floor_code, reference, revision_of, input, result, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
          [
            input.organization,
            input.floor,
            input.reference,
            input.revisionOf || null,
            JSON.stringify(input.content),
            input.result ? JSON.stringify(input.result) : null,
            input.actor,
          ]
        )
      ).rows[0]!
    },
  }
}
