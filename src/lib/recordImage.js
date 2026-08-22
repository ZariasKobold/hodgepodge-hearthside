/**
 * The finished record as a PNG.
 *
 * Drawn onto a canvas rather than screenshotted from the DOM, for two reasons:
 * no third-party rasteriser has to be added to a project that ships React and
 * nothing else, and the output is laid out for a sheet of paper instead of
 * inheriting whatever width the browser window happened to be.
 *
 * The disclaimer is drawn into every image. §8 requires it on every page, and
 * an exported file is a page that will outlive this app.
 *
 * Imports nothing from React (§6).
 */
import { plainText, statLine, findEntry, findTrigger } from './rules.js'
import { downloadBlob } from './storage.js'

export const LEGAL =
  'Portions of the materials used are copyrighted works of Wyrd Miniatures, LLC, in the ' +
  'United States of America and elsewhere. All rights reserved, Wyrd Miniatures, LLC. This ' +
  'material is not official and is not endorsed by Wyrd Miniatures, LLC. Model data from BiggerHat.'

/* ── the sheet ─────────────────────────────────────────────────────────
   A flat, already-resolved description of what goes on the page. Pure, so the
   arrangement can be reasoned about without a canvas or a component tree. */

/**
 * @param cardFor  slug -> live card, or null. Absent text simply prints the
 *                 names, which is what the record did before any of this.
 */
export function buildSheet({ leader, archetype, factionLabel, fileNumber, slots, slotLabel, effect, cardFor }) {
  const sections = []

  for (const slot of slots) {
    const picks = leader.picks[slot] || []
    if (picks.length === 0) continue

    sections.push({
      heading: slotLabel(slot),
      entries: picks.map((pick) => {
        const head = String(pick.key || '').split('::')[0]
        const slug = pick.manual || head === 'manual' ? null : head
        const card = slug ? cardFor(slug) : null
        const entry = card ? findEntry(card, slot, pick.name) : null

        return {
          title: pick.name,
          meta: `— from ${pick.model}, ${pick.cost}ss`,
          stat: entry && slot !== 'ability' ? statLine(entry).join(' · ') : '',
          body: entry ? plainText(entry.description) : '',
          // Empty on purpose. The source model's triggers do not come with the
          // action; a leader holds only the trigger it was granted or earned,
          // and that one is written into its own section below.
          triggers: [],
        }
      }),
    })
  }

  if (leader.trigger) {
    // Resolve the kept trigger back to its text, via the attack action it
    // came from. Absent text just prints the name, as before.
    const attackPick = leader.picks.attack?.[0] || null
    const head = String(attackPick?.key || '').split('::')[0]
    const slug = !attackPick || attackPick.manual || head === 'manual' ? null : head
    const card = slug ? cardFor(slug) : null
    const kept = findTrigger(card ? findEntry(card, 'attack', attackPick.name) : null, leader.trigger)

    sections.push({
      heading: 'Trigger',
      entries: [{
        title: leader.trigger,
        meta: attackPick ? `— on ${attackPick.name}${kept?.suits ? `, ${kept.suits}` : ''}` : '',
        body: kept ? plainText(kept.description) : '',
        triggers: [],
      }],
    })
  }

  if (effect) {
    sections.push({
      heading: 'Crew card',
      entries: [{
        title: effect.name,
        meta: leader.crewCard.choice ? `— ${leader.crewCard.choice}` : `— p.${effect.page}`,
        body: '',
        triggers: [],
      }],
    })
  }

  if (archetype.freeEquipment) {
    sections.push({
      heading: 'Equipment',
      entries: [{
        title: 'One free upgrade by uncheatable flip',
        meta: '— returned to the arsenal if annihilated',
        body: '',
        triggers: [],
      }],
    })
  }

  return {
    eyebrow: `${factionLabel} · ${archetype.name}`,
    file: fileNumber,
    name: leader.name || 'Unnamed',
    line: [
      leader.keywords.filter(Boolean).join(' / '),
      leader.advancementPath,
      `Sz ${leader.size}`,
      `${leader.base}mm`,
      leader.characteristics.length ? leader.characteristics.join(', ') : null,
      'master',
    ].filter(Boolean).join(' · '),
    stats: [
      ['Df', archetype.stats.df],
      ['Wp', archetype.stats.wp],
      ['Sp', archetype.stats.sp],
      ['Health', archetype.stats.health],
    ],
    sections,
    legal: LEGAL,
  }
}

/* ── drawing ───────────────────────────────────────────────────────── */

const W = 940
const PAD = 54
const SCALE = 2

const INK = '#221d16'
const MUTE = '#6f665a'
const FAINT = '#8a8175'
const OXIDE = '#a8342a'
const CARD = '#e7e2d4'
const LINE = '#c3bca8'

const DISPLAY = "'Bodoni Moda', Georgia, serif"
const DATA = "'Courier Prime', 'Courier New', monospace"
const BODY = "Georgia, 'Times New Roman', serif"

/** letterSpacing is recent; where it is missing the text is merely tighter. */
function spacing(ctx, value) {
  try { ctx.letterSpacing = value } catch { /* older engine */ }
}

function wrap(ctx, text, maxWidth) {
  const lines = []
  for (const paragraph of String(text).split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) { lines.push(''); continue }
    let line = words[0]
    for (const word of words.slice(1)) {
      const test = `${line} ${word}`
      if (ctx.measureText(test).width <= maxWidth) line = test
      else { lines.push(line); line = word }
    }
    lines.push(line)
  }
  return lines
}

/**
 * Lays the sheet out against a measuring context, returning paint instructions
 * and the height they need. Measuring and painting are the same pass so the two
 * can never disagree about where a line broke.
 */
function compose(ctx, sheet) {
  const ops = []
  const right = W - PAD
  const inner = W - PAD * 2
  let y = PAD

  const text = (value, { font, color, x = PAD, size, gap = 0, track, align, max = inner }) => {
    ctx.font = font
    spacing(ctx, track || '0px')
    const lines = wrap(ctx, value, max)
    for (const line of lines) {
      y += size
      ops.push({ op: 'text', text: line, x, y, font, color, track, align })
      y += gap
    }
    spacing(ctx, '0px')
  }

  // masthead
  ctx.font = `700 11px ${DATA}`
  spacing(ctx, '2px')
  y += 11
  ops.push({ op: 'text', text: sheet.eyebrow.toUpperCase(), x: PAD, y, font: `700 11px ${DATA}`, color: OXIDE, track: '2px' })
  ops.push({ op: 'text', text: sheet.file, x: right, y, font: `400 11px ${DATA}`, color: MUTE, align: 'right' })
  spacing(ctx, '0px')
  y += 12
  ops.push({ op: 'rule', y, x1: PAD, x2: right, color: OXIDE, width: 2 })
  y += 26

  text(sheet.name, { font: `800 44px ${DISPLAY}`, color: INK, size: 44, gap: 4 })
  y += 8
  text(sheet.line, { font: `400 13px ${DATA}`, color: MUTE, size: 13, gap: 4 })
  y += 26

  // stats
  let x = PAD
  for (const [key, value] of sheet.stats) {
    ops.push({ op: 'text', text: key.toUpperCase(), x, y: y + 10, font: `700 10px ${DATA}`, color: FAINT, track: '2px' })
    ops.push({ op: 'text', text: String(value), x, y: y + 42, font: `700 30px ${DATA}`, color: INK })
    x += 118
  }
  y += 62

  for (const section of sheet.sections) {
    y += 14
    ops.push({ op: 'text', text: section.heading.toUpperCase(), x: PAD, y, font: `700 10px ${DATA}`, color: OXIDE, track: '2px' })
    y += 12

    for (const entry of section.entries) {
      y += 6
      text(entry.title, { font: `400 19px ${BODY}`, color: INK, size: 19, gap: 3 })
      if (entry.meta) text(entry.meta, { font: `400 12px ${DATA}`, color: MUTE, size: 12, gap: 2 })
      if (entry.stat) text(entry.stat, { font: `400 12px ${DATA}`, color: FAINT, size: 12, gap: 2 })
      if (entry.body) {
        y += 4
        text(entry.body, { font: `400 15px ${BODY}`, color: INK, size: 15, gap: 6, x: PAD + 14, max: inner - 14 })
      }
      for (const trigger of entry.triggers) {
        y += 5
        text(trigger.title, { font: `700 12px ${DATA}`, color: MUTE, size: 12, gap: 2, x: PAD + 14, max: inner - 14 })
        if (trigger.body) {
          text(trigger.body, { font: `400 14px ${BODY}`, color: MUTE, size: 14, gap: 5, x: PAD + 26, max: inner - 26 })
        }
      }
      y += 10
    }
  }

  y += 16
  ops.push({ op: 'rule', y, x1: PAD, x2: right, color: LINE, width: 1 })
  y += 6
  text(sheet.legal, { font: `400 10px ${DATA}`, color: FAINT, size: 10, gap: 5 })

  return { ops, height: Math.ceil(y + PAD) }
}

function paint(ctx, ops, height) {
  ctx.fillStyle = CARD
  ctx.fillRect(0, 0, W, height)
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, W - 1, height - 1)

  for (const op of ops) {
    if (op.op === 'rule') {
      ctx.strokeStyle = op.color
      ctx.lineWidth = op.width
      ctx.beginPath()
      ctx.moveTo(op.x1, op.y)
      ctx.lineTo(op.x2, op.y)
      ctx.stroke()
      continue
    }
    ctx.font = op.font
    ctx.fillStyle = op.color
    ctx.textAlign = op.align || 'left'
    spacing(ctx, op.track || '0px')
    ctx.fillText(op.text, op.x, op.y)
  }
  ctx.textAlign = 'left'
  spacing(ctx, '0px')
}

/**
 * Canvas will happily draw in a fallback face if the webfont has not arrived,
 * and the result looks like a bug. Ask for each variant by name first.
 */
async function readyFonts() {
  if (!document.fonts?.load) return
  const wanted = [
    `800 44px ${DISPLAY}`,
    `700 30px ${DATA}`,
    `700 11px ${DATA}`,
    `400 13px ${DATA}`,
    `400 19px ${BODY}`,
  ]
  try {
    await Promise.all(wanted.map((font) => document.fonts.load(font, 'Ag')))
    await document.fonts.ready
  } catch { /* draw with whatever is available */ }
}

export async function sheetToPNG(sheet, filename) {
  await readyFonts()

  const measure = document.createElement('canvas').getContext('2d')
  const { ops, height } = compose(measure, sheet)

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'alphabetic'
  paint(ctx, ops, height)

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The browser would not produce an image.')

  downloadBlob(blob, filename)
}

/**
 * PDF by way of the print dialogue — every browser has a competent PDF writer
 * behind "Save as PDF", and the print stylesheet already has to exist for
 * people who want it on paper.
 */
export function printSheet() {
  window.print()
}
