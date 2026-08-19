import { useState, useMemo } from 'react'
import { getArchetype } from './data/archetypes.js'
import { checkStructure } from './lib/validation.js'
import { useCampaign } from './hooks/useCampaign.js'
import { useRoster } from './hooks/useRoster.js'
import { useAuth } from './hooks/useAuth.js'
import { HankProvider } from './hooks/useHank.jsx'
import Masthead from './components/Masthead.jsx'
import { Button } from './components/ui.jsx'
import Identity from './components/steps/Identity.jsx'
import Archetype from './components/steps/Archetype.jsx'
import Loadout from './components/steps/Loadout.jsx'
import Record from './components/steps/Record.jsx'
import SignInGate from './components/SignInGate.jsx'
import WeeklyHire from './components/steps/WeeklyHire.jsx'
import './styles/app.css'

/** A stable case number, so the same leader always files under the same mark. */
function fileNumber(leader) {
  const prefix = (leader.faction || '____').slice(0, 2).toUpperCase()
  let hash = 0
  for (const ch of leader.name + leader.archetype) {
    hash = (hash * 31 + ch.charCodeAt(0)) % 9000
  }
  return `HH-${prefix}-${1000 + hash}`
}

export default function App() {
  const [step, setStep] = useState(0)
  // Creation is a one-off; the campaign repeats for twelve weeks. Separate
  // views rather than more wizard steps, so the weekly work doesn't pretend
  // to be part of building a leader.
  const [view, setView] = useState('create')
  const {
    leader, set, setPick,
    campaign, arsenal, week, mustHire, addModel, spendScrip,
  } = useCampaign()
  const roster = useRoster()
  // Held here rather than inside the badge so there is exactly one /api/auth/me
  // per load, and so the storage adapter has it to hand when it lands.
  const auth = useAuth()

  // Play is gated behind an account (CLAUDE.md §12). The one escape hatch is
  // for local development, where Vite serves no Functions so signing in is
  // impossible: an opt-in flag opens the wizard, and ONLY when the backend is
  // genuinely absent. It cannot open a real signed-out session in production,
  // because `available` is true there — and production builds never carry the
  // flag, since it lives in .env and is not among wrangler.toml's [vars].
  const devBypass =
    import.meta.env.VITE_ALLOW_UNAUTHENTICATED === 'true' && !auth.available
  const admitted = Boolean(auth.user) || devBypass

  const archetype = getArchetype(leader.archetype)

  const canAdvance = useMemo(() => {
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

  return (
    <HankProvider>
    <div className="shell">
      <Masthead step={step} onJump={setStep} fileNumber={fileNumber(leader)} auth={auth} admitted={admitted} view={view} onView={setView} />

      <main className="wrap">
        {!admitted && <SignInGate auth={auth} />}

        {admitted && view === 'campaign' && (
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

        {admitted && view === 'create' && step === 0 && <Identity leader={leader} set={set} />}
        {admitted && view === 'create' && step === 1 && <Archetype leader={leader} set={set} />}
        {admitted && view === 'create' && step === 2 && archetype && (
          <Loadout leader={leader} set={set} setPick={setPick} archetype={archetype} roster={roster} />
        )}
        {admitted && view === 'create' && step === 3 && archetype && (
          <Record
            leader={leader}
            set={set}
            archetype={archetype}
            roster={roster}
            fileNumber={fileNumber(leader)}
          />
        )}

        {admitted && view === 'create' && (
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

        <p className="colophon">
          Portions of the materials used are copyrighted works of Wyrd Miniatures, LLC, in the United
          States of America and elsewhere. All rights reserved, Wyrd Miniatures, LLC. This material is
          not official and is not endorsed by Wyrd Miniatures, LLC. Model data from BiggerHat.
        </p>
      </main>
    </div>
    </HankProvider>
  )
}
