import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

export type EmailSignatureFields = {
  name: string
  designation: string
  phone: string
  email: string
  linkedin: string
  website: string
  company: string
  imageHost: string
  mailApp: string
}

export type SavedEmailSignature = {
  id: string
  fields: EmailSignatureFields
  updatedAt: string
  updatedByName: string | null
}

const columns = `s.id, s.name, s.designation, s.phone, s.email, s.linkedin,
  s.website, s.company, s.image_host AS "imageHost", s.mail_app AS "mailApp",
  s.updated_at::text AS "updatedAt", u.name AS "updatedByName"`

export function createEmailSignatureRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async list() {
      const result = await pool.query<
        EmailSignatureFields & Omit<SavedEmailSignature, "fields">
      >(
        `SELECT ${columns}
           FROM core.email_signatures s
           LEFT JOIN identity.users u ON u.id = s.updated_by
          ORDER BY s.updated_at DESC`
      )
      return result.rows.map(
        ({ id, updatedAt, updatedByName, ...fields }): SavedEmailSignature => ({
          id,
          fields,
          updatedAt,
          updatedByName,
        })
      )
    },

    /** Creates a signature, or updates it when `id` is given. Returns its id. */
    async save(input: {
      id?: string
      fields: EmailSignatureFields
      userId: string
    }) {
      const { fields } = input
      if (!fields.name.trim()) throw new Error("Name is required.")
      const values = [
        fields.name.trim(),
        fields.designation,
        fields.phone,
        fields.email,
        fields.linkedin,
        fields.website,
        fields.company,
        fields.imageHost,
        fields.mailApp,
        input.userId,
      ]
      const result = input.id
        ? await pool.query<{ id: string }>(
            `UPDATE core.email_signatures
                SET name = $1, designation = $2, phone = $3, email = $4,
                    linkedin = $5, website = $6, company = $7, image_host = $8,
                    mail_app = $9, updated_by = $10, updated_at = now()
              WHERE id = $11
              RETURNING id`,
            [...values, input.id]
          )
        : await pool.query<{ id: string }>(
            `INSERT INTO core.email_signatures (
               name, designation, phone, email, linkedin, website, company,
               image_host, mail_app, created_by, updated_by
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
             RETURNING id`,
            values
          )
      const id = result.rows[0]?.id
      if (!id) throw new Error("Saved signature was not found.")
      return id
    },

    async remove(id: string) {
      await pool.query("DELETE FROM core.email_signatures WHERE id = $1", [id])
    },
  }
}
