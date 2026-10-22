import { exportJSON } from '../lib/storage.js'
import { fullArsenalExport, fullExportFilename, exportCardSlugs } from '../lib/arsenalExport.js'

/**
 * The three Export JSON buttons (sheet, arsenal view, creation record), as one.
 *
 * Reads the chosen actions' cards first, because their Skl lives there and the
 * export file is the one an outside tool reads. `ensureAll` is throttled and
 * records failures rather than throwing, so a register that is down still
 * exports, with those Skl values null (§6). The cards stay in `rules.js`'s
 * memory; only the numbers reach the file.
 */
export async function exportWholeArsenal({ arsenal, campaign, rules }) {
  const slugs = exportCardSlugs(arsenal)
  if (rules && slugs.length) await rules.ensureAll(slugs)
  const cards = Object.fromEntries(slugs.map((s) => [s, rules?.card(s) ?? null]))
  exportJSON(
    fullArsenalExport({
      arsenal, campaign, cards,
      build: typeof __BUILD__ === 'undefined' ? null : __BUILD__,
    }),
    fullExportFilename(arsenal)
  )
}
