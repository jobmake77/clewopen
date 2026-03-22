import { query } from '../config/database.js'

const TrialDataAccessAuditModel = {
  async create(data) {
    const result = await query(
      `INSERT INTO trial_data_access_audits (
         session_id, viewer_user_id, viewer_role, access_type, resource_type, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.session_id || null,
        data.viewer_user_id || null,
        data.viewer_role || null,
        data.access_type,
        data.resource_type || 'trial_session',
        JSON.stringify(data.metadata || {}),
      ]
    )
    return result.rows[0] || null
  },
}

export default TrialDataAccessAuditModel
