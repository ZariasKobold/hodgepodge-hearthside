import { useState } from 'react'
import { Label, Field, Button, Input } from '../ui.jsx'
import { inviteLink } from '../../lib/membership.js'
import SharedArsenal from '../SharedArsenal.jsx'

/**
 * Who else is in this campaign, and what everyone has.
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
 * setting. What crosses instead is a nickname you choose.
 *
 * That is the whole reason this app issues invites rather than join codes: a
 * bare code is a capability URL, anyone holding it is in, and being in used to
 * mean seeing everyone's Discord identity. Now being in means seeing
 * nicknames, and identity is each player's to give.
 *
 * ## Two gates
 *
 * A link puts someone in the pending list; only the host admits them. So a
 * forwarded link costs the host a decision, not a leak.
 */
export default function Players({ campaign, shelf, membership, signedIn }) {
  const {
    members, arsenals, invites, isHost, isMember, loading, error, freshInvite, knownToServer,
  } = membership

  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)

  const me = members.find((m) => m.isYou) || null
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

  return (
    <>
      {error && <p className="note note--warn">{error}</p>}
      {loading && <p className="note">Reading the campaign…</p>}

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

      {/* ── your own entry ──────────────────────────────────────── */}
      {isMember && !isHost && <MyProfile me={me} membership={membership} />}

      {/* ── who is in ───────────────────────────────────────────── */}
      {isMember && (
        <section className="panel">
          <Label>In this campaign</Label>
          {active.length === 0 ? (
            <p className="note">
              Nobody else yet.{' '}
              {isHost ? 'Send a link above.' : 'The host has not admitted anyone else.'}
            </p>
          ) : (
            <ul className="hire__list">
              {active.map((m) => (
                <li key={m.userId || m.nickname}>
                  <span>
                    {m.nickname || 'unnamed player'}
                    {m.isYou && <span className="hire__adj"> (you)</span>}
                  </span>
                  <span className="hire__paid">
                    {m.sharesIdentity && m.displayName
                      ? m.displayName
                      : 'identity not shared'}
                    {isHost && m.userId && (
                      <>
                        {' · '}
                        <button className="gate__link" onClick={() => membership.remove(m.userId)}>
                          remove
                        </button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── bringing a leader ───────────────────────────────────── */}
      {isMember && !isHost && (
        <BringALeader campaign={campaign} shelf={shelf} arsenals={arsenals} membership={membership} />
      )}

      {/* ── the arsenals ────────────────────────────────────────── */}
      {isMember && arsenals.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <div className="slot__head">
            <Label>Everyone's arsenal</Label>
            <span className="tally">{arsenals.length} in the campaign</span>
          </div>
          <p className="note">
            Read-only, and public by the rules — max encounter size is the
            smaller arsenal plus six, so these numbers are everybody's business.
            You cannot change anyone's but your own.
          </p>
          {arsenals.map((a) => <SharedArsenal key={a.id} arsenal={a} />)}
        </section>
      )}

      {/* A campaign the account has never seen cannot have members, and saying
          "nobody has been invited" about one reads as the invite having failed.
          Since the sync pause this is the ordinary state of anything built on
          this device. */}
      {!isMember && !loading && knownToServer === false && (
        <div className="empty">
          <strong>This campaign has not reached your account yet.</strong>{' '}
          Sending work up is switched off while the sync rebuild finishes, so it
          exists in this browser only — and a campaign the account has never seen
          cannot have anyone invited to it. Invitations will work again once
          syncing resumes.
        </div>
      )}

      {!isMember && !loading && knownToServer !== false && (
        <div className="empty">
          This campaign is yours alone. Nobody has been invited to it, and
          nothing about it is visible to anyone else.
        </div>
      )}
    </>
  )
}

/**
 * Your nickname, and the decision about your Discord identity.
 *
 * Both are per-campaign rather than per-account, because the answer legitimately
 * differs: a table of old friends is not a table of strangers from a forum.
 */
function MyProfile({ me, membership }) {
  const [nickname, setNickname] = useState(me?.nickname || '')
  const [share, setShare] = useState(Boolean(me?.sharesIdentity))
  const [saved, setSaved] = useState(false)

  return (
    <section className="panel">
      <Label>How you appear to the others</Label>
      <Field>
        <Input
          value={nickname}
          onChange={(e) => { setNickname(e.target.value); setSaved(false) }}
          placeholder="A name for this campaign"
          maxLength={40}
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
        onClick={async () => {
          await membership.saveProfile({ nickname, shareIdentity: share })
          setSaved(true)
        }}
      >
        {saved ? 'Saved' : 'Save'}
      </Button>
    </section>
  )
}

/**
 * Which of your leaders you are bringing to this campaign.
 *
 * Explicit rather than automatic, because the shelf holds several and only one
 * belongs here — and because linking is what puts your arsenal in front of
 * other people. That should be a thing you did, not a thing that happened.
 */
function BringALeader({ campaign, shelf, arsenals, membership }) {
  const mine = arsenals.find((a) => a.isMine)
  // Shelf entries are { arsenal, campaign } since v3. Only a named leader that
  // is actually sitting at a table can be brought — `membership.link` names a
  // campaign row, which an unseated arsenal does not have.
  const candidates = shelf.filter((e) => e.arsenal?.leader?.name && e.campaign)

  if (mine) {
    return (
      <section className="panel">
        <Label>You are bringing</Label>
        <p className="note">
          <strong>{mine.leader?.name || 'your leader'}</strong> — the others can
          see this arsenal. To bring a different one, link it below.
        </p>
        <div className="crew__bar">
          {candidates
            .filter((e) => e.campaign.id !== campaign.id)
            .map((e) => (
              <Button key={e.arsenal.id} ghost onClick={() => membership.link(e.campaign.id)}>
                Bring {e.arsenal.leader.name} instead
              </Button>
            ))}
          <Button ghost onClick={() => membership.link(null)}>
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
            Bring {e.arsenal.leader.name}
          </Button>
        ))}
      </div>
    </section>
  )
}
