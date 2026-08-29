import { useState, useMemo, useEffect, useRef } from 'react'
import { getArchetype } from './data/archetypes.js'
import { checkStructure } from './lib/validation.js'
import { useCampaign } from './hooks/useCampaign.js'
import { useRoster } from './hooks/useRoster.js'
import { useRules } from './hooks/useRules.js'
import { useAuth } from './hooks/useAuth.js'
import { useSync } from './hooks/useSync.js'
import { HankProvider } from './hooks/useHank.jsx'
import Masthead from './components/Masthead.jsx'
import { Button } from './components/ui.jsx'
import { LEGAL } from './lib/recordImage.js'
import Identity from './components/steps/Identity.jsx'
import Archetype from './components/steps/Archetype.jsx'
import Loadout from './components/steps/Loadout.jsx'
import Record from './components/steps/Record.jsx'
import SignInGate from './components/SignInGate.jsx'
import ArsenalLibrary from './components/ArsenalLibrary.jsx'
import WeeklyHire from './components/steps/WeeklyHire.jsx'
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
  // Three views now. `library` is the shelf of leaders; the other two are only
  // reachable with a campaign open, because they edit one.
  const [view, setView] = useState('library')
  const {
    shelf, openId, open, close, startNew, discard, adopt, refresh,
    leader, set, setPick,
    campaign, arsenal, week, mustHire, addModel, spendScrip,
  } = useCampaign({
    onSaved: (c) => syncRef.current.mirror(c),
    onRemoved: (id) => syncRef.current.forget(id),
  })
  const roster = useRoster()
  // Rules text is fetched live and held only in memory (§4). One instance for
  // the whole tree so the loadout's hover lookups and the record's writeout
  // share the same in-flight requests instead of racing each other.
  const rules = useRules()
  // Held here rather than inside the badge so there is exactly one /api/auth/me
  // per load, and so the storage adapter has it to hand when it lands.
  const auth = useAuth()

  /**
   * Local storage stays the working copy; this mirrors it to the account and,
   * on first sign-in, pushes up everything built while signed out.
   */
  const sync = useSync({ user: auth.user, available: auth.available, onChanged: refresh })
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
  const shelfSettled = sync.settled

  useEffect(() => {
    if (!admitted) return
    if (openId) return
    if (!shelfSettled) return
    if (shelf.length === 0 && view !== 'create') {
      startNew()
      setStep(0)
      setView('create')
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
          />
        )}

        {admitted && inCampaign && view === 'arsenal' && archetype && (
          <Arsenal
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
            arsenal, so send them back to finish building instead of showing a
            blank screen. */}
        {admitted && inCampaign && view === 'arsenal' && !archetype && (
          <div className="empty">
            This leader isn't finished yet — no archetype chosen.{' '}
            <button className="gate__link" onClick={() => { setStep(0); setView('create') }}>
              Carry on building them
            </button>.
          </div>
        )}

        {admitted && inCampaign && view === 'campaign' && (
          <WeeklyHire
            arsenal={arsenal}
            week={week}
            houseRules={campaign.houseRules}
            mustHire={mustHire}
            roster={roster}
            onHire={(model, cost) => {
              addModel(model, { scripPaid: cost })
              spendScrip(cost)
            }}
          />
        )}

        {admitted && inCampaign && view === 'create' && step === 0 && <Identity leader={leader} set={set} />}
        {admitted && inCampaign && view === 'create' && step === 1 && <Archetype leader={leader} set={set} />}
        {admitted && inCampaign && view === 'create' && step === 2 && archetype && (
          <Loadout leader={leader} set={set} setPick={setPick} archetype={archetype} roster={roster} rules={rules} />
        )}
        {admitted && inCampaign && view === 'create' && step === 3 && archetype && (
          <Record
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

        <p className="colophon">{LEGAL}</p>
      </main>
    </div>
    </HankProvider>
  )
}
