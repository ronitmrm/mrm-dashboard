import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

type DashboardPreferenceRow = {
  dashboard_widgets: string[] | null
}

type DashboardAnalyticsRow = {
  dashboard_analytics: unknown | null
}

export function createUserDashboardRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async load(userId: string) {
      const result = await pool.query<DashboardPreferenceRow>(
        `SELECT dashboard_widgets
         FROM identity.users
         WHERE id = $1`,
        [userId]
      )
      return result.rows[0]?.dashboard_widgets ?? null
    },

    async loadAnalytics(userId: string) {
      const result = await pool.query<DashboardAnalyticsRow>(
        `SELECT dashboard_analytics
         FROM identity.users
         WHERE id = $1`,
        [userId]
      )
      return result.rows[0]?.dashboard_analytics ?? null
    },

    async save(userId: string, widgetIds: readonly string[]) {
      const result = await pool.query(
        `UPDATE identity.users
         SET dashboard_widgets = $2::text[],
             updated_at = now()
         WHERE id = $1`,
        [userId, widgetIds]
      )
      if (result.rowCount !== 1) {
        throw new Error("The dashboard could not be saved for this account")
      }
    },

    async saveAnalytics(userId: string, configuration: unknown) {
      const result = await pool.query(
        `UPDATE identity.users
         SET dashboard_analytics = $2::jsonb,
             updated_at = now()
         WHERE id = $1`,
        [userId, configuration]
      )
      if (result.rowCount !== 1) {
        throw new Error("The dashboard could not be saved for this account")
      }
    },
  }
}
