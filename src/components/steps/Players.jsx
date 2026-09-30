import { useState } from 'react'
import { Label, Field, Button, Input, Chip } from '../ui.jsx'
import { inviteLink } from '../../lib/membership.js'
import SharedArsenal from '../SharedArsenal.jsx'

/**
 * Who else is in this campaign, and what everyone has.
 *
 * ## Which campaign this page is about
 *
 * Not always the open one. A player who joined someone else's campaign keeps
 * their arsenal in a campaign of their own, linked to the host's, and this page
 * used to ask only about that private one — so every member was shown as the
 * host of an empty table, with no way to see the campaign they had joined, set
 * a nickname in it, or bring a leader to it. `useMembership` now works out the
 * table, and `TablePicker` lets a player who sits at more than one move
 * between them.
 *
 * ## Why arsenals are shared at all
 *
 * The book makes them public: "A player's arsenal sheet is always public
 * knowledge" (p.14), and the rules need it — max encounter size is the smaller
 * arsenal plus six, and the soulstone bonus compares campaign ratings. Two
 * players who cannot see each other's totals cannot set up a game.
 *
 * ## What is deliberately *not* shared
 *
 * Your Discord name and avatar, unless you say so, per campaign, here. The
 * default is the private one because a privacy default that leaks is not a
 * setting. What crosses instead is a nickname you choose — the host included,
 * who until v0.28.0 had no way to choose one and appeared to everyone as an
 * unnamed player.
 *
 * ## Two gates
 *
 * A link puts someone in the pending list; only the host admits them. So a
 * forwarded link costs the host a decision, not a leak.
 */
export default function Players({ shelf, membership, signedIn }) {
  const {
    members, host, me, arsenals, invites, isHost, isMember, isPending,
    loading, error, freshInvite, knownToServer, joined, table,
  } = membership

  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)

  const pending = members.filter((m) => m.status === 'pending')
  const active = members.filter((m) => m.status === 'active')

  if (!signedIn) {
    return (
      <div className="empty">
        Campaign membership lives on the account, so this needs you signed in.
        Everything else about your campaign works without it.
      </div>
    )
  }

  const hostName = tableName(table)

  return (
    <>
      <TablePicker membership={membership} />

      {error && <p className="note note--warn">{error}</p>}
      {loading && <p className="note">Reading the campaign…</p>}

      {/* ── still at the door ───────────────────────────────────── */}
      {isPending && (
        <>
          <section className="panel panel--attention">
            <Label>Waiting to be let in</Label>
            <p className="note">
              You have used an invite to {hostName}. The host has to admit you
              before you can see who else is playing — and before anyone there
              can see anything of yours.
            </p>
          </section>
          <MyProfile
            key={`${membership.tableId}:${me ? 1 : 0}`}
            me={me}
            membership={membership}
            intro="Choose it now and the host will know who is asking to join."
          />
          <LeaveTable membership={membership} label="Withdraw my request" />
        </>
      )}

      {/* ── the host's door ─────────────────────────────────────── */}
      {isHost && (
        <section className="panel">
          <Label>Invite a player</Label>
          <p className="note">
            A link that works <strong>once</strong> and expires in a week. Whoever
            opens it lands in your pending list — they see nothing until you let
            them in, so a forwarded link costs you a decision rather than
            somebody's data.
          </p>

          <div className="crew__bar">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Who is this for? (a note to yourself)"
            />
            <Button onClick={() => { membership.issueInvite(note); setNote(''); setCopied(false) }}>
              Make a link
            </Button>
          </div>

          {freshInvite && (
            <div className="invite">
              <Label>Send this to them — it is shown once</Label>
              <div className="invite__row">
                <code className="invite__link">{inviteLink(freshInvite.token)}</code>
                <Button
                  ghost
                  onClick={() => {
                    navigator.clipboard?.writeText(inviteLink(freshInvite.token))
                    setCopied(true)
                  }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button ghost onClick={membership.dismissInvite}>Done</Button>
              </div>
              <p className="gap-note">
                <strong>This is the only time you will see it.</strong> The server
                keeps only a fingerprint of the link, not the link — so nobody
                who reads the database can use it, and neither can this app show
                it to you again. Lost it? Revoke it below and make another.
              </p>
            </div>
          )}

          {invites.length > 0 && (
            <>
              <Label>Links you have sent</Label>
              <ul className="hire__list">
                {invites.map((inv) => (
                  <li key={inv.id}>
                    <span>
                      {inv.note || 'no note'}
                      {inv.redeemedByName && ` · used by ${inv.redeemedByName}`}
                    </span>
                    <span className="hire__paid">
                      {inv.state}
                      {inv.state === 'open' && (
                        <button className="gate__link" onClick={() => membership.revokeInvite(inv.id)}>
                          revoke
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* ── the second gate ─────────────────────────────────────── */}
      {isHost && pending.length > 0 && (
        <section className="panel panel--attention">
          <Label>Waiting to be let in</Label>
          <p className="note">
            They have used a link. They can see nothing until you admit them.
          </p>
          <ul className="hire__list">
            {pending.map((m) => (
              <li key={m.userId}>
                <span>
                  {m.nickname || 'no nickname yet'}
                  {!m.nickname && m.inviteNote && (
                    <span className="hire__adj"> (invited as {m.inviteNote})</span>
                  )}
                  {m.sharesIdentity && m.displayName && ` · ${m.displayName}`}
                </span>
                <span className="hire__paid">
                  <button className="gate__link" onClick={() => membership.admit(m.userId)}>
                    admit
                  </button>
                  {' · '}
                  <button className="gate__link" onClick={() => membership.remove(m.userId)}>
                    refuse
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── who is at the table ─────────────────────────────────── */}
      {isMember && (
        <section className="panel">
          <div className="slot__head">
            <Label>At this table</Label>
            <span className="tally">{active.length + 1} playing</span>
          </div>
          <ul className="hire__list">
            {host && <PlayerRow player={host} isHostRow />}
            {active.map((m) => (
              <PlayerRow
                key={m.userId || m.nickname}
                player={m}
                onRemove={isHost && m.userId ? () => membership.remove(m.userId) : null}
              />
            ))}
          </ul>
          {active.length === 0 && (
            <p className="note">
              Nobody else yet.{' '}
              {isHost ? 'Send a link above.' : 'The host has not admitted anyone else.'}
            </p>
          )}
        </section>
      )}

      {/* ── your own entry — host and member alike ──────────────── */}
      {isMember && (
        <MyProfile
          key={`${membership.tableId}:${me ? 1 : 0}`}
          me={me}
          membership={membership}
          intro={isHost
            ? 'You are the host, and this is the name your players will see beside your arsenal.'
            : null}
        />
      )}

      {/* ── bringing a leader ───────────────────────────────────── */}
      {isMember && !isHost && (
        <BringALeader shelf={shelf} arsenals={arsenals} joined={joined} membership={membership} />
      )}

      {/* ── the arsenals ────────────────────────────────────────── */}
      {isMember && arsenals.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <div className="slot__head">
            <Label>Everyone's arsenal</Label>
            <span className="tally">{arsenals.length} at the table</span>
          </div>
          <p className="note">
            Read-only, and public by the rules — max encounter size is the
            smaller arsenal plus six, so these numbers are everybody's business.
            You cannot change anyone's but your own.
          </p>
          {arsenals.map((a) => <SharedArsenal key={a.id} arsenal={a} />)}
        </section>
      )}

      {isMember && !isHost && <LeaveTable membership={membership} label={`Leave ${hostName}`} />}

      {/* A campaign the account has never seen cannot have members, and saying
          "nobody has been invited" about one reads as the invite having failed. */}
      {!isMember && !isPending && !loading && knownToServer === false && (
        <div className="empty">
          <strong>This campaign has not reached your account yet.</strong>{' '}
          It exists in this browser only until it syncs — and a campaign the
          account has never seen cannot have anyone invited to it. Give it a
          moment online and look again.
        </div>
      )}

      {!isMember && !isPending && !loading && knownToServer !== false && (
        <div className="empty">
          This campaign is yours alone. Nobody has been invited to it, and
          nothing about it is visible to anyone else.
        </div>
      )}
    </>
  )
}

/** How to refer to a table you joined, without inventing a name for it. */
function tableName(table) {
  if (!table) return 'this campaign'
  if (table.hostNickname) return `${table.hostNickname}'s campaign`
  if (table.name) return table.name
  return 'the campaign you joined'
}

/**
 * Your own campaign, and every campaign you have joined.
 *
 * Always shown. It was hidden when there was nothing to choose between, and a
 * host who had been told "the row of campaigns you are in" then looked for it,
 * could not find it, and reasonably concluded it was missing. An empty list
 * that says why is a finding; an absent one is a question.
 *
 * A joined table you have not brought a leader to says so, because an
 * admitted member with no leader linked is invisible to everyone else and has
 * no way to know.
 */
function TablePicker({ membership }) {
  const { joined, tableId, ownCampaignId } = membership

  return (
    <section className="panel">
      <Label>Your campaigns</Label>
      {joined.length === 0 && (
        <p className="note">
          Only your own table so far. When someone sends you an invite link,
          the campaign you join appears here beside it.
        </p>
      )}
      <div className="chips">
        <Chip on={tableId === ownCampaignId} onClick={() => membership.viewTable(ownCampaignId)}>
          Your own table
        </Chip>
        {joined.map((t) => (
          <Chip key={t.campaignId} on={tableId === t.campaignId} onClick={() => membership.viewTable(t.campaignId)}>
            {tableName(t)}
            <span className="hire__adj">
              {t.status === 'pending'
                ? ' · waiting'
                : t.linkedCampaignIds?.length > 0 ? ' · your leader is here' : ' · no leader yet'}
            </span>
          </Chip>
        ))}
      </div>
    </section>
  )
}

/** One person at the table: their chosen name, and the leader they brought. */
function PlayerRow({ player, isHostRow = false, onRemove = null }) {
  const bringing = player.bringing || []
  return (
    <li>
      <span>
        {player.nickname || (isHostRow ? 'The host' : 'unnamed player')}
        {!player.nickname && player.inviteNote && (
          <span className="hire__adj"> (invited as {player.inviteNote})</span>
        )}
        {player.isYou && <span className="hire__adj"> (you)</span>}
        {isHostRow && <span className="hire__adj"> · host</span>}
        {player.sharesIdentity && player.displayName && (
          <span className="hire__adj"> · {player.displayName}</span>
        )}
      </span>
      <span className="hire__paid">
        {bringing.length > 0 ? `bringing ${bringing.join(', ')}` : 'no leader brought yet'}
        {onRemove && (
          <>
            {' · '}
            <button className="gate__link" onClick={onRemove}>remove</button>
          </>
        )}
      </span>
    </li>
  )
}

/**
 * Your nickname, and the decision about your Discord identity.
 *
 * Both are per-campaign rather than per-account, because the answer legitimately
 * differs: a table of old friends is not a table of strangers from a forum.
 * Shown to the host too — they had no row to write one into until v0.28.0.
 */
function MyProfile({ me, membership, intro = null }) {
  const [nickname, setNickname] = useState(me?.nickname || '')
  const [share, setShare] = useState(Boolean(me?.sharesIdentity))
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  return (
    <section className="panel">
      <Label>Your nickname in this campaign</Label>
      {intro && <p className="note">{intro}</p>}
      <Field>
        <Input
          value={nickname}
          onChange={(e) => { setNickname(e.target.value); setSaved(false) }}
          placeholder="A name for this campaign"
          maxLength={40}
          aria-label="Your nickname in this campaign"
        />
        <p className="note">
          This is what the other players see. It does not have to be your real
          name or your Discord handle.
        </p>
      </Field>

      <label className="hire__check">
        <input
          type="checkbox"
          checked={share}
          onChange={(e) => { setShare(e.target.checked); setSaved(false) }}
        />
        Also show my Discord name and avatar to the others
      </label>
      <p className="note">
        Off by default, and yours to change at any time. With it off, no other
        player in this campaign is sent your Discord details at all — not hidden
        in the page, not sent and unused. They are simply not sent.
      </p>

      <Button
        disabled={saving}
        onClick={async () => {
          setSaving(true)
          const result = await membership.saveProfile({ nickname: nickname.trim(), shareIdentity: share })
          setSaving(false)
          if (result) setSaved(true)
        }}
      >
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
      </Button>
    </section>
  )
}

/**
 * Which of your leaders you are bringing to this table.
 *
 * Explicit rather than automatic, because the shelf holds several and only one
 * belongs here — and because linking is what puts your arsenal in front of
 * other people. That should be a thing you did, not a thing that happened.
 */
function BringALeader({ shelf, arsenals, joined, membership }) {
  const mine = arsenals.find((a) => a.isMine)
  const { tableId } = membership
  // Shelf entries are { arsenal, campaign } since v3. Only a named leader that
  // is actually sitting at a campaign can be brought — `membership.link` names
  // a campaign row, which an unseated arsenal does not have.
  const candidates = shelf.filter((e) =>
    e.arsenal?.leader?.name && e.campaign && e.campaign.id !== tableId
  )
  // A leader already at another table you joined moves if you bring it here.
  const elsewhere = (campaignId) =>
    joined.find((t) => t.campaignId !== tableId && (t.linkedCampaignIds || []).includes(campaignId))

  const label = (e) => {
    const other = elsewhere(e.campaign.id)
    return other ? ` (moves it from ${tableName(other)})` : ''
  }

  if (mine) {
    const others = candidates.filter((e) => e.campaign.id !== mine.campaignId)
    return (
      <section className="panel">
        <Label>You are bringing</Label>
        <p className="note">
          <strong>{mine.leader?.name || 'your leader'}</strong> — the others can
          see this arsenal.
          {others.length > 0 && ' To bring a different one instead, choose it below.'}
        </p>
        <div className="crew__bar">
          {others.map((e) => (
            <Button key={e.arsenal.id} ghost onClick={() => membership.link(e.campaign.id)}>
              Bring {e.arsenal.leader.name} instead{label(e)}
            </Button>
          ))}
          <Button ghost onClick={membership.withdraw}>
            Withdraw my arsenal
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="panel panel--attention">
      <Label>Choose the leader you are bringing</Label>
      <p className="note">
        Until you pick one, the others cannot see an arsenal for you — and you
        cannot be given an encounter size. Picking one shares that arsenal's
        roster, scrip and injuries with the campaign.
      </p>
      <div className="crew__bar">
        {candidates.length === 0 && (
          <span className="note">No finished leaders on your shelf yet.</span>
        )}
        {candidates.map((e) => (
          <Button key={e.arsenal.id} ghost onClick={() => membership.link(e.campaign.id)}>
            Bring {e.arsenal.leader.name}{label(e)}
          </Button>
        ))}
      </div>
    </section>
  )
}

/** Leave a table you joined, or withdraw a request still waiting. Asks first. */
function LeaveTable({ membership, label }) {
  const [confirming, setConfirming] = useState(false)
  if (!confirming) {
    return (
      <p className="note" style={{ marginTop: 20 }}>
        <button className="gate__link" onClick={() => setConfirming(true)}>{label}</button>
      </p>
    )
  }
  return (
    <section className="panel">
      <p className="note">
        Your arsenal leaves this table and the others stop seeing it. Nothing of
        yours is deleted — but getting back in needs a fresh invite from the host.
      </p>
      <div className="crew__bar">
        <Button onClick={() => { membership.leave(); setConfirming(false) }}>{label}</Button>
        <Button ghost onClick={() => setConfirming(false)}>Stay</Button>
      </div>
    </section>
  )
}
