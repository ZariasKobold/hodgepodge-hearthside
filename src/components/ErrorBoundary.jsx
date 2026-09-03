import { Component } from 'react'
import {
  campaignIds, loadCampaign, arsenalIds, loadArsenal, exportJSON,
} from '../lib/storage.js'

/**
 * Catches a render crash so one bad field cannot cost the whole page.
 *
 * There was no boundary at all until v0.18.5, and React said so in the console
 * every time. The cost was found the honest way: a campaign carrying
 * `crewCard: null` threw inside `Arsenal`, and the entire app rendered blank —
 * masthead, disclaimer, navigation and every other campaign along with it. An
 * imported JSON can carry exactly that, and imports are files this app does not
 * get to vet (§12b). A single unexpected shape should cost one view.
 *
 * ## Where it sits, and why not higher
 *
 * Inside `<main>`, wrapping the views only. The masthead, the legal disclaimer
 * and the build stamp stay outside it and keep rendering — the disclaimer
 * because §8 requires it on every page and a crash is not an exemption, and the
 * build stamp because the first useful question about any crash is which build
 * produced it, and the answer should be on the screen the person is already
 * looking at rather than one they can no longer reach.
 *
 * ## The rescue button
 *
 * A crashed app that still holds twelve weeks of somebody's campaign in
 * localStorage must not be a locked door. §8 treats data portability as a
 * requirement rather than a courtesy, and the moment it matters most is the one
 * where the UI is gone. This reads storage directly and downloads every
 * campaign — no React state, no hooks, nothing that could be part of what just
 * broke.
 *
 * It deliberately does not offer to delete anything. Recovery offers should
 * never include the destructive option, however tempting "clear it and start
 * again" looks while staring at an error.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, rescued: 0 }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Left in the console on purpose. There is no error-reporting service here
    // and there should not be one — it would be a third party receiving
    // somebody's campaign — so the console is where a person looks.
    console.error('Hodgepodge Hearthside caught a render error:', error, info)
  }

  /**
   * Everything on this browser, as one file.
   *
   * Deliberately dumb: it reads both indexes straight out of localStorage, with
   * no hooks, no React state and no shape module, so nothing it depends on can
   * be part of what just broke. It does not even migrate — whatever is on the
   * disk is what comes out, and `readBundle` on the way back in knows every
   * shape this app has ever written.
   *
   * One bundle rather than a file per campaign, because since v3 a rescue has
   * two kinds of document to save and an arsenal without its table (or a table
   * without its arsenals) is half a rescue.
   */
  rescue = () => {
    const campaigns = campaignIds().map(loadCampaign).filter(Boolean)
    const arsenals = arsenalIds().map(loadArsenal).filter(Boolean)
    if (campaigns.length === 0 && arsenals.length === 0) return
    const stamp = new Date().toISOString().slice(0, 10)
    exportJSON({ campaigns, arsenals }, `hodgepodge-rescue-${stamp}.json`)
    this.setState({ rescued: arsenals.length || campaigns.length })
  }

  render() {
    if (!this.state.error) return this.props.children

    const count = arsenalIds().length || campaignIds().length

    return (
      <div className="gap-note" role="alert">
        <strong>Something in this view broke.</strong> Your campaigns are
        untouched — this is a display fault, not a data one, and nothing has
        been written or deleted.

        <p style={{ marginTop: 12 }}>
          Reloading usually clears it. If it comes back on the same screen every
          time, take a copy of your data first: the button below reads your
          leaders and campaigns straight out of this browser into one JSON file,
          without going near the part that just failed.
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => window.location.reload()}>
            Reload the page
          </button>
          {count > 0 && (
            <button className="btn btn--ghost" onClick={this.rescue}>
              Download my {count === 1 ? 'leader' : `${count} leaders`}
            </button>
          )}
        </div>

        {this.state.rescued > 0 && (
          <p style={{ marginTop: 12 }}>
            Saved {this.state.rescued}. Import the file from the Leaders screen
            on any device — an import is filed as new and overwrites nothing.
          </p>
        )}

        <p style={{ marginTop: 12, opacity: 0.75 }}>
          <code>{String(this.state.error?.message || this.state.error)}</code>
        </p>
      </div>
    )
  }
}
