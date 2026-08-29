/**
 * Campaign persistence against D1.
 *
 * ## Authorization
 *
 * D1 is SQLite. There is no row-level security, no policy engine, and no
 * `auth.uid()` — unlike Supabase, where RLS is mandatory precisely *because*
 * PostgREST exposes the database straight to the browser. D1 is never exposed
 * to a browser: the binding exists only inside this Function. There is no anon
 * key to leak and no public endpoint to the database.
 *
 * The cost of that is that **every authorization decision is code in this
 * file**. A forgotten `WHERE owner_user_id = ?` is a data leak with nothing
 * underneath to catch it. So there is exactly one rule here, and it is
 * structural rather than remembered:
 *
 *   > Every exported function takes `userId` as its first argument, and every
 *   > statement it runs filters on it. No function in this module can be called
 *   > without saying who is asking.
 *
 * If a future query cannot be scoped that way, it does not belong here.
 *
 * ## Query budget
 *
 * D1's free plan caps a Worker invocation at 50 queries, and CLAUDE.md §12 bars
 * looping a query per arsenal or per model. Everything below is a fixed number
 * of statements regardless of how large a campaign gets: models are written
 * with one multi-row INSERT, not one INSERT each.
 */

/**
 * The nearest thing D1 offers to a policy: a guard that refuses to run at all
 * without a subject.
 *
 * Postgres would reject an unscoped read through RLS. SQLite cannot, so this
 * turns the failure that matters — a caller that forgot to say who is asking,
 * and would otherwise query the whole table — from a silent data leak into a
 * thrown error on the first call. It is not row-level security; it is the part
 * of row-level security that catches mistakes, done by hand.
 */
function requireSubject(userId, fn) {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error(`${fn} was called without a user — refusing to touch the database.`)
  }
  return userId
}

/** Reading is one row: `doc` is the source of truth, the columns are a projection. */
export async function listCampaigns(userId, env) {
  requireSubject(userId, 'listCampaigns')
  const { results } = await env.DB.prepare(
    `SELECT id, doc, schema_version, updated_at
       FROM campaigns
      WHERE owner_user_id = ?
      ORDER BY updated_at DESC`
  ).bind(userId).all()

  return (results || []).map(fromRow)
}

export async function getCampaign(userId, campaignId, env) {
  requireSubject(userId, 'getCampaign')
  const row = await env.DB.prepare(
    `SELECT id, doc, schema_version, updated_at
       FROM campaigns
      WHERE id = ? AND owner_user_id = ?`
  ).bind(campaignId, userId).first()

  return row ? fromRow(row) : null
}

/**
 * Writes a campaign, and its projection, as this user's.
 *
 * `owner_user_id` is taken from the session, never from the payload — a client
 * that posts someone else's id must not be able to write to their shelf, and
 * the ON CONFLICT clause re-asserts the owner so an existing row cannot be
 * hijacked by id collision either.
 */
export async function putCampaign(userId, campaign, env) {
  requireSubject(userId, 'putCampaign')

  /**
   * One ownership gate, before anything is written.
   *
   * The first version relied on a `WHERE owner_user_id = ?` on each statement,
   * and that failed exactly the way per-statement guards fail: the DELETE that
   * clears `arsenal_models` has no owner column of its own, so it had no guard,
   * and a signed-in stranger PUTting to someone else's campaign id wiped their
   * model rows while the protected statements quietly did nothing. Found by
   * testing it rather than by reading it.
   *
   * A single gate cannot be forgotten on the one statement that looks
   * different. It costs one query.
   */
  const existing = await env.DB.prepare(
    'SELECT owner_user_id FROM campaigns WHERE id = ?'
  ).bind(campaign.id).first()

  if (existing && existing.owner_user_id !== userId) {
    return { forbidden: true }
  }

  const now = Date.now()
  const doc = JSON.stringify(campaign)
  const arsenal = campaign.arsenals?.[0] || null

  const statements = [
    env.DB.prepare(
      `INSERT INTO campaigns
         (id, name, owner_user_id, weeks_total, started_at, week_offset,
          house_rules, join_code, created_at, doc, schema_version, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name           = excluded.name,
         weeks_total    = excluded.weeks_total,
         started_at     = excluded.started_at,
         week_offset    = excluded.week_offset,
         house_rules    = excluded.house_rules,
         doc            = excluded.doc,
         schema_version = excluded.schema_version,
         updated_at     = excluded.updated_at
       WHERE campaigns.owner_user_id = ?`
    ).bind(
      campaign.id,
      campaign.name || '',
      userId,
      campaign.weeksTotal ?? 12,
      campaign.startedAt ?? now,
      campaign.weekOffset ?? 0,
      JSON.stringify(campaign.houseRules || {}),
      campaign.joinCode ?? null,
      campaign.startedAt ?? now,
      doc,
      campaign.schemaVersion ?? 1,
      now,
      userId
    ),
  ]

  if (arsenal) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO arsenals
           (id, campaign_id, user_id, faction, keyword_a, keyword_b, scrip,
            leader, crew_card, total_cost, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           faction    = excluded.faction,
           keyword_a  = excluded.keyword_a,
           keyword_b  = excluded.keyword_b,
           scrip      = excluded.scrip,
           leader     = excluded.leader,
           crew_card  = excluded.crew_card,
           total_cost = excluded.total_cost,
           updated_at = excluded.updated_at
         WHERE arsenals.user_id = ?`
      ).bind(
        arsenal.id,
        campaign.id,
        userId,
        arsenal.faction || '',
        arsenal.keywords?.[0] || '',
        arsenal.keywords?.[1] || '',
        arsenal.scrip ?? 0,
        JSON.stringify(arsenal.leader || {}),
        JSON.stringify(arsenal.crewCard || {}),
        (arsenal.models || []).reduce((sum, m) => sum + (m.cost || 0), 0),
        now,
        userId
      )
    )

    // Replace rather than diff. A campaign's model list is small, and a
    // delete-then-insert pair is two statements whatever its length, where
    // diffing would be a query per changed row.
    // Scoped through `arsenals` as well as gated above — the row this deletes
    // has no owner column, so it borrows one. Defence in depth for the only
    // statement here that destroys anything.
    statements.push(
      env.DB.prepare(
        `DELETE FROM arsenal_models
          WHERE arsenal_id = ?
            AND arsenal_id IN (
              SELECT id FROM arsenals WHERE campaign_id = ? AND user_id = ?
            )`
      ).bind(arsenal.id, campaign.id, userId)
    )

    const models = (arsenal.models || []).filter((m) => m?.id)
    if (models.length > 0) {
      const placeholders = models.map(() => '(?,?,?,?,?,?,?,?,?)').join(',')
      const values = models.flatMap((m) => [
        m.id,
        arsenal.id,
        m.slug ?? null,
        m.name || '',
        m.cost ?? 0,
        m.addedWeek ?? 0,
        m.scripPaid ?? 0,
        m.titleGroup ?? null,
        m.annihilated ? 1 : 0,
      ])
      statements.push(
        env.DB.prepare(
          `INSERT INTO arsenal_models
             (id, arsenal_id, slug, name, cost, added_week, scrip_paid, title_group, annihilated)
           VALUES ${placeholders}`
        ).bind(...values)
      )
    }
  }

  await env.DB.batch(statements)
  return { id: campaign.id, updatedAt: now }
}

export async function deleteCampaign(userId, campaignId, env) {
  requireSubject(userId, 'deleteCampaign')
  // ON DELETE CASCADE clears arsenals and their models.
  const result = await env.DB.prepare(
    'DELETE FROM campaigns WHERE id = ? AND owner_user_id = ?'
  ).bind(campaignId, userId).run()

  return (result.meta?.changes ?? 0) > 0
}

/**
 * The stored document, with the row's authority stamped back onto it.
 *
 * `updatedAt` comes from the column rather than the doc, because the column is
 * what the server controls — a client could otherwise post a doc claiming to be
 * newer than it is and win every merge.
 */
function fromRow(row) {
  let doc = {}
  try {
    doc = JSON.parse(row.doc || '{}')
  } catch {
    // A row we cannot parse is worse than useless in a merge — report it as
    // empty so the local copy wins rather than silently replacing good data.
    return { id: row.id, updatedAt: row.updated_at || 0, corrupt: true }
  }
  return { ...doc, id: row.id, updatedAt: row.updated_at || 0 }
}

/**
 * Erases an account and everything filed under it.
 *
 * Nothing here is soft-deleted. The Discord id, display name and avatar are the
 * only personal data this project holds, and the honest answer to "delete my
 * account" is that the rows stop existing — not that a flag is set on them.
 *
 * `campaigns` and `sessions` cascade from `users` in 0001, but the deletes are
 * explicit and ordered anyway: relying on a foreign key to erase somebody's
 * data means relying on a `PRAGMA foreign_keys` that a future connection might
 * not have set.
 */
export async function deleteAccount(userId, env) {
  requireSubject(userId, 'deleteAccount')

  const owned = await env.DB.prepare(
    'SELECT id FROM campaigns WHERE owner_user_id = ?'
  ).bind(userId).all()
  const ids = (owned.results || []).map((r) => r.id)

  const statements = []

  if (ids.length > 0) {
    const marks = ids.map(() => '?').join(',')
    statements.push(
      env.DB.prepare(
        `DELETE FROM arsenal_models WHERE arsenal_id IN
           (SELECT id FROM arsenals WHERE campaign_id IN (${marks}))`
      ).bind(...ids),
      env.DB.prepare(`DELETE FROM arsenals WHERE campaign_id IN (${marks})`).bind(...ids),
      env.DB.prepare(`DELETE FROM campaigns WHERE owner_user_id = ?`).bind(userId)
    )
  }

  statements.push(
    env.DB.prepare('DELETE FROM arsenals WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId)
  )

  await env.DB.batch(statements)
  return { deletedCampaigns: ids.length }
}
