import { describe, it, expect } from 'vitest'
import {
  roleIn, createInvite, listInvites, revokeInvite, redeemInvite,
  listMembers, admitMember, removeMember, setMemberProfile,
  linkCampaign, listSharedArsenals, listMemberships,
  mintToken, hashToken, MEMBER_PENDING, MEMBER_ACTIVE,
} from './membershipStore.js'

/**
 * Authorization tests for membership — the first feature in this project that
 * shows one user's data to another.
 *
 * `campaignStore.test.js` exists because a hand-run attack found a real hole.
 * These exist because the same class of mistake is now one `WHERE` away from
 * leaking a stranger someone's Discord identity, and there is still no
 * row-level security underneath to catch it.
 *
 * CLAUDE.md names five attacks this feature must refuse before it ships. All
 * five are here, plus the ones that fall out of the two-gate design.
 *
 * The fake D1 answers per statement rather than with one canned row, because
 * every function below reads a role first and then acts on it — a fake that
 * returns the same thing twice cannot tell a refusal from an accident.
 */
function fakeDB(handlers = []) {
  const log = []

  const match = (sql, binds) => {
    for (const [pattern, value] of handlers) {
      if (sql.includes(pattern)) {
        return typeof value === 'function' ? value(binds) : value
      }
    }
    return null
  }

  const statement = (raw) => {
    const sql = raw.replace(/\s+/g, ' ').trim()
    const entry = { sql, binds: [] }
    log.push(entry)
    const api = {
      bind: (...binds) => { entry.binds = binds; return api },
      first: async () => match(sql, entry.binds),
      all: async () => ({ results: match(sql, entry.binds) ?? [] }),
      run: async () => match(sql, entry.binds) ?? { meta: { changes: 1 } },
    }
    return api
  }

  return {
    log,
    sqls: () => log.map((l) => l.sql),
    DB: { prepare: statement, batch: async (s) => s.map(() => ({})) },
  }
}

/** The role query is the gate every function opens with. */
const asRole = (owner, status) => ['FROM campaigns c LEFT JOIN campaign_members', { owner, status }]

const OWNER = 'usr_host'
const MEMBER = 'usr_member'
const STRANGER = 'usr_stranger'
const HOST_CAMPAIGN = 'cmp_host'

/* ── tokens ─────────────────────────────────────────────────────── */

describe('invite tokens', () => {
  it('are unguessable and never stored in the clear', async () => {
    const a = mintToken()
    const b = mintToken()
    expect(a).not.toEqual(b)
    expect(a.length).toBeGreaterThanOrEqual(40)
    // URL-safe, so the link needs no escaping and cannot be mangled in a chat.
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)

    const hash = await hashToken(a)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(a)
    expect(await hashToken(a)).toBe(hash)
    expect(await hashToken(b)).not.toBe(hash)
  })

  it('stores the hash, not the token', async () => {
    const db = fakeDB([asRole(OWNER, null)])
    const invite = await createInvite(OWNER, HOST_CAMPAIGN, db)
    const insert = db.log.find((l) => l.sql.includes('INSERT INTO campaign_invites'))
    expect(insert.binds).toContain(await hashToken(invite.token))
    expect(insert.binds).not.toContain(invite.token)
  })
})

/* ── the gate ───────────────────────────────────────────────────── */

describe('roleIn', () => {
  it('refuses to run without a subject', async () => {
    await expect(roleIn('', HOST_CAMPAIGN, fakeDB())).rejects.toThrow(/without a user/)
    await expect(roleIn(null, HOST_CAMPAIGN, fakeDB())).rejects.toThrow(/without a user/)
  })

  it('distinguishes owner, active, pending and nobody', async () => {
    expect(await roleIn(OWNER, HOST_CAMPAIGN, fakeDB([asRole(OWNER, null)]))).toBe('owner')
    expect(await roleIn(MEMBER, HOST_CAMPAIGN, fakeDB([asRole(OWNER, MEMBER_ACTIVE)]))).toBe('active')
    expect(await roleIn(MEMBER, HOST_CAMPAIGN, fakeDB([asRole(OWNER, MEMBER_PENDING)]))).toBe('pending')
    expect(await roleIn(STRANGER, HOST_CAMPAIGN, fakeDB([asRole(OWNER, null)]))).toBe(null)
  })

  it('binds the caller, so the join cannot match somebody else’s membership', async () => {
    const db = fakeDB([asRole(OWNER, null)])
    await roleIn(MEMBER, HOST_CAMPAIGN, db)
    expect(db.log[0].binds).toEqual([MEMBER, HOST_CAMPAIGN])
  })
})

/* ── CLAUDE.md's five ───────────────────────────────────────────── */

describe('the five attacks CLAUDE.md requires refusing', () => {
  it('1. a non-member reading a shared campaign is refused', async () => {
    const db = fakeDB([asRole(OWNER, null)])
    const result = await listSharedArsenals(STRANGER, HOST_CAMPAIGN, db)
    expect(result.forbidden).toBe(true)
    // And nothing was read: the refusal happens before any data query.
    expect(db.sqls().some((s) => s.includes('FROM arsenals'))).toBe(false)
  })

  it('2. a member writing another member’s arsenal is refused', async () => {
    // There is no code path for it — membership never widened writes. The
    // arsenal write lives in campaignStore and is scoped to the owner; this
    // module exports nothing that touches `arsenals` or `arsenal_models`.
    const writers = [
      createInvite, listInvites, revokeInvite, redeemInvite, listMembers,
      admitMember, removeMember, setMemberProfile, linkCampaign,
      listSharedArsenals, listMemberships,
    ]
    for (const fn of writers) {
      expect(fn.toString()).not.toMatch(/INSERT INTO arsenal|UPDATE arsenals|DELETE FROM arsenal/i)
    }
  })

  it('3. a member deleting a campaign they do not own is refused', async () => {
    // `linkCampaign` is the only statement here that writes the campaigns
    // table, and it can only ever touch rows the caller owns.
    const db = fakeDB([
      asRole(OWNER, MEMBER_ACTIVE),
      ['UPDATE campaigns SET member_of', { meta: { changes: 0 } }],
    ])
    const result = await linkCampaign(MEMBER, 'cmp_someone_else', HOST_CAMPAIGN, db)
    expect(result.forbidden).toBe(true)
    const update = db.log.find((l) => l.sql.includes('UPDATE campaigns SET member_of'))
    expect(update.sql).toContain('owner_user_id = ?')
    expect(update.binds).toContain(MEMBER)
  })

  it('4. a revoked or expired invite is refused', async () => {
    const revoked = fakeDB([['FROM campaign_invites WHERE token_hash', {
      id: 'inv_1', campaign_id: HOST_CAMPAIGN, expires_at: Date.now() + 1000,
      redeemed_by: null, revoked_at: Date.now() - 10,
    }]])
    expect((await redeemInvite(STRANGER, 'tok', revoked)).error).toBe('revoked')

    const expired = fakeDB([['FROM campaign_invites WHERE token_hash', {
      id: 'inv_2', campaign_id: HOST_CAMPAIGN, expires_at: Date.now() - 1,
      redeemed_by: null, revoked_at: null,
    }]])
    expect((await redeemInvite(STRANGER, 'tok', expired)).error).toBe('expired')

    // Neither wrote a membership row.
    for (const db of [revoked, expired]) {
      expect(db.sqls().some((s) => s.includes('INSERT INTO campaign_members'))).toBe(false)
    }
  })

  it('5. a redeemed invite cannot be reused', async () => {
    const db = fakeDB([['FROM campaign_invites WHERE token_hash', {
      id: 'inv_3', campaign_id: HOST_CAMPAIGN, expires_at: Date.now() + 1000,
      redeemed_by: 'usr_first', revoked_at: null,
    }]])
    expect((await redeemInvite(STRANGER, 'tok', db)).error).toBe('already-redeemed')
    expect(db.sqls().some((s) => s.includes('INSERT INTO campaign_members'))).toBe(false)
  })

  /**
   * Two requests can pass the read at the same time, so single-use is enforced
   * where it cannot race: in the UPDATE's own WHERE clause.
   */
  it('5b. loses the race rather than admitting two people', async () => {
    const db = fakeDB([
      ['FROM campaign_invites WHERE token_hash', {
        id: 'inv_4', campaign_id: HOST_CAMPAIGN, expires_at: Date.now() + 1000,
        redeemed_by: null, revoked_at: null,
      }],
      asRole(OWNER, null),
      ['UPDATE campaign_invites', { meta: { changes: 0 } }],
    ])
    expect((await redeemInvite(STRANGER, 'tok', db)).error).toBe('already-redeemed')
    const claim = db.log.find((l) => l.sql.includes('UPDATE campaign_invites SET redeemed_by'))
    expect(claim.sql).toContain('redeemed_by IS NULL')
    expect(claim.sql).toContain('revoked_at IS NULL')
    expect(db.sqls().some((s) => s.includes('INSERT INTO campaign_members'))).toBe(false)
  })
})

/* ── the second gate ────────────────────────────────────────────── */

describe('pending is not a member', () => {
  it('cannot read the shared arsenals', async () => {
    const db = fakeDB([asRole(OWNER, MEMBER_PENDING)])
    expect((await listSharedArsenals(MEMBER, HOST_CAMPAIGN, db)).forbidden).toBe(true)
  })

  it('cannot read the member list', async () => {
    const db = fakeDB([asRole(OWNER, MEMBER_PENDING)])
    expect((await listMembers(MEMBER, HOST_CAMPAIGN, db)).forbidden).toBe(true)
  })

  it('cannot link a campaign in — that needs admitting first', async () => {
    const db = fakeDB([asRole(OWNER, MEMBER_PENDING)])
    expect((await linkCampaign(MEMBER, 'cmp_mine', HOST_CAMPAIGN, db)).forbidden).toBe(true)
  })

  it('is what redeeming an invite makes you, never active', async () => {
    const db = fakeDB([
      ['FROM campaign_invites WHERE token_hash', {
        id: 'inv_5', campaign_id: HOST_CAMPAIGN, expires_at: Date.now() + 1000,
        redeemed_by: null, revoked_at: null,
      }],
      asRole(OWNER, null),
    ])
    const result = await redeemInvite(STRANGER, 'tok', db)
    expect(result.status).toBe(MEMBER_PENDING)
    const insert = db.log.find((l) => l.sql.includes('INSERT INTO campaign_members'))
    expect(insert.binds).toContain(MEMBER_PENDING)
    expect(insert.binds).not.toContain(MEMBER_ACTIVE)
  })
})

/* ── only the host runs the door ────────────────────────────────── */

describe('invites and admission are the host’s alone', () => {
  const notOwner = [
    ['an active member', MEMBER_ACTIVE],
    ['a pending applicant', MEMBER_PENDING],
    ['a stranger', null],
  ]

  for (const [who, status] of notOwner) {
    it(`refuses ${who} issuing an invite`, async () => {
      const db = fakeDB([asRole(OWNER, status)])
      expect((await createInvite(MEMBER, HOST_CAMPAIGN, db)).forbidden).toBe(true)
      expect(db.sqls().some((s) => s.includes('INSERT INTO campaign_invites'))).toBe(false)
    })

    it(`refuses ${who} listing invites`, async () => {
      const db = fakeDB([asRole(OWNER, status)])
      expect((await listInvites(MEMBER, HOST_CAMPAIGN, db)).forbidden).toBe(true)
    })

    it(`refuses ${who} admitting somebody`, async () => {
      const db = fakeDB([asRole(OWNER, status)])
      expect((await admitMember(MEMBER, HOST_CAMPAIGN, STRANGER, db)).forbidden).toBe(true)
      expect(db.sqls().some((s) => s.includes('UPDATE campaign_members SET status'))).toBe(false)
    })
  }

  it('refuses a member revoking someone else’s invite', async () => {
    const db = fakeDB([
      ['SELECT campaign_id FROM campaign_invites WHERE id', { campaign_id: HOST_CAMPAIGN }],
      asRole(OWNER, MEMBER_ACTIVE),
    ])
    expect((await revokeInvite(MEMBER, 'inv_1', db)).forbidden).toBe(true)
    expect(db.sqls().some((s) => s.includes('UPDATE campaign_invites SET revoked_at'))).toBe(false)
  })

  it('lets the host admit, and only from pending', async () => {
    const db = fakeDB([asRole(OWNER, null), ['UPDATE campaign_members SET status', { meta: { changes: 1 } }]])
    expect((await admitMember(OWNER, HOST_CAMPAIGN, MEMBER, db)).admitted).toBe(MEMBER)
    const update = db.log.find((l) => l.sql.includes('UPDATE campaign_members SET status'))
    expect(update.binds).toEqual([MEMBER_ACTIVE, HOST_CAMPAIGN, MEMBER, MEMBER_PENDING])
  })
})

/* ── removal ────────────────────────────────────────────────────── */

describe('removal', () => {
  it('lets the host remove anyone', async () => {
    const db = fakeDB([asRole(OWNER, null)])
    expect((await removeMember(OWNER, HOST_CAMPAIGN, MEMBER, db)).removed).toBe(MEMBER)
  })

  it('lets a member remove themselves', async () => {
    const db = fakeDB([asRole(OWNER, MEMBER_ACTIVE)])
    expect((await removeMember(MEMBER, HOST_CAMPAIGN, MEMBER, db)).removed).toBe(MEMBER)
  })

  it('refuses a member removing someone else', async () => {
    const db = fakeDB([asRole(OWNER, MEMBER_ACTIVE)])
    expect((await removeMember(MEMBER, HOST_CAMPAIGN, STRANGER, db)).forbidden).toBe(true)
  })

  it('refuses a stranger removing anyone, including themselves', async () => {
    const db = fakeDB([asRole(OWNER, null)])
    expect((await removeMember(STRANGER, HOST_CAMPAIGN, STRANGER, db)).forbidden).toBe(true)
  })

  it('unlinks only the departing user’s own campaigns', async () => {
    const db = fakeDB([asRole(OWNER, null)])
    await removeMember(OWNER, HOST_CAMPAIGN, MEMBER, db)
    const unlink = db.log.find((l) => l.sql.includes('UPDATE campaigns SET member_of = NULL'))
    expect(unlink.sql).toContain('owner_user_id = ?')
    expect(unlink.binds).toEqual([HOST_CAMPAIGN, MEMBER])
  })
})

/* ── identity ───────────────────────────────────────────────────── */

describe('what crosses the member boundary', () => {
  const memberRow = (share) => ({
    user_id: MEMBER, role: 'player', joined_at: 1, status: MEMBER_ACTIVE,
    nickname: 'The Ferryman', share_identity: share,
    display_name: 'realname#1234', avatar_url: 'https://cdn/avatar.png',
  })

  it('sends the nickname and nothing else by default', async () => {
    const db = fakeDB([
      asRole(OWNER, null),
      ['FROM campaign_members m JOIN users u', [memberRow(0)]],
    ])
    const { members } = await listMembers(OWNER, HOST_CAMPAIGN, db)
    expect(members[0].nickname).toBe('The Ferryman')
    expect(members[0].sharesIdentity).toBe(false)
    expect(members[0]).not.toHaveProperty('displayName')
    expect(members[0]).not.toHaveProperty('avatarUrl')
    expect(JSON.stringify(members)).not.toContain('realname')
    expect(JSON.stringify(members)).not.toContain('avatar.png')
  })

  it('sends the Discord name only where the member opted in', async () => {
    const db = fakeDB([
      asRole(OWNER, null),
      ['FROM campaign_members m JOIN users u', [memberRow(1)]],
    ])
    const { members } = await listMembers(OWNER, HOST_CAMPAIGN, db)
    expect(members[0].displayName).toBe('realname#1234')
    expect(members[0].avatarUrl).toBe('https://cdn/avatar.png')
    expect(members[0].sharesIdentity).toBe(true)
  })

  it('treats anything but exactly 1 as not shared', async () => {
    for (const value of [0, null, undefined, '1', 2, true]) {
      const db = fakeDB([
        asRole(OWNER, null),
        ['FROM campaign_members m JOIN users u', [{ ...memberRow(0), share_identity: value }]],
      ])
      const { members } = await listMembers(OWNER, HOST_CAMPAIGN, db)
      expect(members[0].sharesIdentity).toBe(false)
      expect(members[0]).not.toHaveProperty('displayName')
    }
  })

  it('hides pending applicants from members, but not from the host', async () => {
    const rows = [
      memberRow(0),
      { ...memberRow(0), user_id: STRANGER, status: MEMBER_PENDING, nickname: 'Hopeful' },
    ]
    const asHost = fakeDB([asRole(OWNER, null), ['FROM campaign_members m JOIN users u', rows]])
    expect((await listMembers(OWNER, HOST_CAMPAIGN, asHost)).members).toHaveLength(2)

    const asMember = fakeDB([asRole(OWNER, MEMBER_ACTIVE), ['FROM campaign_members m JOIN users u', rows]])
    const seen = (await listMembers(MEMBER, HOST_CAMPAIGN, asMember)).members
    expect(seen).toHaveLength(1)
    expect(JSON.stringify(seen)).not.toContain('Hopeful')
  })
})

describe('a member’s profile is their own', () => {
  it('always writes the caller’s row, never a named one', async () => {
    const db = fakeDB([asRole(OWNER, MEMBER_ACTIVE)])
    await setMemberProfile(MEMBER, HOST_CAMPAIGN, { nickname: 'Me', shareIdentity: true }, db)
    const update = db.log.find((l) => l.sql.includes('UPDATE campaign_members SET nickname'))
    expect(update.sql).toContain('WHERE campaign_id = ? AND user_id = ?')
    expect(update.binds).toEqual(['Me', 1, HOST_CAMPAIGN, MEMBER])
  })

  it('refuses a stranger entirely', async () => {
    const db = fakeDB([asRole(OWNER, null)])
    expect((await setMemberProfile(STRANGER, HOST_CAMPAIGN, { nickname: 'x' }, db)).forbidden).toBe(true)
  })

  it('caps a nickname rather than storing whatever arrives', async () => {
    const db = fakeDB([asRole(OWNER, MEMBER_ACTIVE)])
    await setMemberProfile(MEMBER, HOST_CAMPAIGN, { nickname: 'x'.repeat(500) }, db)
    const update = db.log.find((l) => l.sql.includes('UPDATE campaign_members SET nickname'))
    expect(update.binds[0].length).toBe(40)
  })

  it('defaults sharing to off for anything falsy', async () => {
    for (const value of [undefined, null, false, 0, '']) {
      const db = fakeDB([asRole(OWNER, MEMBER_ACTIVE)])
      await setMemberProfile(MEMBER, HOST_CAMPAIGN, { shareIdentity: value }, db)
      const update = db.log.find((l) => l.sql.includes('UPDATE campaign_members SET nickname'))
      expect(update.binds[1]).toBe(0)
    }
  })
})

/* ── the shared read ────────────────────────────────────────────── */

describe('the shared arsenal read', () => {
  const setup = (viewerStatus) => fakeDB([
    asRole(OWNER, viewerStatus),
    ['SELECT id, owner_user_id, name, weeks_total', [
      { id: HOST_CAMPAIGN, owner_user_id: OWNER },
      { id: 'cmp_member', owner_user_id: MEMBER },
    ]],
    ['FROM arsenals a WHERE a.campaign_id IN', [
      {
        id: 'ars_host', campaign_id: HOST_CAMPAIGN, user_id: OWNER,
        faction: 'guild', keyword_a: 'marshal', keyword_b: '', scrip: 4,
        leader: '{"name":"Hostleader"}', crew_card: '{}', total_cost: 20,
        injuries: '[]', equipment: '[]', totem: null, updated_at: 5,
      },
      {
        id: 'ars_mem', campaign_id: 'cmp_member', user_id: MEMBER,
        faction: 'neverborn', keyword_a: 'woe', keyword_b: '', scrip: 1,
        leader: '{"name":"Memberleader"}', crew_card: '{}', total_cost: 14,
        injuries: '[{"name":"Leadfooted"}]', equipment: '[]', totem: null, updated_at: 6,
      },
    ]],
    ['FROM campaign_members m JOIN users u', [{
      user_id: MEMBER, role: 'player', joined_at: 1, status: MEMBER_ACTIVE,
      nickname: 'The Ferryman', share_identity: 0,
      display_name: 'realname#1234', avatar_url: 'https://cdn/a.png',
    }]],
    ['FROM arsenal_models WHERE arsenal_id IN', [
      { id: 'm1', arsenal_id: 'ars_mem', slug: null, name: 'Bob', cost: 5, added_week: 1, scrip_paid: 5, title_group: null, annihilated: 0 },
    ]],
  ])

  it('gives an active member every participant’s arsenal', async () => {
    const { arsenals } = await listSharedArsenals(MEMBER, HOST_CAMPAIGN, setup(MEMBER_ACTIVE))
    expect(arsenals).toHaveLength(2)
    expect(arsenals.map((a) => a.leader.name)).toEqual(['Hostleader', 'Memberleader'])
    expect(arsenals[1].models[0].name).toBe('Bob')
    expect(arsenals[1].injuries[0].name).toBe('Leadfooted')
  })

  /**
   * The point of reading the projection: `doc` is the whole campaign, and a
   * member is entitled to the arsenal, not to the house rules and the week log.
   */
  it('never reads the doc column', async () => {
    const db = setup(MEMBER_ACTIVE)
    await listSharedArsenals(MEMBER, HOST_CAMPAIGN, db)
    for (const sql of db.sqls()) {
      expect(sql).not.toMatch(/\bdoc\b/)
    }
  })

  it('leaks no Discord identity for a member who did not opt in', async () => {
    const result = await listSharedArsenals(MEMBER, HOST_CAMPAIGN, setup(MEMBER_ACTIVE))
    const body = JSON.stringify(result)
    expect(body).toContain('The Ferryman')
    expect(body).not.toContain('realname')
    expect(body).not.toContain('cdn/a.png')
  })

  it('never sends another player’s user id', async () => {
    const result = await listSharedArsenals(OWNER, HOST_CAMPAIGN, setup(null))
    const others = result.arsenals.filter((a) => !a.isMine)
    for (const a of others) {
      expect(JSON.stringify(a.member)).not.toContain(MEMBER)
    }
  })

  /** D1 caps a Worker at 50 queries; §12b bars a query per member. */
  it('costs a fixed number of statements however many players there are', async () => {
    const db = setup(MEMBER_ACTIVE)
    await listSharedArsenals(MEMBER, HOST_CAMPAIGN, db)
    // role, campaigns, arsenals, members, models — five, and no more.
    expect(db.log).toHaveLength(5)
    expect(db.sqls().filter((s) => s.includes('FROM arsenal_models'))).toHaveLength(1)
  })

  it('binds the campaign on every data query, never a bare table scan', async () => {
    const db = setup(MEMBER_ACTIVE)
    await listSharedArsenals(MEMBER, HOST_CAMPAIGN, db)
    for (const entry of db.log) {
      expect(entry.binds.length).toBeGreaterThan(0)
    }
  })
})

describe('listMemberships', () => {
  it('is scoped to the caller', async () => {
    const db = fakeDB([['JOIN campaign_members m ON m.campaign_id', []]])
    await listMemberships(MEMBER, db)
    expect(db.log[0].sql).toContain('WHERE m.user_id = ?')
    expect(db.log[0].binds).toContain(MEMBER)
  })

  it('refuses without a subject', async () => {
    await expect(listMemberships('', fakeDB())).rejects.toThrow(/without a user/)
  })
})

/* ── the shape of the module ────────────────────────────────────── */

describe('the module as a whole', () => {
  it('takes userId first in every exported function', async () => {
    const fns = {
      roleIn, createInvite, listInvites, revokeInvite, redeemInvite,
      listMembers, admitMember, removeMember, setMemberProfile,
      linkCampaign, listSharedArsenals, listMemberships,
    }
    for (const [name, fn] of Object.entries(fns)) {
      const first = fn.toString().match(/\(([^,)]*)/)?.[1]?.trim()
      expect(first, `${name} should take userId first`).toBe('userId')
    }
  })

  it('refuses every entry point without a subject', async () => {
    const calls = [
      () => createInvite('', 'c', fakeDB()),
      () => listInvites('', 'c', fakeDB()),
      () => revokeInvite('', 'i', fakeDB()),
      () => redeemInvite('', 't', fakeDB()),
      () => listMembers('', 'c', fakeDB()),
      () => admitMember('', 'c', 'u', fakeDB()),
      () => removeMember('', 'c', 'u', fakeDB()),
      () => setMemberProfile('', 'c', {}, fakeDB()),
      () => linkCampaign('', 'c', 'h', fakeDB()),
      () => listSharedArsenals('', 'c', fakeDB()),
    ]
    for (const call of calls) {
      await expect(call()).rejects.toThrow(/without a user/)
    }
  })
})
