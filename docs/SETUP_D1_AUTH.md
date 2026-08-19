# Setting up D1 and sign-in

One-time setup. Everything here happens outside the code.

---

## 1. Create the database

```bash
npx wrangler login
npx wrangler d1 create hodgepodge-hearthside
```

It prints a `database_id`. Paste it into `wrangler.toml`, replacing
`PASTE_DATABASE_ID_HERE`.

## 2. Apply the schema

```bash
# local copy, for `wrangler pages dev`
npx wrangler d1 execute hodgepodge-hearthside --local --file=./migrations/0001_init.sql

# the real one
npx wrangler d1 execute hodgepodge-hearthside --remote --file=./migrations/0001_init.sql
```

Verify:

```bash
npx wrangler d1 execute hodgepodge-hearthside --remote --command="SELECT name FROM sqlite_master WHERE type='table'"
```

Ten tables — `arsenals`, `arsenal_models`, `campaigns`, `campaign_members`,
`equipment`, `game_equipment`, `games`, `injuries`, `sessions`, `users`.

The listing also shows `_cf_KV`, which is Cloudflare's own internal table, so
the row count reads eleven. That is normal and not something you added.

## 3. Bind the database to Pages — nothing to do

**Skip this. `wrangler.toml` already does it.** The `[[d1_databases]]` block
with `binding = "DB"` is picked up by deployed Pages Functions directly; no
dashboard binding is needed.

Verified on 2026-08-18, with no dashboard binding configured at all: a
deployed Function on a preview build read `context.env.DB` and successfully
queried the remote database. Confirmed for Preview; Production uses the same
single `wrangler.toml` block, and is proved end-to-end by the first successful
sign-in.

Do not also add it in the dashboard. One source of truth is the point — two
would mean editing whichever one is not being read and wondering why nothing
changed.

## 4. Create the OAuth app

**Discord** — where wargaming groups already live.

1. https://discord.com/developers/applications → **New Application**
2. **OAuth2** → copy the **Client ID**, then **Reset Secret** and copy that
3. Under **Redirects**, add both:
   - `https://hodgepodgehearthside.com/api/auth/discord/callback`
   - `https://hodgepodge-hearthside.pages.dev/api/auth/discord/callback`

The redirect URI must match *exactly*, including scheme and trailing path.
This is the single most common thing to get wrong.

**Google** (optional, same shape) — https://console.cloud.google.com/apis/credentials,
OAuth client ID, type Web application, same two redirect URIs with `/google/`.

## 5. Add the credentials — the two halves go to different places

Because this project has a `wrangler.toml`, Cloudflare manages plaintext
variables from that file and the dashboard will not accept them. The dialog
says so directly: *"Environment variables for this project are being managed
through wrangler.toml. Only Secrets (encrypted variables) can be managed via
the Dashboard."*

| Value | Where it goes | Why |
|---|---|---|
| `DISCORD_CLIENT_ID` | `wrangler.toml`, under `[vars]` | plaintext var — the dashboard refuses it. Public anyway; it rides in the authorize URL |
| `DISCORD_CLIENT_SECRET` | Dashboard → **Variables and secrets**, type **Secret** | encrypted at rest, unreadable after saving, and must never enter a committed file |

The dashboard section is named **Variables and secrets** now, not
"Environment variables".

If you lose the secret, reset it in Discord — it cannot be read back out of
Cloudflare once saved.

**No `VITE_` prefix on these.** That prefix is what Vite uses to decide what to
bake into the browser bundle. A client secret in the bundle is readable by
anyone with devtools. These are read server-side by the Function, from `env`,
and never reach the browser.

Redeploy after adding them — variables are picked up at deploy time, so the
already-live build cannot see them. Pushing any commit does it.

Add the secret to **Preview** as well as Production if you want sign-in to work
on branch deployments. Note that Discord matches redirect URIs exactly, so
sign-in works from the branch alias
(`hodgepodge-hearthside.pages.dev`) but not from a per-deployment subdomain
(`c16b3590.hodgepodge-hearthside.pages.dev`), which is not registered and
cannot be.

## 6. Test

- `https://your-site/api/auth/me` → `{"user":null}`. **This does not prove D1
  is bound.** `currentUser` returns early on
  `if (!sessionId || !env.DB) return null`, so with no session cookie you get
  `{"user":null}` whether the binding works or not. It only tells you the
  Function is deployed and not throwing. The binding is proved by step 2's
  table listing, and end-to-end by actually signing in below.
- `https://your-site/api/auth/discord` → bounces to Discord, then back signed in.
- `/api/auth/me` again → your profile.

## Local development

`npm run dev` has no Functions and no database. `useAuth` detects this and
degrades to signed-out; the app works normally.

To exercise Functions locally:

```bash
npm run build
npx wrangler pages dev dist
```

OAuth still needs a public redirect URI, so sign-in is easiest to test on a
preview deployment rather than locally.

---

## What's stored

Only `provider`, `provider_user_id`, `display_name`, and an avatar URL.
**No email, no password, no token.** The OAuth access token is used once to
read the profile and then discarded — we never need to act on anyone's behalf.

Sessions are a random 32-byte id in an `HttpOnly; Secure; SameSite=Lax` cookie,
30 days, sweepable server-side by deleting the row.
