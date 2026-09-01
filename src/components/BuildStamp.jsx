/**
 * What is actually running, in the footer.
 *
 * Answers one question that kept coming up and could not be answered from the
 * page: **is the thing I just pushed the thing I am looking at?** Version,
 * commit and build date are baked in by `vite.config.js` at build time, so this
 * describes the bundle it is part of and cannot drift from it.
 *
 * The commit is the load-bearing half. A version number only moves when someone
 * remembers to bump it — this project's `package.json` sat at 0.8.0 while
 * CLAUDE.md said 0.17.0 — whereas `CF_PAGES_COMMIT_SHA` is set by Cloudflare on
 * every build and cannot be forgotten. If the footer's commit matches what you
 * pushed, the deploy landed; if it does not, it did not, whatever the dashboard
 * says.
 *
 * Locally it reads `dev · local`, which is the honest answer: there is no
 * commit, because Vite built this from the working tree, uncommitted changes
 * and all.
 *
 * Not `aria-hidden`. A build stamp is exactly the kind of thing someone reads
 * out to you when you are trying to work out what they are running.
 */
export default function BuildStamp() {
  const build = typeof __BUILD__ === 'undefined' ? null : __BUILD__
  if (!build) return null

  const date = new Date(build.builtAt)
  const built = Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <p className="buildstamp">
      <span className="buildstamp__v">v{build.version}</span>
      <span className="buildstamp__sep">·</span>
      {/* `title` rather than more text: the branch matters only when it is not
          the one you expect, and then it matters a great deal. */}
      <span className="buildstamp__commit" title={`branch: ${build.branch}`}>
        {build.commit}
      </span>
      {built && (
        <>
          <span className="buildstamp__sep">·</span>
          <span>built {built}</span>
        </>
      )}
    </p>
  )
}
