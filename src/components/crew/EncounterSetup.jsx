import { useEffect, useState } from 'react'
import { Label, Field, Button, Input, Select, Chip } from '../ui.jsx'
import { IconText } from '../RulesText.jsx'
import { totalFor } from '../../lib/shape/arsenal.js'
import {
  encounterCap, encounterSizeOf, encounterReady, crewRating, poolFor,
} from '../../lib/encounter.js'
import { arsenalTotal } from '../../lib/campaign.js'
import { sessionFor, sessionStage, ratingPatch } from '../../lib/sharedCrew.js'
import { selectionFromCrew, selectionOf, createCrew, upsertCrew, nextCrewName } from '../../lib/crews.js'
import {
  SETUP_STEPS, createSetup, nextStep, previousStep, strategiesForSuit, strategySuitPatch,
  deploymentForSuit, toggleSchemeInPool, drawSchemePool, chooseScheme, stepsDone, setupGaps,
  strategyBySlug, schemeBySlug, SCHEME_POOL_SIZE,
} from '../../lib/scenario.js'
import { SEASON, SUITS, SUIT_NAMES, SCHEMES } from '../../data/gainingGrounds.js'
import { factionLabel } from '../../data/factions.js'
import { useScenarioText } from '../../hooks/useScenarioText.js'
import CrewPicker from './CrewPicker.jsx'
import SharedCrewPanel from '../SharedCrewPanel.jsx'

/**
 * Encounter setup, the way the rules lay it out (v0.34.0, owner request):
 * steps A to K of the core rules, with the campaign's changes from p. 19 and
 * its Campaign Rating step after the reveal. Logic in `lib/scenario.js`.
 *
 * The steps can be visited in any order, because a table rarely does them in
 * order. Nothing is gated except what the rules gate: the crew locks once it is
 * revealed. "Start the game" lists whatever is still open and starts anyway.
 *
 * No Hank: setup is the players talking to each other (§3).
 */
export default function EncounterSetup({
  encounter, campaign, arsenal, leader, archetype, membership, actions, shared, rules, onStart, onDiscard,
}) {
  const setup = encounter.setup || createSetup()
  const text = useScenarioText()
  const [discarding, setDiscarding] = useState(false)
  const session = sessionFor(encounter, shared?.sessions)
  const stage = sessionStage(session)

  const set = (patch) => actions.updateEncounter(encounter.id, patch)
  const setSetup = (patch) => set((e) => ({ setup: { ...(e.setup || createSetup()), ...patch } }))
  const setOpponent = (patch) => set((e) => ({ opponent: { ...e.opponent, ...patch } }))
  const go = (step) => { setSetup({ step }); window.scrollTo(0, 0) }

  // Once both have revealed, their rating is a fact, and so is the reveal.
  const theirCrew = session?.theirs?.crew
  useEffect(() => {
    const patch = ratingPatch(encounter, session)
    if (patch) set(patch)
    if (stage === 'both' && !setup.revealed) setSetup({ revealed: true })
  }, [encounter.id, theirCrew, stage]) // eslint-disable-line react-hooks/exhaustive-deps

  const locked = Boolean(setup.revealed || encounter.revealedAt || session?.mine?.revealed)
  const cap = encounterCap(arsenal, encounter.opponent.arsenalTotal)
  const size = encounterSizeOf(encounter, arsenal)
  const pool = poolFor(encounter, arsenal)
  const ready = encounterReady(encounter, arsenal)
  const theirRating = encounter.opponent.rating
  const facts = {
    sizeKnown: size != null,
    hireReady: ready,
    ratingKnown: theirRating != null && theirRating !== '',
  }
  const done = stepsDone(setup, facts)
  const gaps = setupGaps(setup, facts)
  const step = SETUP_STEPS.find((s) => s.id === setup.step) || SETUP_STEPS[0]
  const iAttack = setup.attacker === 'me'
  const deployment = deploymentForSuit(setup.deploymentSuit)

  const totalOf = (a) => arsenalTotal((a.models || []).filter((m) => !m.annihilated))
  const others = (membership?.arsenals || []).filter((a) => !a.isMine && !a.member?.isYou)
  const pickOpponent = (id) => {
    const a = others.find((x) => x.id === id)
    if (!a) { setOpponent({ arsenalId: null }); return }
    setOpponent({
      arsenalId: a.id,
      arsenalTotal: totalOf(a),
      name: a.member?.nickname || encounter.opponent.name || a.leader?.name || '',
    })
  }

  const crews = arsenal.crews || []

  const panels = {
    size: (
      <>
        <Field>
          <Label>Who you are playing</Label>
          {others.length > 0 && (
            <Select
              value={encounter.opponent.arsenalId || ''}
              onChange={(e) => pickOpponent(e.target.value)}
              disabled={Boolean(encounter.sharedId)}
            >
              <option value="">Someone not at this table, typed below</option>
              {others.map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.member?.nickname || 'unnamed player')} — {a.leader?.name || 'unnamed leader'} ({totalOf(a)}ss)
                </option>
              ))}
            </Select>
          )}
          <div className="grid2">
            <div>
              <span className="crew__sublabel">Name</span>
              <Input value={encounter.opponent.name} onChange={(e) => setOpponent({ name: e.target.value })} aria-label="Opponent" />
            </div>
            <div>
              <span className="crew__sublabel">Their arsenal, ss</span>
              <Input
                value={encounter.opponent.arsenalTotal ?? ''}
                onChange={(e) => setOpponent({ arsenalTotal: e.target.value === '' ? null : e.target.value, arsenalId: null })}
                inputMode="numeric" placeholder="e.g. 32" aria-label="Their arsenal total"
              />
            </div>
          </div>
        </Field>
        <Field>
          <Label>Encounter size</Label>
          <Input
            value={encounter.encounterSize ?? ''}
            onChange={(e) => set({ encounterSize: e.target.value === '' ? null : e.target.value })}
            inputMode="numeric"
            placeholder={cap != null ? `${cap} — the cap` : 'soulstones'}
            disabled={locked}
          />
          <p className="gap-note">
            <strong>In a campaign the size is capped</strong> at the smaller of
            the two arsenals plus six (p. 19); yours is {totalFor(arsenal)}ss.
            {cap != null ? ` This game can be at most ${cap}ss. Leave it blank to play at the cap.` : ' Enter theirs to see the cap.'}
            {' '}A smaller game is fine if you both agree.
          </p>
        </Field>
      </>
    ),

    terrain: (
      <Field>
        <Label>Place and define terrain</Label>
        <ul className="setup__list">
          <li>A 3&Prime; by 3&Prime; table, with roughly half to two-thirds of it covered.</li>
          <li>Three to eight climbable pieces at least Ht 2 that models can stand on.</li>
          <li>A mix of traits: pieces that block or conceal sight, and some that slow movement.</li>
          <li>Agree what each piece is before anyone hires. Large pieces can be split into smaller ones.</li>
        </ul>
        <label className="hire__check">
          <input type="checkbox" checked={setup.terrainDone} onChange={(e) => setSetup({ terrainDone: e.target.checked })} />
          The terrain is placed and every piece is defined
        </label>
      </Field>
    ),

    scenario: (
      <>
        <Field>
          <Label>Who is the attacker?</Label>
          <p className="note">Both flip a card; higher is the attacker. Jokers and ties are reflipped.</p>
          <div className="chips">
            <Chip on={setup.attacker === 'me'} onClick={() => setSetup({ attacker: 'me' })}>I am</Chip>
            <Chip on={setup.attacker === 'them'} onClick={() => setSetup({ attacker: 'them' })}>
              {encounter.opponent.name || 'They are'}
            </Chip>
          </div>
        </Field>
        <div className="grid2">
          <Field>
            <Label>Attacker&rsquo;s flip — the strategy</Label>
            <div className="chips">
              {[...SUITS, 'joker'].map((suit) => (
                <Chip key={suit} on={setup.strategySuit === suit} onClick={() => setSetup(strategySuitPatch(suit))}>
                  {SUIT_NAMES[suit]}
                </Chip>
              ))}
            </div>
            {setup.strategySuit === 'joker' && (
              <>
                <p className="note">A joker in {SEASON.name} offers either of these; agree which.</p>
                <div className="chips">
                  {strategiesForSuit('joker').map((s) => (
                    <Chip key={s.slug} on={setup.strategy === s.slug} onClick={() => setSetup({ strategy: s.slug })}>{s.name}</Chip>
                  ))}
                </div>
              </>
            )}
          </Field>
          <Field>
            <Label>Defender&rsquo;s flip — the deployment</Label>
            <div className="chips">
              {SUITS.map((suit) => (
                <Chip key={suit} on={setup.deploymentSuit === suit} onClick={() => setSetup({ deploymentSuit: suit })}>
                  {SUIT_NAMES[suit]}
                </Chip>
              ))}
            </div>
            <p className="note">The defender reflips a joker.</p>
          </Field>
        </div>
        {deployment && (
          <p className="setup__fact"><strong>{deployment.name}.</strong> {deployment.zone}</p>
        )}
        {setup.strategy && <ScenarioCard kind="strategy" slug={setup.strategy} text={text} />}
      </>
    ),

    schemes: (
      <Field>
        <Label>The scheme pool — three, for both players</Label>
        <p className="note">
          The attacker shuffles the {SEASON.name} schemes and turns three face up.
          Tick the three you turned, or let the app draw them.
        </p>
        <div className="export">
          <Button ghost onClick={() => setSetup(drawSchemePool())}>Draw three for us</Button>
          {setup.schemePool.length > 0 && (
            <Button ghost onClick={() => setSetup({ schemePool: [], scheme: null })}>Clear</Button>
          )}
        </div>
        <div className="chips setup__schemes">
          {SCHEMES.map((s) => (
            <Chip
              key={s.slug}
              on={setup.schemePool.includes(s.slug)}
              disabled={!setup.schemePool.includes(s.slug) && setup.schemePool.length >= SCHEME_POOL_SIZE}
              onClick={() => setSetup(toggleSchemeInPool(setup, s.slug))}
            >
              {s.name}
            </Chip>
          ))}
        </div>
        {setup.schemePool.map((slug) => <ScenarioCard key={slug} kind="scheme" slug={slug} text={text} />)}
      </Field>
    ),

    deployment: (
      <Field>
        <Label>Choose deployment</Label>
        {deployment ? (
          <p className="setup__fact"><strong>{deployment.name}.</strong> {deployment.zone}</p>
        ) : (
          <p className="note">The deployment comes from the defender&rsquo;s flip in step C.</p>
        )}
        <p className="note">
          {setup.attacker
            ? `${iAttack ? 'You are' : `${encounter.opponent.name || 'Your opponent'} is`} the attacker, so ${iAttack ? 'you choose' : 'they choose'} which zone to deploy in.`
            : 'The attacker chooses which zone to deploy in.'}
        </p>
        <label className="hire__check">
          <input type="checkbox" checked={setup.deploymentChosen} onChange={(e) => setSetup({ deploymentChosen: e.target.checked })} />
          The zones are chosen
        </label>
      </Field>
    ),

    leader: (
      <Field>
        <Label>Faction and leader</Label>
        <p className="setup__fact">
          <strong>{leader.name || 'Your leader'}</strong>, {factionLabel(arsenal.faction) || 'no faction set'}
          {arsenal.keywords?.filter(Boolean).length ? ` · ${arsenal.keywords.filter(Boolean).join(' / ')}` : ''}
        </p>
        <p className="gap-note">
          <strong>Nothing to choose in a campaign.</strong> Each player declares
          the faction and leader they declared for the campaign (p. 19).
        </p>
      </Field>
    ),

    hire: (
      <>
        {crews.length > 0 && !locked && (
          <Field>
            <Label>Start from a saved crew</Label>
            <Select
              value=""
              onChange={(e) => {
                const crew = crews.find((c) => c.id === e.target.value)
                if (crew) set(selectionFromCrew(crew, arsenal))
              }}
            >
              <option value="">Pick one to load it…</option>
              {crews.map((c) => <option key={c.id} value={c.id}>{c.name || 'Unnamed crew'}</option>)}
            </Select>
          </Field>
        )}
        <CrewPicker
          selection={encounter}
          onChange={(patch) => set(patch)}
          arsenal={arsenal}
          leader={leader}
          archetype={archetype}
          rules={rules}
          size={size}
          pool={pool ? (pool.total ?? `${pool.fromHire}+`) : null}
          locked={locked}
        />
        {!locked && (
          <div className="export">
            <Button
              ghost
              onClick={() => actions.saveCrew(createCrew({
                ...selectionOf(encounter),
                name: nextCrewName(crews),
                size,
              }))}
            >
              Save this as a crew
            </Button>
          </div>
        )}
      </>
    ),

    reveal: (
      <>
        {shared && (
          <SharedCrewPanel
            encounter={encounter}
            arsenal={arsenal}
            leader={leader}
            shared={shared}
            ready={ready}
            onLinked={(sharedId) => set({ sharedId })}
            onRevealed={() => { set({ revealedAt: Date.now() }); setSetup({ revealed: true }) }}
          />
        )}
        <Field>
          <Label>Reveal crews</Label>
          <p className="note">
            Both crews are shown in full: every model, its equipment and the
            crew card. Revealing locks your crew here, because changing it after
            seeing theirs is the one thing hiring in secret prevents.
          </p>
          {!ready && <p className="note note--warn">Your crew is not legal yet; see the Hire step.</p>}
          <label className="hire__check">
            <input
              type="checkbox"
              checked={setup.revealed}
              // A shared reveal is on the server and cannot be taken back. A
              // tick on this device alone can, so a mis-tap is not a trap.
              disabled={Boolean(encounter.revealedAt || session?.mine?.revealed)}
              onChange={(e) => setSetup({ revealed: e.target.checked })}
            />
            We have shown each other our crews
          </label>
        </Field>
      </>
    ),

    rating: (
      <Field>
        <Label>Campaign rating</Label>
        <div className="hire__breakdown">
          <span>your rating</span><span className="hire__adj">{crewRating(encounter, arsenal)}</span>
          <span>theirs</span>
          <span>
            <Input
              className="input setup__num"
              value={theirRating ?? ''}
              onChange={(e) => setOpponent({ rating: e.target.value === '' ? null : e.target.value })}
              inputMode="numeric"
              aria-label="Their campaign rating"
            />
          </span>
          {pool && (
            <>
              <span>starting pool</span>
              <span className="hire__total">{pool.total ?? `${pool.fromHire} + ?`}</span>
            </>
          )}
        </div>
        <p className="gap-note">
          <strong>Worked out after the reveal (p. 19).</strong> Equipment taken,
          plus your leader&rsquo;s and totem&rsquo;s advancements, minus the
          injuries in the crew. The lower-rated crew adds the difference to its
          pool, up to three, even past six.
        </p>
      </Field>
    ),

    deploy: (
      <Field>
        <Label>Deployment</Label>
        <ol className="setup__list">
          <li>The defender splits their crew into two groups (either may be empty).</li>
          <li>The attacker picks one group, and the defender deploys it in their zone.</li>
          <li>The attacker deploys their whole crew in the other zone.</li>
          <li>The defender deploys the remaining group.</li>
        </ol>
        {setup.attacker && <p className="note">You are the {iAttack ? 'attacker' : 'defender'}.</p>}
        <label className="hire__check">
          <input type="checkbox" checked={setup.deployed} onChange={(e) => setSetup({ deployed: e.target.checked })} />
          Both crews are deployed
        </label>
      </Field>
    ),

    scheme: (
      <Field>
        <Label>Choose your scheme, in secret</Label>
        {setup.schemePool.length === 0 ? (
          <p className="note">Generate the pool in step D first.</p>
        ) : (
          <div className="chips">
            {setup.schemePool.map((slug) => (
              <Chip key={slug} on={setup.scheme === slug} onClick={() => setSetup(chooseScheme(setup, slug))}>
                {schemeBySlug(slug)?.name || slug}
              </Chip>
            ))}
          </div>
        )}
        <p className="note">
          Kept with your own campaign, never sent to your opponent, even in a
          shared game. Do not pass them the phone.
        </p>
        {setup.scheme && <ScenarioCard kind="scheme" slug={setup.scheme} text={text} />}
      </Field>
    ),

    start: (
      <Field>
        <Label>Start of game</Label>
        <p className="note">
          Both players shuffle every card back in, a full 54, and offer the
          other a cut. Start-of-game effects happen now; the attacker orders
          them. Then turn one.
        </p>
        {gaps.length > 0 && (
          <p className="gap-note">
            <strong>Still open:</strong> {gaps.map((g) => `${g.letter} ${g.name}`).join(', ')}.
            You can start anyway.
          </p>
        )}
        <div className="export">
          <Button onClick={() => onStart(pool?.total ?? pool?.fromHire ?? 0)} disabled={!ready}>
            Start the game
          </Button>
        </div>
        {!ready && <p className="note">The crew has to be legal first; see the Hire step.</p>}
      </Field>
    ),
  }

  return (
    <>
      <nav className="setup__rail" aria-label="Encounter setup">
        {SETUP_STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`setup__step${s.id === step.id ? ' setup__step--on' : ''}${done[s.id] ? ' setup__step--done' : ''}`}
            onClick={() => go(s.id)}
            aria-current={s.id === step.id ? 'step' : undefined}
          >
            <span className="setup__letter">{s.letter}</span>
            <span className="setup__name">{s.name}</span>
          </button>
        ))}
      </nav>

      <h2 className="setup__title">
        <span className="setup__letter">{step.letter}</span> {step.name}
        {step.campaign && <span className="setup__tag"> · added by the campaign</span>}
      </h2>

      {panels[step.id]}

      {text.error && (step.id === 'scenario' || step.id === 'schemes' || step.id === 'scheme') && (
        <p className="note note--warn">
          The strategy and scheme text could not be read from BiggerHat ({text.error}).
          The names above are enough to play; the cards have the rest.
        </p>
      )}

      <div className="export setup__nav">
        {previousStep(step.id) && <Button ghost onClick={() => go(previousStep(step.id))}>Back</Button>}
        {nextStep(step.id) && <Button onClick={() => go(nextStep(step.id))}>Next: {SETUP_STEPS.find((s) => s.id === nextStep(step.id)).name}</Button>}
        {discarding ? (
          <>
            <Button ghost onClick={() => { onDiscard(); setDiscarding(false) }}>Yes, throw this game away</Button>
            <Button ghost onClick={() => setDiscarding(false)}>Keep it</Button>
          </>
        ) : (
          <Button ghost onClick={() => setDiscarding(true)}>Start over</Button>
        )}
      </div>
    </>
  )
}

/** A strategy or scheme, by name, with its text when BiggerHat has answered. */
export function ScenarioCard({ kind, slug, text }) {
  const meta = kind === 'strategy' ? strategyBySlug(slug) : schemeBySlug(slug)
  const live = kind === 'strategy' ? text.strategy(slug) : text.scheme(slug)
  const parts = kind === 'strategy'
    ? [['Setup', live?.setup], ['Rules', live?.rules], ['Scoring', live?.scoring], ['Additional scoring', live?.additional_scoring]]
    : [['Selected', live?.selector], ['Prerequisite', live?.prerequisite], ['Reveal', live?.reveal], ['Scoring', live?.scoring]]
  return (
    <article className="crewcard setup__card">
      <div className="crewcard__head">
        <span className="record__eyebrow">{kind === 'strategy' ? 'Strategy' : 'Scheme'} · {SEASON.name}</span>
        {meta?.suit && <span className="record__file">{SUIT_NAMES[meta.suit]}</span>}
      </div>
      <h3 className="crewcard__name">{meta?.name || live?.name || slug}</h3>
      {live ? (
        parts.filter(([, v]) => v).map(([k, v]) => (
          <section className="record__section" key={k}>
            <div className="record__section-k">{k}</div>
            <p className="setup__text"><IconText text={v} /></p>
          </section>
        ))
      ) : (
        <p className="note">{text.loading ? 'Reading the text from BiggerHat…' : 'The text is on the card.'}</p>
      )}
      <div className="record__foot">Read live from BiggerHat and not stored. The cards remain the authority.</div>
    </article>
  )
}
