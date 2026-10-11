import type { Pool } from "pg"

export async function listIsoDocumentStaff(
  pool: Pick<Pool, "query">,
  organizationId: string
) {
  const result = await pool.query<{ id: string; name: string }>(
    `SELECT u.id, u.name FROM identity.users u WHERE NOT u.banned AND (
      EXISTS (SELECT 1 FROM identity.employee_links link JOIN recruitment.posts post
        ON post.organization_id = link.organization_id AND lower(trim(post.employee_code)) = lower(trim(link.employee_code))
        WHERE link.user_id = u.id AND link.organization_id = $1 AND
          (post.status = 'Occupied' OR (post.status = 'Appointed' AND post.joining_date <= current_date)
           OR (post.status = 'Resigned' AND post.last_working_date >= current_date)))
      OR (NOT EXISTS (SELECT 1 FROM identity.employee_links WHERE user_id = u.id)
        AND EXISTS (SELECT 1 FROM identity.user_roles ur JOIN identity.roles role ON role.id = ur.role_id
          WHERE ur.user_id = u.id AND role.key IN ('administrator', 'administrative')))
    ) ORDER BY u.name, u.id`,
    [organizationId]
  )
  return result.rows
}
