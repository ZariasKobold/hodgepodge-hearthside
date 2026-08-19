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

Ten tables.

## 3. Bind the database to Pages

Dashboard → your Pages project → **Settings** → **Bindings** → **Add** →
**D1 database**.

- Variable name: `DB` *(must match — the Functions read `env.DB`)*
- Database: `hodgepodge-hearthside`

Add it for **Production** and **Preview**.

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

## 5. Add the secrets to Pages

Dashboard → **Settings** → **Environment variables** → Production:

| Name | Type | Value |
|---|---|---|
| `DISCORD_CLIENT_ID` | Plaintext | from step 4 |
| `DISCORD_CLIENT_SECRET` | **Secret** | from step 4 |

Set the secret as **Encrypt**, not plaintext.

**No `VITE_` prefix on these.** That prefix is what Vite uses to decide what to
bake into the browser bundle. A client secret in the bundle is readable by
anyone with devtools. These are read server-side by the Function, from `env`,
and never reach the browser.

Redeploy after adding them — variables are picked up at build.

## 6. Test

- `https://your-site/api/auth/me` → `{"user":null}` means D1 is bound and
  reachable.
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
