import { repositoryPool, withRepositoryTransaction, type RepositoryPoolOptions } from "./postgres-runtime"
import type { CncShift } from "./shift-idle-reasons"

type ShiftKey = { productionDate: string; shift: CncShift }
export type ShiftIdleOperator = { code: string; name: string }
export type ShiftIdleOperatorCheck = ShiftKey & {
  checkedAt: string | null
  idle: ShiftIdleOperator[]
  // Employee codes already present through a CNC production session.
  sessionOperators: string[]
}

const readSql = `
  SELECT k.production_date::text AS "productionDate", k.shift, c.checked_at AS "checkedAt",
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('code', e.employee_code, 'name', e.name) ORDER BY e.name)
      FROM workforce.shift_idle_operators o JOIN workforce.employees e ON e.id = o.employee_id
      WHERE o.organization_id = $1 AND o.production_date = k.production_date AND o.shift = k.shift
    ), '[]'::jsonb) AS idle,
    COALESCE((
      SELECT jsonb_agg(DISTINCT e.employee_code)
      FROM manufacturing.production_sessions s
      JOIN workforce.employees e ON e.id = s.operator_employee_id
      JOIN catalog.machines m ON m.id = s.machine_id
      JOIN manufacturing.production_floors f ON f.id = m.production_floor_id
      WHERE s.organization_id = $1 AND s.reversed_at IS NULL AND f.code = 'cnc'
        AND s.production_date = k.production_date AND s.shift = k.shift
    ), '[]'::jsonb) AS "sessionOperators"
  FROM unnest($2::date[], $3::text[]) AS k(production_date, shift)
  LEFT JOIN workforce.shift_idle_operator_checks c
    ON c.organization_id = $1 AND c.production_date = k.production_date AND c.shift = k.shift
  ORDER BY k.production_date DESC, k.shift DESC
`

export function createShiftIdleOperatorRepository(options: RepositoryPoolOptions) {
  const { pool, close } = repositoryPool(options)

  async function read(organizationId: string, keys: readonly ShiftKey[], queryPool = pool) {
    const { rows } = await queryPool.query<Omit<ShiftIdleOperatorCheck, "checkedAt"> & { checkedAt: Date | null }>(
      readSql, [organizationId, keys.map((key) => key.productionDate), keys.map((key) => key.shift)])
    return rows.map((row): ShiftIdleOperatorCheck => ({ ...row, checkedAt: row.checkedAt?.toISOString() ?? null }))
  }

  return {
    close,
    read,
    // Replaces the shift's idle list; an empty list still marks the task done.
    async save(input: ShiftKey & { organizationId: string; actorUserId: string; employeeCodes: string[] }) {
      return withRepositoryTransaction(options, async () => {
        const { pool: transaction } = repositoryPool(options)
        const codes = [...new Set(input.employeeCodes.map((code) => code.trim().toLowerCase()))]
        const employees = await transaction.query<{ id: string }>(
          `SELECT id FROM workforce.employees
           WHERE organization_id = $1 AND lower(employee_code) = ANY($2::text[])`,
          [input.organizationId, codes])
        if (employees.rows.length !== codes.length) return undefined
        const key = [input.organizationId, input.productionDate, input.shift]
        await transaction.query(
          `INSERT INTO workforce.shift_idle_operator_checks (organization_id, production_date, shift, checked_by_user_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (organization_id, production_date, shift)
           DO UPDATE SET checked_by_user_id = EXCLUDED.checked_by_user_id, checked_at = now()`,
          [...key, input.actorUserId])
        await transaction.query(
          `DELETE FROM workforce.shift_idle_operators
           WHERE organization_id = $1 AND production_date = $2 AND shift = $3`, key)
        await transaction.query(
          `INSERT INTO workforce.shift_idle_operators (organization_id, production_date, shift, employee_id)
           SELECT $1, $2, $3, unnest($4::uuid[])`,
          [...key, employees.rows.map(({ id }) => id)])
        const [saved] = await read(input.organizationId, [input], transaction)
        return saved
      })
    },
    // Idle operator codes per date and shift, for the attendance card.
    async readBetween(organizationId: string, from: string, to: string) {
      const { rows } = await pool.query<{ productionDate: string; shift: CncShift; code: string }>(
        `SELECT o.production_date::text AS "productionDate", o.shift, e.employee_code AS code
         FROM workforce.shift_idle_operators o JOIN workforce.employees e ON e.id = o.employee_id
         WHERE o.organization_id = $1 AND o.production_date BETWEEN $2::date AND $3::date`,
        [organizationId, from, to])
      return rows
    },
  }
}
