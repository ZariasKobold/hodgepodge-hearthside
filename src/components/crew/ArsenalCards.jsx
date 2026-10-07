import { Label, Field } from '../ui.jsx'
import { liveModels } from '../../lib/shape/arsenal.js'
import LeaderRecord from '../LeaderRecord.jsx'
import TotemCard from '../TotemCard.jsx'
import CrewCards from '../CrewCards.jsx'

/**
 * Every card in the arsenal, in one place: the Cards tab (v0.34.0).
 *
 * The leader first, as this app's own leader card; the totem off its table
 * row; then every model still in the arsenal, read from BiggerHat behind the
 * existing button, because an arsenal grows all campaign (`CrewCards`).
 */
export default function ArsenalCards({ arsenal, leader, archetype, rules }) {
  return (
    <>
      <Field>
        <Label>Your leader</Label>
        <LeaderRecord leader={leader} archetype={archetype} rules={rules} variant="card" />
      </Field>
      {arsenal.totem && (
        <Field>
          <Label>Your totem</Label>
          <TotemCard totem={arsenal.totem} />
        </Field>
      )}
      <CrewCards models={liveModels(arsenal)} rules={rules} />
    </>
  )
}
