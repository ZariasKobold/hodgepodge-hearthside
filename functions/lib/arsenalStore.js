/**
 * The arsenal, server side.
 *
 * Written to `campaignStore.js`'s rules rather than beside them, because there
 * is no row-level security in D1 and every authorization decision here is a
 * line of code somebody has to have written on purpose (CLAUDE.md §12):
 *
 *   1. every exported function takes `userId` first;
 *   2. `requireSubject` throws if it is missing, so a forgotten id becomes an
 *      exception rather than a query across everybody's rows;
 *   3. **one ownership gate before any write**, never a guard per statement.
 *
 * Rule 3 is not stylistic. The first version of `campaignStore` guarded each
 * statement individually, and the `DELETE FROM arsenal_models` had no owner
 * column to guard on — so a signed-in stranger could wipe another player's
 * model rows while the protected statements quietly did nothing. That hole is
 * why this file has its own attack tests.
 *
 * ## `doc` is the truth; the columns are what other people may read
 *
 * Same split as campaigns, and here it is also the privacy boundary. The shared
 * arsenal page reads the **columns** and never `doc`, because a member is
 * entitled to the arsenal (public by p. 14) and not to everything. Anything not
 * projected below is invisible to other players.
 */

function requireSubject(userId, fn) {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error(`${fn} was called without a user — refusing to touch the database.`)
  }
  return userId
}

function fromRow(row) {
  let doc = {}
  try {
    doc = JSON.parse(row.doc || '{}')
  } catch {
    // A row we cannot parse is worse than useless in a merge — report it as
    // corrupt so the local copy wins rather than silently replacing good data.
    return {
      id: row.id,
      updatedAt: row.updated_at || 0,
      version: Number.isInteger(row.version) ? row.version : 0,
      corrupt: true,
    }
  }
  return {
    ...doc,
    id: row.id,
    updatedAt: row.updated_at || 0,
    version: Number.isInteger(row.version) ? row.version : 0,
  }
}

/**
 * This account's arsenals.
 *
 * Scoped by `user_id`, which without RLS *is* the access control — hence the
 * index added in 0005. A row whose `doc` has never been written by a v3 client
 * is skipped rather than returned as an empty arsenal: `doc IS NULL` means the
 * projection is all that exists, and handing back `{}` would look to `planSync`
 * like an arsenal the account holds and this device should adopt.
 */
export async function listArsenals(userId, env) {
  requireSubject(userId, 'listArsenals')
  const { results } = await env.DB.prepare(
    `SELECT id, doc, schema_version, updated_at, version
       FROM arsenals
      WHERE user_id = ? AND doc IS NOT NULL
      ORDER BY updated_at DESC`
  ).bind(userId).all()

  return (results || []).map(fromRow)
}

export async function getArsenal(userId, arsenalId, env) {
  requireSubject(userId, 'getArsenal')
  const row = await env.DB.prepare(
    `SELECT id, doc, schema_version, updated_at, version
       FROM arsenals
      WHERE id = ? AND user_id = ? AND doc IS NOT NULL`
  ).bind(arsenalId, userId).first()

  return row ? fromRow(row) : null
}

/**
 * Writes an arsenal as this user's.
 *
 * `user_id` comes from the session and never from the payload, and the
 * ON CONFLICT clause re-asserts it, so an existing row cannot be hijacked by
 * posting somebody else's id.
 */
export async function putArsenal(userId, arsenal, env, { baseVersion = null } = {}) {
  requireSubject(userId, 'putArsenal')
  if (!arsenal?.id) return { invalid: 'An arsenal needs an id.' }

  // One gate, before anything is written. See the header.
  const existing = await env.DB.prepare(
    `SELECT user_id, updated_at, version, schema_version,
            (doc IS NOT NULL) AS has_doc
       FROM arsenals WHERE id = ?`
  ).bind(arsenal.id).first()

  if (existing && existing.user_id !== userId) {
    return { forbidden: true }
  }

  /**
   * A row without a `doc` is not a document — it is a **projection left behind
   * by a v2 campaign push**, which wrote the `arsenals` columns for the shared
   * page and had no arsenal document to store.
   *
   * Treating it as an existing document deadlocks the first push, and did:
   * the gate demanded `baseVersion === 0`, while `listArsenals` skips
   * `doc IS NULL` rows — so the client could not push without a version it
   * could not be told. Neither half was wrong on its own.
   *
   * Semantically this *is* a creation: no client has ever written this
   * arsenal, so there is nothing to conflict with and nobody can have seen it.
   * The **ownership** gate above still applies — the row has an owner, and it
   * is not up for grabs.
   *
   * Only a database carrying real v2 history has rows like this. A fresh one
   * never would, which is why this was found by restoring the backup rather
   * than by testing against an empty schema.
   */
  const isFirstDocument = existing && !existing.has_doc

  if (existing && !isFirstDocument) {
    /**
     * Exact equality against a server-assigned integer, never a comparison of
     * clocks — the rule 0004 established for campaigns and the reason it was
     * established. A client may only write if it names the version it is
     * replacing, which it can only know by having been told.
     *
     * `seen === null` is refused too: a row exists and this client has never
     * seen the server's copy, so it cannot be replacing it knowingly.
     */
    const stored = Number.isInteger(existing.version) ? existing.version : 0
    const seen = Number.isInteger(baseVersion) ? baseVersion : null
    if (seen === null || seen !== stored) {
      return { stale: true, serverVersion: stored, serverUpdatedAt: existing.updated_at }
    }

    /**
     * Never let a write walk the shape backwards.
     *
     * An old client — a tab left open from before the cutover — holds a
     * document of an earlier shape. If it ever pushed, it would file down a v3
     * arsenal into whatever it understood. The version gate cannot catch this:
     * a stale client that has pulled holds a perfectly valid base version.
     */
    const storedShape = Number.isInteger(existing.schema_version) ? existing.schema_version : 0
    const incomingShape = Number.isInteger(arsenal.schemaVersion) ? arsenal.schemaVersion : 0
    if (incomingShape < storedShape) {
      return { outdatedShape: true, storedSchemaVersion: storedShape }
    }
  }

  const now = Date.now()
  const nextVersion = (Number.isInteger(existing?.version) ? existing.version : 0) + 1
  const doc = JSON.stringify(arsenal)
  const models = (arsenal.models || []).filter((m) => m?.id)

  const statements = [
    env.DB.prepare(
      `INSERT INTO arsenals
         (id, campaign_id, user_id, faction, keyword_a, keyword_b, scrip,
          leader, crew_card, total_cost, updated_at,
          injuries, equipment, totem, doc, schema_version, version)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         campaign_id    = excluded.campaign_id,
         faction        = excluded.faction,
         keyword_a      = excluded.keyword_a,
         keyword_b      = excluded.keyword_b,
         scrip          = excluded.scrip,
         leader         = excluded.leader,
         crew_card      = excluded.crew_card,
         total_cost     = excluded.total_cost,
         updated_at     = excluded.updated_at,
         injuries       = excluded.injuries,
         equipment      = excluded.equipment,
         totem          = excluded.totem,
         doc            = excluded.doc,
         schema_version = excluded.schema_version,
         version        = excluded.version
       WHERE arsenals.user_id = ?`
    ).bind(
      arsenal.id,
      // Nullable since 0006, and deliberately so: an arsenal at no table is an
      // ordinary state, and the campaign it names may not have been pushed yet.
      arsenal.campaignId ?? null,
      userId,
      arsenal.faction || '',
      arsenal.keywords?.[0] || '',
      arsenal.keywords?.[1] || '',
      arsenal.scrip ?? 0,
      JSON.stringify(arsenal.leader || {}),
      JSON.stringify(arsenal.crewCard || {}),
      models.reduce((sum, m) => sum + (m.annihilated ? 0 : m.cost || 0), 0),
      now,
      JSON.stringify(arsenal.injuries || []),
      JSON.stringify(arsenal.equipment || []),
      arsenal.totem ? JSON.stringify(arsenal.totem) : null,
      doc,
      arsenal.schemaVersion ?? 3,
      nextVersion,
      userId
    ),

    /**
     * Replace rather than diff — a roster is small, and this is two statements
     * whatever its length where diffing would be a query per changed row.
     *
     * Scoped through `arsenals` as well as gated above. This row has no owner
     * column of its own, so it borrows one; that is the exact statement the
     * v0.7.0 hole was found in, and defence in depth on the only statement here
     * that destroys anything is cheap.
     */
    env.DB.prepare(
      `DELETE FROM arsenal_models
        WHERE arsenal_id = ?
          AND arsenal_id IN (SELECT id FROM arsenals WHERE user_id = ?)`
    ).bind(arsenal.id, userId),
  ]

  if (models.length > 0) {
    const placeholders = models.map(() => '(?,?,?,?,?,?,?,?,?)').join(',')
    statements.push(
      env.DB.prepare(
        `INSERT INTO arsenal_models
           (id, arsenal_id, slug, name, cost, added_week, scrip_paid, title_group, annihilated)
         VALUES ${placeholders}`
      ).bind(...models.flatMap((m) => [
        m.id, arsenal.id, m.slug ?? null, m.name || '', m.cost ?? 0,
        m.addedWeek ?? 0, m.scripPaid ?? 0, m.titleGroup ?? null, m.annihilated ? 1 : 0,
      ]))
    )
  }

  await env.DB.batch(statements)
  // The client must be told the version it just created, or its very next save
  // names a version already one behind and is refused.
  return { id: arsenal.id, updatedAt: now, version: nextVersion }
}

/**
 * Forget an arsenal.
 *
 * Scoped by owner, and it does **not** touch the campaign. Other players may
 * still be sitting at that table; leaving is one player's act, not the table's
 * end. The reverse direction — a deleted campaign releasing its arsenals rather
 * than deleting them — is 0006's `ON DELETE SET NULL`.
 */
export async function deleteArsenal(userId, arsenalId, env) {
  requireSubject(userId, 'deleteArsenal')
  const res = await env.DB.prepare(
    'DELETE FROM arsenals WHERE id = ? AND user_id = ?'
  ).bind(arsenalId, userId).run()
  // `arsenal_models` goes with it: that FK has cascaded since 0001 and is the
  // one cascade in this schema that is still correct.
  return { deleted: (res?.meta?.changes ?? 0) > 0 }
}
