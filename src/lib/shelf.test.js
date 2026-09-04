import { describe, it, expect, beforeEach } from 'vitest'
import {
  createSeatedArsenal, saveSeated, readShelf, readSeated,
  isSoloTable, liftLocalShelfToV3, forgetSeated,
  resolveConflict, forkDocument, conflictExport,
} from './shelf.js'
import {
  save, load, remove, campaignIds, arsenalIds, loadCampaign, loadArsenal,
  saveCampaign, removeCampaign, removeArsenal, forgetVersion, v3LiftedAt,
} from './storage.js'

/**
 * These run against the in-memory fallback inside storage.js — jsdom is not
 * configured here and `backing()` returns null without a window, so every test
 * gets the Map. Clearing it between tests means clearing the keys we know about.
 */
function wipe() {
  for (const id of campaignIds()) { remove(`campaign:${id}`); remove(`v2-backup:campaign:${id}`) }
  for (const id of arsenalIds()) remove(`arsenal:${id}`)
  remove('campaigns:index'); remove('campaigns:active')
  remove('arsenals:index'); remove('arsenals:active')
  remove('v3:liftedAt'); remove('leader:current'); remove('campaign:current')
}

/** A v2 campaign as it actually sat in localStorage before v0.19.2. */
function v2Doc(patch = {}) {
  return {
    schemaVersion: 2,
    id: 'cmp_real',
    name: 'The Long Winter',
    weeksTotal: 12,
    startedAt: Date.UTC(2026, 0, 1),
    weekMode: 'calendar',
    weekOffset: 1,
    houseRules: { weekLengthDays: 7 },
    ownerUserId: 'u_owner',
    localArsenalId: 'ars_real',
    arsenals: [{
      id: 'ars_real', faction: 'neverborn', keywords: ['nephilim', 'woe'], scrip: 7,
      leader: { name: 'Cletus', archetype: 'generalist', experience: { boxesChecked: 3 }, advancements: [{ n: 1 }] },
      crewCard: { effect: 'Expert Coordination', choice: '' },
      models: [
        { id: 'mdl_1', name: 'Terror Tot', cost: 4, addedWeek: 0 },
        { id: 'mdl_2', name: 'Nekima', cost: 13, addedWeek: 2, scripPaid: 8 },
      ],
      injuries: [{ id: 'inj_1', name: 'Broken Arm', modelId: 'mdl_1', removedAt: null }],
      equipment: [{ id: 'eqp_1', equipmentId: 'pistol', name: 'Pistol', cc: 1 }],
      totem: null,
    }],
    games: [{ id: 'gam_1', arsenalId: 'ars_real', week: 2, result: 'win', aftermath: { phase: 'payday', done: false } }],
    ...patch,
  }
}

beforeEach(wipe)

describe('createSeatedArsenal', () => {
  it('gives a lone leader a campaign of one, silently', () => {
    // Open question 1: an implicit campaign, so soloing and a table of five are
    // one code path rather than two.
    const { arsenal, campaign } = createSeatedArsenal()
    expect(arsenal.campaignId).toBe(campaign.id)
    expect(campaign.participants).toHaveLength(1)
    expect(campaign.participants[0]).toMatchObject({
      arsenalId: arsenal.id, role: 'host', status: 'active', joinedWeek: 1,
    })
  })
  it('carries the owner onto both halves', () => {
    const { arsenal, campaign } = createSeatedArsenal({ ownerUserId: 'u1' })
    expect(arsenal.ownerUserId).toBe('u1')
    expect(campaign.ownerUserId).toBe('u1')
    expect(campaign.participants[0].userId).toBe('u1')
  })
})

describe('the v2 → v3 lift', () => {
  it('splits a stored campaign in place, keeping both ids', () => {
    save('campaign:cmp_real', v2Doc())
    save('campaigns:index', ['cmp_real'])

    const report = liftLocalShelfToV3()
    expect(report).toMatchObject({ campaigns: 1, arsenals: 1 })

    const arsenal = loadArsenal('ars_real')
    const campaign = loadCampaign('cmp_real')

    // Ids preserved — the D1 rows already exist under these.
    expect(arsenal.id).toBe('ars_real')
    expect(campaign.id).toBe('cmp_real')

    // Everything personal moved out of the campaign…
    expect(campaign.arsenals).toBeUndefined()
    expect(campaign.localArsenalId).toBeUndefined()
    // …and into the arsenal, intact.
    expect(arsenal.scrip).toBe(7)
    expect(arsenal.leader.name).toBe('Cletus')
    expect(arsenal.leader.experience.boxesChecked).toBe(3)
    expect(arsenal.models).toHaveLength(2)
    expect(arsenal.injuries).toHaveLength(1)
    expect(arsenal.equipment).toHaveLength(1)
    expect(arsenal.campaignId).toBe('cmp_real')

    // The table kept the table's things.
    expect(campaign.weeksTotal).toBe(12)
    expect(campaign.weekOffset).toBe(1)
    expect(campaign.games).toHaveLength(1)
    expect(campaign.games[0].aftermath.phase).toBe('payday')
    expect(campaign.participants[0].arsenalId).toBe('ars_real')
  })

  it('parks the untouched v2 document before overwriting it', () => {
    // The v3 campaign is written back to the same key, so the original has to
    // survive somewhere — the precedent `adoptLegacyCampaign` set.
    save('campaign:cmp_real', v2Doc())
    save('campaigns:index', ['cmp_real'])
    liftLocalShelfToV3()

    const snap = load('v2-backup:campaign:cmp_real')
    expect(snap.schemaVersion).toBe(2)
    expect(snap.arsenals[0].models).toHaveLength(2)
    expect(snap.arsenals[0].scrip).toBe(7)
  })

  it('is safe to run on every load', () => {
    save('campaign:cmp_real', v2Doc())
    save('campaigns:index', ['cmp_real'])
    liftLocalShelfToV3()

    // Play a bit, the way the app would.
    const arsenal = loadArsenal('ars_real')
    saveCampaign({ ...loadCampaign('cmp_real') })
    save('arsenal:ars_real', { ...arsenal, scrip: 99 })

    const second = liftLocalShelfToV3()
    expect(second).toMatchObject({ campaigns: 0, arsenals: 0 })
    // The second run must not re-split, and must not re-park a migrated doc as
    // though it were the original.
    expect(loadArsenal('ars_real').scrip).toBe(99)
    expect(load('v2-backup:campaign:cmp_real').arsenals[0].scrip).toBe(7)
  })

  it('records that it ran', () => {
    expect(v3LiftedAt()).toBeNull()
    liftLocalShelfToV3()
    expect(typeof v3LiftedAt()).toBe('number')
  })

  it('lifts the v0.1 single leader into an arsenal at a table of one', () => {
    save('leader:current', {
      name: 'Cletus', archetype: 'generalist', faction: 'neverborn',
      keywords: ['nephilim', 'woe'], scrip: 2,
      arsenal: [{ slug: 'tot', name: 'Terror Tot', cost: 4 }],
    })
    const report = liftLocalShelfToV3()
    expect(report.fromV01Leader).toBe(true)

    const [{ arsenal, campaign }] = readShelf()
    expect(arsenal.leader.name).toBe('Cletus')
    expect(arsenal.faction).toBe('neverborn')
    expect(arsenal.models[0].addedWeek).toBe(0)
    expect(arsenal.models[0].id).toBeTruthy()
    expect(campaign.participants[0].arsenalId).toBe(arsenal.id)
  })

  it('leaves the v0.1 leader alone once a shelf exists', () => {
    save('leader:current', { name: 'Old', arsenal: [] })
    save('campaign:cmp_real', v2Doc())
    save('campaigns:index', ['cmp_real'])
    const report = liftLocalShelfToV3()
    expect(report.fromV01Leader).toBe(false)
    expect(readShelf()).toHaveLength(1)
  })
})

describe('readShelf', () => {
  it('pairs each arsenal with the table it is playing at', () => {
    save('campaign:cmp_real', v2Doc())
    save('campaigns:index', ['cmp_real'])
    liftLocalShelfToV3()

    const shelf = readShelf()
    expect(shelf).toHaveLength(1)
    expect(shelf[0].arsenal.id).toBe('ars_real')
    expect(shelf[0].campaign.id).toBe('cmp_real')
  })

  it('still lists an arsenal that is at no table', () => {
    // An arsenal outlives its campaign by design (open question 3), so a leader
    // who has left a table still has a card on the shelf.
    const { arsenal } = createSeatedArsenal()
    saveSeated({ arsenal: { ...arsenal, campaignId: null }, campaign: null })
    const shelf = readShelf()
    expect(shelf).toHaveLength(1)
    expect(shelf[0].campaign).toBeNull()
  })
})

describe('forgetSeated', () => {
  const deps = { removeArsenal, removeCampaign, forgetVersion }

  it('takes the table with it when the leader was sitting there alone', () => {
    const seated = createSeatedArsenal()
    saveSeated(seated)
    forgetSeated(seated.arsenal.id, deps)
    expect(arsenalIds()).toEqual([])
    expect(campaignIds()).toEqual([])
  })

  it('leaves a shared table standing, minus that seat', () => {
    const seated = createSeatedArsenal()
    const shared = {
      ...seated.campaign,
      participants: [...seated.campaign.participants, { arsenalId: 'ars_theirs', role: 'player', status: 'active' }],
    }
    saveSeated({ arsenal: seated.arsenal, campaign: shared })
    expect(isSoloTable(shared, seated.arsenal.id)).toBe(false)

    forgetSeated(seated.arsenal.id, deps)
    const left = loadCampaign(shared.id)
    expect(left).toBeTruthy()
    expect(left.participants.map((p) => p.arsenalId)).toEqual(['ars_theirs'])
  })
})

describe('readSeated', () => {
  it('returns nulls rather than throwing for an id that is gone', () => {
    expect(readSeated('ars_missing')).toEqual({ arsenal: null, campaign: null })
  })
})

describe('settling a conflict', () => {
  const mine = { id: 'ars_1', schemaVersion: 3, scrip: 1, updatedAt: 2000, models: [{ id: 'm1' }, { id: 'm2' }] }
  const theirs = { id: 'ars_1', schemaVersion: 3, scrip: 6, updatedAt: 1000, version: 7, models: [{ id: 'm1' }] }

  /** Records what the resolver asked storage and the version keys to do. */
  function spy() {
    const calls = { saved: [], versions: [], dirty: [] }
    return {
      calls,
      deps: {
        saveDoc: (kind, doc, opts) => { calls.saved.push({ kind, id: doc.id, opts }); return doc },
        rememberVersion: (id, v) => calls.versions.push([id, v]),
        markDirty: (id, d) => calls.dirty.push([id, d]),
      },
    }
  }

  it('take theirs: writes the server copy as the server, and stops being dirty', () => {
    const { calls, deps } = spy()
    const out = resolveConflict({ kind: 'arsenal', choice: 'theirs', mine, theirs }, deps)
    expect(out.resolved).toBe('theirs')
    expect(out.fork).toBeNull()
    // keepTimestamp: this device did not author it, so it must not claim to have.
    expect(calls.saved).toEqual([{ kind: 'arsenal', id: 'ars_1', opts: { keepTimestamp: true } }])
    expect(calls.versions).toEqual([['ars_1', 7]])
    expect(calls.dirty).toEqual([['ars_1', false]])
  })

  it('keep mine: records the version it is knowingly replacing, and stays dirty', () => {
    // Not a bypass of the baseVersion gate — the gate asks "have you seen the
    // copy you are replacing?", and a person was just shown it and chose.
    const { calls, deps } = spy()
    const out = resolveConflict({ kind: 'arsenal', choice: 'mine', mine, theirs }, deps)
    expect(out.resolved).toBe('mine')
    expect(calls.saved).toEqual([])            // local copy already is what it is
    expect(calls.versions).toEqual([['ars_1', 7]])
    expect(calls.dirty).toEqual([['ars_1', true]])
  })

  it('keep both: forks mine to a new id and lets theirs have the old one', () => {
    const { calls, deps } = spy()
    const out = resolveConflict({ kind: 'arsenal', choice: 'both', mine, theirs }, deps)
    expect(out.resolved).toBe('both')
    expect(out.fork.id).not.toBe('ars_1')
    expect(out.fork.forkedFrom).toBe('ars_1')
    // Fork written first, then the server's copy into the original id.
    expect(calls.saved.map((s) => s.id)).toEqual([out.fork.id, 'ars_1'])
    // Only the original id has version bookkeeping; the fork is unknown to the
    // account and pushes later as an ordinary adoption.
    expect(calls.versions).toEqual([['ars_1', 7]])
  })

  it('refuses to keep both campaigns, rather than half-linking one', () => {
    const { deps } = spy()
    expect(() =>
      resolveConflict({ kind: 'campaign', choice: 'both', mine: { id: 'cmp_1' }, theirs: { id: 'cmp_1' } }, deps)
    ).toThrow(/only available for leaders/)
  })

  it('refuses a choice it does not recognise', () => {
    const { deps } = spy()
    expect(() => resolveConflict({ kind: 'arsenal', choice: 'newest', mine, theirs }, deps))
      .toThrow(/Unknown conflict resolution/)
  })
})

describe('forkDocument', () => {
  it('is verbatim — it is not duplicateArsenal', () => {
    // duplicateArsenal drops history on purpose, for "same leader, new table".
    // A conflict fork must keep everything: both sides are real histories.
    const source = { id: 'ars_1', scrip: 9, leader: { name: 'Cletus', experience: { boxesChecked: 4 } }, injuries: [{ id: 'i1' }] }
    const fork = forkDocument(source)
    expect(fork.scrip).toBe(9)
    expect(fork.leader.experience.boxesChecked).toBe(4)
    expect(fork.injuries).toHaveLength(1)
    expect(fork.id).not.toBe('ars_1')
    expect(fork.forkedFrom).toBe('ars_1')
  })
  it('deep copies, so editing the fork cannot reach the original', () => {
    const source = { id: 'ars_1', leader: { name: 'Cletus' } }
    const fork = forkDocument(source)
    fork.leader.name = 'Someone else'
    expect(source.leader.name).toBe('Cletus')
  })
})

describe('conflictExport', () => {
  it('carries both sides, so the loser is recoverable whatever was chosen', () => {
    const file = conflictExport({ kind: 'arsenal', mine: { id: 'a' }, theirs: { id: 'a' } })
    expect(file.arsenals).toHaveLength(2)
    expect(file.campaigns).toEqual([])
  })
})
