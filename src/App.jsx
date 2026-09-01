import { useState, useMemo, useEffect, useRef } from 'react'
import { getArchetype } from './data/archetypes.js'
import { checkStructure } from './lib/validation.js'
import { useCampaign } from './hooks/useCampaign.js'
import { useRoster } from './hooks/useRoster.js'
import { useRules } from './hooks/useRules.js'
import { useAuth } from './hooks/useAuth.js'
import { useSync } from './hooks/useSync.js'
import { useMembership, useInviteRedemption } from './hooks/useMembership.js'
import { HankProvider } from './hooks/useHank.jsx'
import Masthead from './components/Masthead.jsx'
import { Button } from './components/ui.jsx'
import { LEGAL } from './lib/recordImage.js'
import Identity from './components/steps/Identity.jsx'
import Archetype from './components/steps/Archetype.jsx'
import Loadout from './components/steps/Loadout.jsx'
import Record from './components/steps/Record.jsx'
import SignInGate from './components/SignInGate.jsx'
import BuildStamp from './components/BuildStamp.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import ArsenalLibrary from './components/ArsenalLibrary.jsx'
import Campaign from './components/steps/Campaign.jsx'
import Arsenal from './components/steps/Arsenal.jsx'
import ArsenalSheet from './components/ArsenalSheet.jsx'
import './styles/app.css'

/** A stable case number, so the same leader always files under the same mark. */
function fileNumber(leader) {
  const prefix = (leader?.faction || '____').slice(0, 2).toUpperCase()
  let hash = 0
  for (const ch of (leader?.name || '') + (leader?.archetype || '')) {
    hash = (hash * 31 + ch.charCodeAt(0)) % 9000
  }
  return `HH-${prefix}-${1000 + hash}`
}

export default function App() {
  const [step, setStep] = useState(0)
  // Declared before useCampaign so the mirror callback exists when the first
  // save fires. The two are deliberately one-way: campaigns push into sync,
  // sync never reaches back into campaign state except through `refresh`.
  const syncRef = useRef({ mirror: () => {}, forget: () => {} })
  // Five views. `library` is the shelf of leaders; the other four are only
  // reachable with a campaign open, because they all edit or read one.
  const [view, setView] = useState('library')
  // Held here rather than inside the badge so there is exactly one /api/auth/me
  // per load, and so the storage adapter has it to hand when it lands.
  //
  // Declared before useCampaign because the shelf is scoped by account: the
  // hook needs the id, and a const cannot be read above its own declaration.
  const auth = useAuth()
  const {
    shelf, openId, open, close, startNew, discard, adopt, refresh,
    leader, set, setPick,
    campaign, arsenal, week, mustHire, addModel, spendScrip, earnScrip,
    setWeek, stepWeek, setWeekMode, resetWeek, setStartedAt, setWeeksTotal,
    setHouseRules,
    logGame, updateGame, buyEquipment, addInjury, healInjury, dropInjury, annihilateModel,
    advanceLeader, advanceTotem, setTotem, addCrewCardAdvancement,
    useMiraculousRecovery,
  } = useCampaign({
    // The shelf is scoped to the account, not the browser. Without this a
    // second person signing in on a shared machine sees the first one's
    // leaders (audit v0.11.0, H1).
    //
    // `userReady` matters as much as `userId`: while auth is still loading the
    // id is null, which is indistinguishable from signed out unless the hook
    // is told the difference.
    userId: auth.user?.id ?? null,
    userReady: !auth.loading,
    onSaved: (c) => syncRef.current.mirror(c),
    onRemoved: (id) => syncRef.current.forget(id),
  })
  const roster = useRoster()

  /**
   * Membership for the open campaign, and the invite in the address bar.
   *
   * Nothing here is cached locally: it is the answer to "who may see my data",
   * and a stale answer to that is worse than none. Offline, the Players tab
   * says so and everything else carries on.
   */
  const membership = useMembership({
    campaignId: openId,
    signedIn: Boolean(auth.user),
  })
  const invite = useInviteRedemption({
    signedIn: Boolean(auth.user),
    onJoined: () => membership.refresh(),
  })
  // Rules text is fetched live and held only in memory (§4). One instance for
  // the whole tree so the loadout's hover lookups and the record's writeout
  // share the same in-flight requests instead of racing each other.
  const rules = useRules()

  /**
   * Local storage stays the working copy; this mirrors it to the account and,
   * on first sign-in, pushes up everything built while signed out.
   */
  const sync = useSync({ user: auth.user, available: auth.available, onChanged: refresh })
  /**
   * Assigned during render rather than in an effect, deliberately (audit L13).
   *
   * `useCampaign` writes to localStorage in an effect and calls `onSaved`
   * straight after, and effects run child-first — so a ref populated in an
   * effect here would still be the no-op placeholder on the first save of the
   * session, and that save would never be mirrored. The assignment is
   * idempotent and touches nothing outside this component, which is the case
   * where a render-phase write to a ref is safe.
   */
  syncRef.current = sync

  // Play is gated behind an account (CLAUDE.md §12). The one escape hatch is
  // for local development, where Vite serves no Functions so signing in is
  // impossible: an opt-in flag opens the wizard, and ONLY when the backend is
  // genuinely absent. It cannot open a real signed-out session in production,
  // because `available` is true there — and production builds never carry the
  // flag, since it lives in .env and is not among wrangler.toml's [vars].
  const devBypass =
    import.meta.env.VITE_ALLOW_UNAUTHENTICATED === 'true' && !auth.available
  const admitted = Boolean(auth.user) || devBypass

  /**
   * An empty shelf has nothing to choose between, so the first visit drops
   * straight into building someone. Once anything is saved, the shelf is where
   * you land — after week one the question is which campaign, not whether.
   *
   * Waits for sync to settle first. On a device that has never seen this
   * account, the shelf is empty for the moment it takes to fetch — and firing
   * here in that window invented a blank leader on every new device, then
   * pushed it up to the account. "Empty" and "not arrived yet" are different
   * answers and only one of them means build someone.
   */
  /**
   * `knowsShelf`, not `settled`. A failed sync settles too, and reading a
   * failed sync as "this account has no campaigns" is how the app came to
   * invent a blank leader over the top of somebody's real one.
   */
  const shelfSettled = sync.knowsShelf

  useEffect(() => {
    if (!admitted) return
    if (openId) return
    if (!shelfSettled) return
    if (shelf.length === 0 && view !== 'create') {
      startNew()
      setStep(0)
      setView('create')
      return
    }

    /**
     * Something on the shelf, nothing open: open the most recent one.
     *
     * Not cosmetic. `inCampaign` gates every tab except Leaders, so with
     * nothing open the masthead collapses to a single item and the app looks
     * like it has lost the campaign that is visibly sitting on the screen. That
     * is the complaint §12b already names — "doing so made the other tabs
     * vanish, which reads as losing your place" — and the rule written there
     * only covered *closing* one. Nothing ever opened one.
     *
     * Two ordinary routes led here and neither was a mistake: a campaign that
     * arrived by sync is written to storage by `refresh`, which re-reads the
     * shelf and deliberately opens nothing; and discarding the open campaign
     * nulls `openId` without falling through to whatever is left.
     *
     * **It does not navigate.** The view stays where it is, so this is
     * invisible except that the tabs are there — picking a campaign for
     * somebody is only rude if it also moves them. Opening a different leader
     * from the shelf still replaces it, which remains the only close.
     */
    if (shelf.length > 0) {
      const mostRecent = [...shelf].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]
      if (mostRecent) open(mostRecent.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admitted, openId, shelf.length, shelfSettled])

  const archetype = leader ? getArchetype(leader.archetype) : null

  const canAdvance = useMemo(() => {
    if (!leader) return false
    if (step === 0) {
      const [a, b] = leader.keywords
      return Boolean(leader.name.trim() && leader.faction && a && b && a !== b)
    }
    if (step === 1) return Boolean(leader.archetype && leader.advancementPath)
    if (step === 2) {
      const structure = checkStructure(leader.archetype, leader.picks, leader.trigger)
      return structure.ok && Boolean(leader.crewCard.effect)
    }
    return true
  }, [step, leader])

  const openCampaign = (id) => {
    open(id)
    setStep(3)
    setView('arsenal')
  }

  const buildNew = () => {
    startNew()
    setStep(0)
    setView('create')
  }

  /**
   * The shelf is a view, not an exit. Closing the campaign here made Creation
   * and Campaign vanish from the masthead the moment you glanced at your other
   * leaders, which reads as losing your place rather than changing screen.
   * Opening a different leader replaces the open one; that is the only close.
   */
  const toLibrary = () => setView('library')

  const inCampaign = Boolean(openId && leader)

  /**
   * Everything the campaign view can do to a campaign, in one object.
   *
   * Bundled rather than passed as a dozen props because the aftermath threads
   * them three components deep, and a flow that has to be handed `addInjury`
   * through two intermediaries that never call it is a flow whose signature
   * changes every time a phase learns something new.
   */
  const campaignActions = {
    setWeek, stepWeek, setWeekMode, resetWeek, setStartedAt, setWeeksTotal,
    setHouseRules,
    logGame, updateGame,
    earnScrip, spendScrip,
    buyEquipment,
    addInjury, healInjury, dropInjury, annihilateModel,
    advanceLeader, advanceTotem, setTotem, addCrewCardAdvancement,
    useMiraculousRecovery,
    onHire: (model, cost) => {
      addModel(model, { scripPaid: cost })
      spendScrip(cost)
    },
  }

  return (
    <HankProvider>
    <div className="shell">
      <Masthead
        step={step}
        onJump={setStep}
        fileNumber={fileNumber(leader)}
        auth={auth}
        admitted={admitted}
        view={view}
        onView={setView}
        inCampaign={inCampaign}
        onLibrary={toLibrary}
      />

      <main className="wrap">
        {/* Views only. The disclaimer and the build stamp sit outside, so a
            crash cannot take the legal notice off the page (§8) or hide the
            commit somebody is about to read out to you. */}
        <ErrorBoundary>
        {invite.status !== 'none' && <InviteBanner invite={invite} auth={auth} />}

        {!admitted && <SignInGate auth={auth} />}

        {admitted && view === 'library' && (
          <ArsenalLibrary
            shelf={shelf}
            onOpen={openCampaign}
            onNew={buildNew}
            onImport={(data) => { adopt(data); setStep(3); setView('arsenal') }}
            onDiscard={discard}
            sync={sync}
            signedIn={Boolean(auth.user)}
            offlineSession={Boolean(auth.offline)}
          />
        )}

        {admitted && inCampaign && view === 'arsenal' && archetype && (
          <Arsenal
            campaign={campaign}
            arsenal={arsenal}
            leader={leader}
            archetype={archetype}
            week={week}
            rules={rules}
            fileNumber={fileNumber(leader)}
            onEditLeader={() => { setStep(0); setView('create') }}
            onHire={() => setView('campaign')}
            onSheet={() => setView('sheet')}
          />
        )}

        {admitted && inCampaign && view === 'sheet' && archetype && (
          <ArsenalSheet
            arsenal={arsenal}
            leader={leader}
            archetype={archetype}
            campaign={campaign}
            rules={rules}
          />
        )}

        {/* A campaign whose leader has no archetype yet cannot render an
            arsenal, a sheet, or the record step, so send them back to finish
            building instead of showing a blank screen. Only the arsenal was
            covered, and the other two rendered a page containing nothing but
            the Back button and the legal line (audit v0.11.0, M2). */}
        {admitted && inCampaign && !archetype &&
          (view === 'arsenal' || view === 'sheet' || view === 'campaign' ||
           (view === 'create' && step === 3)) && (
          <div className="empty">
            This leader isn't finished yet — no archetype chosen.{' '}
            <button className="gate__link" onClick={() => { setStep(0); setView('create') }}>
              Carry on building them
            </button>.
          </div>
        )}

        {admitted && inCampaign && view === 'campaign' && archetype && (
          <Campaign
            campaign={campaign}
            arsenal={arsenal}
            leader={leader}
            week={week}
            roster={roster}
            houseRules={campaign.houseRules}
            mustHire={mustHire}
            actions={campaignActions}
            membership={membership}
            shelf={shelf}
            signedIn={Boolean(auth.user)}
          />
        )}

        {admitted && inCampaign && view === 'create' && step === 0 && <Identity leader={leader} set={set} />}
        {admitted && inCampaign && view === 'create' && step === 1 && <Archetype leader={leader} set={set} />}
        {admitted && inCampaign && view === 'create' && step === 2 && archetype && (
          <Loadout leader={leader} set={set} setPick={setPick} archetype={archetype} roster={roster} rules={rules} />
        )}
        {admitted && inCampaign && view === 'create' && step === 3 && archetype && (
          <Record
            campaign={campaign}
            leader={leader}
            set={set}
            archetype={archetype}
            roster={roster}
            rules={rules}
            fileNumber={fileNumber(leader)}
            onDone={() => setView('arsenal')}
          />
        )}

        {admitted && inCampaign && view === 'create' && (
        <div className="nav">
          <Button ghost onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
            Back
          </Button>
          {step < 3 && (
            <Button onClick={() => setStep(step + 1)} disabled={!canAdvance}>
              Continue
            </Button>
          )}
        </div>
        )}

        </ErrorBoundary>

        <p className="colophon">{LEGAL}</p>
        <BuildStamp />
      </main>
    </div>
    </HankProvider>
  )
}

/**
 * What happened to the invite link somebody clicked.
 *
 * Rendered above everything, including the sign-in gate, because the most
 * common case is arriving here signed out — the token has to survive the
 * sign-in round trip, and the person needs to be told that before they wonder
 * why nothing happened.
 */
function InviteBanner({ invite, auth }) {
  if (invite.status === 'needs-sign-in') {
    return (
      <div className="panel panel--attention">
        <strong>You have been invited to a campaign.</strong>
        <p className="note">
          Sign in and the invite is used automatically — the link survives the
          round trip. Nothing is shared with the campaign until its host lets
          you in, and even then only what you choose to share.
        </p>
        {!auth.available && (
          <p className="note note--warn">
            The account service is unreachable from here, so this cannot be
            redeemed yet. The link keeps working until it expires.
          </p>
        )}
      </div>
    )
  }

  if (invite.status === 'redeeming') {
    return <div className="panel">Using your invite…</div>
  }

  if (invite.status === 'pending') {
    return (
      <div className="panel panel--attention">
        <strong>Invite accepted — now waiting on the host.</strong>
        <p className="note">
          They have to let you in before you can see the campaign, and before
          anyone there can see anything of yours. Nothing has been shared yet.
        </p>
        <button className="gate__link" onClick={invite.dismiss}>Dismiss</button>
      </div>
    )
  }

  if (invite.status === 'refused' || invite.status === 'error') {
    return (
      <div className="panel">
        <p className="note note--warn">{invite.message}</p>
        <button className="gate__link" onClick={invite.dismiss}>Dismiss</button>
      </div>
    )
  }

  return null
}
