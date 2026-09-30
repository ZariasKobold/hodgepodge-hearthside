import { describe, it, expect } from 'vitest'
import { resolveTable } from './membership.js'

/**
 * Which table the Players tab shows.
 *
 * The bug this pins: a member opens their *own* campaign, and asking the
 * server about that one says "you are the host of an empty table". Every
 * member on production was looking at that screen instead of the campaign
 * they had joined.
 */
describe('resolveTable', () => {
  const own = 'cmp_mine'
  const hosted = { campaignId: own, isOwner: true, linkedCampaignIds: [] }
  const joinedLinked = { campaignId: 'cmp_host', isOwner: false, status: 'active', linkedCampaignIds: [own] }
  const joinedUnlinked = { campaignId: 'cmp_other', isOwner: false, status: 'active', linkedCampaignIds: [] }

  it('shows the table this campaign is linked to', () => {
    expect(resolveTable({ campaignId: own, memberships: [joinedLinked] })).toBe('cmp_host')
  })

  it('shows the campaign itself when it sits at nobody else’s table', () => {
    expect(resolveTable({ campaignId: own, memberships: [joinedUnlinked] })).toBe(own)
    expect(resolveTable({ campaignId: own, memberships: [] })).toBe(own)
  })

  it('ignores your own hosted campaign in the list', () => {
    expect(resolveTable({ campaignId: own, memberships: [{ ...hosted, linkedCampaignIds: [own] }] })).toBe(own)
  })

  it('honours an explicit choice among your tables', () => {
    const memberships = [joinedLinked, joinedUnlinked]
    expect(resolveTable({ campaignId: own, memberships, chosen: 'cmp_other' })).toBe('cmp_other')
    expect(resolveTable({ campaignId: own, memberships, chosen: own })).toBe(own)
  })

  it('drops a choice that is no longer one of your tables — after leaving, say', () => {
    expect(resolveTable({ campaignId: own, memberships: [joinedLinked], chosen: 'cmp_gone' })).toBe('cmp_host')
  })

  it('answers nothing with nothing open', () => {
    expect(resolveTable({ campaignId: null, memberships: [joinedLinked] })).toBe(null)
  })
})
