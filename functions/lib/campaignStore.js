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
    `SELECT id, doc, schema_version, updated_at, version
       FROM campaigns
      WHERE owner_user_id = ?
      ORDER BY updated_at DESC`
  ).bind(userId).all()

  return (results || []).map(fromRow)
}

export async function getCampaign(userId, campaignId, env) {
  requireSubject(userId, 'getCampaign')
  const row = await env.DB.prepare(
    `SELECT id, doc, schema_version, updated_at, version
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
export async function putCampaign(userId, campaign, env, { baseVersion = null } = {}) {
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
    'SELECT owner_user_id, updated_at, version, schema_version FROM campaigns WHERE id = ?'
  ).bind(campaign.id).first()

  if (existing && existing.owner_user_id !== userId) {
    return { forbidden: true }
  }

  /**
   * Optimistic concurrency: refuse a write from a client that has not seen the
   * copy it is about to replace.
   *
   * This write used to be unconditional, and that lost real work. `planSync`
   * compares `updatedAt` carefully to decide which copy survives a
   * reconciliation — and then `mirror` pushed on every local save without
   * comparing anything at all, so a device holding a stale copy overwrote a
   * newer one the moment its owner changed a single field. A leader portrait
   * added on one device was destroyed exactly this way.
   *
   * `baseVersion` is the `updated_at` **the server last told this client
   * about** — never a timestamp the client made up. That distinction is the
   * point: a client clock can be wrong by minutes, but "the version I last
   * saw" is a fact the client can only know by having been told, so it is not
   * subject to clock skew at all. It comes from `syncedAt`, which is stamped
   * only on a pull or on a successful push.
   *
   * Two refusals, and the second one matters more than it looks:
   *
   *   - the row moved on since the client last saw it → stale
   *   - a row exists and the client has **no** base version → also stale. It
   *     has never seen the server's copy, so it cannot be replacing it
   *     knowingly. Every existing install hits this once after this ships,
   *     pulls, and carries on — which is the correct reconciliation, and is
   *     precisely the step whose absence caused the loss.
   *
   * A brand-new campaign has no row, so adoption is unaffected.
   */
  if (existing) {
    /**
     * Never let a write walk the shape backwards — the same guard
     * `arsenalStore` applies, for the same reason. A tab left open from before
     * the cutover holds an older document, and the version gate cannot catch
     * it: a stale client that has pulled holds a perfectly valid base version.
     */
    const storedShape = Number.isInteger(existing.schema_version) ? existing.schema_version : 0
    const incomingShape = Number.isInteger(campaign.schemaVersion) ? campaign.schemaVersion : 0
    if (storedShape > 0 && incomingShape < storedShape) {
      return { outdatedShape: true, storedSchemaVersion: storedShape }
    }

    /**
     * Exact equality against a server-assigned integer, not a comparison of
     * clocks (0004).
     *
     * The previous form asked `existing.updated_at > seen`, where `seen` was
     * whatever the client last heard. That was satisfiable without the client
     * ever having merged anything: `useSync` recorded a version for every
     * campaign straight off the listing, so by the time it pushed it always
     * held "a version the server told me" and the gate always passed. The
     * contract — *has this client seen the copy it is replacing?* — was true
     * of the **device** and false of the **document**, which is the gap a
     * stale copy walked through twice.
     *
     * `!==` closes it. There is exactly one integer that means "based on what
     * is stored right now", it can only be learned by being handed it, and it
     * moves on every accepted write. A client that pulled, or that pushed
     * successfully, knows it; nobody else can guess it.
     *
     * `Number.isInteger`, not `isFinite`: a float or a NaN is not a version,
     * and NaN !== anything is true, so a NaN now refuses rather than — as it
     * once did under `>` — reading as "no conflict" and waving the write
     * through.
     */
    const stored = Number.isInteger(existing.version) ? existing.version : 0
    const seen = Number.isInteger(baseVersion) ? baseVersion : null
    if (seen === null || seen !== stored) {
      return { stale: true, serverVersion: stored, serverUpdatedAt: existing.updated_at }
    }
  }

  const now = Date.now()
  // The version this write creates. Server-assigned and monotonic: the client
  // has no say in it, which is the entire point.
  const nextVersion = (Number.isInteger(existing?.version) ? existing.version : 0) + 1
  const doc = JSON.stringify(campaign)
  /**
   * v2 only. In v3 the arsenal is its own document and its own endpoint, and a
   * campaign carries none — so this is `null` for anything the current client
   * sends, and the projection below is simply skipped.
   *
   * Kept rather than deleted because the server still holds v2 rows: a client
   * that has not yet been upgraded may still push one, and dropping this would
   * silently stop maintaining the `arsenals` projection those rows depend on
   * for the shared page. It retires when the last v2 document is gone.
   */
  const arsenal = campaign.arsenals?.[0] || null

  const statements = [
    env.DB.prepare(
      `INSERT INTO campaigns
         (id, name, owner_user_id, weeks_total, started_at, week_offset,
          house_rules, join_code, created_at, doc, schema_version, updated_at,
          version)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name           = excluded.name,
         weeks_total    = excluded.weeks_total,
         started_at     = excluded.started_at,
         week_offset    = excluded.week_offset,
         house_rules    = excluded.house_rules,
         doc            = excluded.doc,
         schema_version = excluded.schema_version,
         updated_at     = excluded.updated_at,
         version        = excluded.version
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
      nextVersion,
      userId
    ),
  ]

  if (arsenal) {
    statements.push(
      env.DB.prepare(
        /**
         * `injuries`, `equipment` and `totem` joined the projection in 0003.
         *
         * They are not for this owner — `doc` already holds them and is what
         * their own client reads. They are here because the shared page reads
         * the *columns* and never `doc`: a member is entitled to the arsenal,
         * which the rules make public (p.14), not to the whole campaign.
         * Anything not projected here is invisible to other players, which
         * makes this list the privacy boundary as much as a schema.
         */
        `INSERT INTO arsenals
           (id, campaign_id, user_id, faction, keyword_a, keyword_b, scrip,
            leader, crew_card, total_cost, updated_at,
            injuries, equipment, totem)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           faction    = excluded.faction,
           keyword_a  = excluded.keyword_a,
           keyword_b  = excluded.keyword_b,
           scrip      = excluded.scrip,
           leader     = excluded.leader,
           crew_card  = excluded.crew_card,
           total_cost = excluded.total_cost,
           updated_at = excluded.updated_at,
           injuries   = excluded.injuries,
           equipment  = excluded.equipment,
           totem      = excluded.totem
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
        JSON.stringify(arsenal.injuries || []),
        JSON.stringify(arsenal.equipment || []),
        arsenal.totem ? JSON.stringify(arsenal.totem) : null,
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
  // The client must be told the version it just created, or its very next
  // save names a version that is already one behind and is refused.
  return { id: campaign.id, updatedAt: now, version: nextVersion }
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
    return { id: row.id, updatedAt: row.updated_at || 0, version: Number.isInteger(row.version) ? row.version : 0, corrupt: true }
  }
  return {
    ...doc,
    id: row.id,
    updatedAt: row.updated_at || 0,
    // The number `planSync` actually decides on. `updatedAt` rides along for
    // display and ordering only.
    version: Number.isInteger(row.version) ? row.version : 0,
  }
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
