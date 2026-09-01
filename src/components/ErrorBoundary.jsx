import { Component } from 'react'
import { campaignIds, loadCampaign, exportJSON } from '../lib/storage.js'

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

  rescue = () => {
    let saved = 0
    for (const id of campaignIds()) {
      const campaign = loadCampaign(id)
      if (!campaign) continue
      const name = campaign.arsenals?.[0]?.leader?.name || id
      exportJSON(campaign, `${String(name).toLowerCase().replace(/\s+/g, '-')}.json`)
      saved += 1
    }
    this.setState({ rescued: saved })
  }

  render() {
    if (!this.state.error) return this.props.children

    const count = campaignIds().length

    return (
      <div className="gap-note" role="alert">
        <strong>Something in this view broke.</strong> Your campaigns are
        untouched — this is a display fault, not a data one, and nothing has
        been written or deleted.

        <p style={{ marginTop: 12 }}>
          Reloading usually clears it. If it comes back on the same screen every
          time, take a copy of your data first: the button below reads your
          campaigns straight out of this browser and downloads one JSON file
          each, without going near the part that just failed.
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => window.location.reload()}>
            Reload the page
          </button>
          {count > 0 && (
            <button className="btn btn--ghost" onClick={this.rescue}>
              Download my {count === 1 ? 'campaign' : `${count} campaigns`}
            </button>
          )}
        </div>

        {this.state.rescued > 0 && (
          <p style={{ marginTop: 12 }}>
            Downloaded {this.state.rescued}. Import them from the Leaders screen
            on any device — an import is filed as a new leader and overwrites
            nothing.
          </p>
        )}

        <p style={{ marginTop: 12, opacity: 0.75 }}>
          <code>{String(this.state.error?.message || this.state.error)}</code>
        </p>
      </div>
    )
  }
}
