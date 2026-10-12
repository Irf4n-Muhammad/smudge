# Putting Forma online

This is the checklist for running Forma for real people. The local playground (`npm run dev`)
is unchanged; everything here is `FORMA_MODE=production`.

## What production mode changes

| Area      | Local playground (`demo`)                    | Production                                    |
| --------- | -------------------------------------------- | --------------------------------------------- |
| Accounts  | Auto-signed in as Alex, account switcher     | Sign up / log in with email and password only |
| Content   | Demo people, posts, profiles and mods        | Empty network; stock photos only              |
| Email     | Shown in the in-app "local demo inbox"       | Sent through Resend; never shown in the app   |
| MCP token | Acts as Alex                                 | Ignored                                       |
| Origins   | `127.0.0.1:3000` app, `127.0.0.1:3002` posts | Your two `https://` hostnames                 |
| Cookies   | `HttpOnly; SameSite=Strict`                  | Same, plus `Secure`                           |

Accounts: passwords are hashed with scrypt; sessions last 30 days and are stored as hashes; five
wrong passwords lock an account for 15 minutes; signup and login are also limited per IP; email
confirmation and password reset links are single-use (24 hours and 1 hour). A reset signs out
every device. Delivered emails are kept only as envelopes; their links are erased. See ADR 0012.

## You need

1. **A domain** with two hostnames pointing at the same server, for example
   `forma.example.com` (the app) and `run.forma.example.com` (post code). Post code runs on the
   second hostname so it can never read the app's sign-in cookie. Do not skip this.
2. **Resend** (https://resend.com) for email: add and verify your domain (DNS records they give
   you), then create an API key. The sender address must use the verified domain.
3. **A host that runs a Docker container with a persistent disk.** The database is a single file;
   run exactly one instance. Fly.io, Railway, Render (with a disk) or any VPS with Docker work.

## Settings

Set these as environment variables or secrets on the host (template: `.env.example`):

| Variable                 | Example                              | Notes                             |
| ------------------------ | ------------------------------------ | --------------------------------- |
| `FORMA_MODE`             | `production`                         | Set by the Docker image already   |
| `FORMA_PUBLIC_URL`       | `https://forma.example.com`          | Exact origin, no path             |
| `FORMA_RUNTIME_URL`      | `https://run.forma.example.com`      | Must differ from the public URL   |
| `RESEND_API_KEY`         | `re_...`                             | Secret                            |
| `FORMA_MAIL_FROM`        | `Forma <hello@forma.example.com>`    | Verified domain                   |
| `FORMA_DATA_DIR`         | `/data`                              | Mount the persistent disk here    |
| `PORT`                   | `8080`                               | Usually set by the host           |
| `FORMA_CLIENT_IP_HEADER` | `fly-client-ip` / `cf-connecting-ip` | Only when behind the host's proxy |
| `FORMA_ADMIN_EMAILS`     | `you@example.com,ops@example.com`    | Who sees Moderation (confirmed)   |
| `GOOGLE_CLIENT_ID`       | `123-abc.apps.googleusercontent.com` | Optional, with the secret         |
| `GOOGLE_CLIENT_SECRET`   | `GOCSPX-...`                         | Secret                            |

The server refuses to start in production if a URL is missing, not `https`, the two URLs share
an origin, or email is not configured. That is deliberate.

## Google login (optional)

1. In Google Cloud Console open **APIs & Services → OAuth consent screen**, choose External, fill
   in the app name, support email and your domain, and add the scopes `openid`, `email` and
   `profile`. Publish the app (testing mode only lets listed test users in).
2. **Credentials → Create credentials → OAuth client ID → Web application.** Add the authorized
   redirect URI `https://forma.example.com/api/auth/google/callback` (your `FORMA_PUBLIC_URL`).
3. Put the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and restart.
   "Continue with Google" appears on the login and signup screens only when both are set.

## Moderators

Sign up with the email you put in `FORMA_ADMIN_EMAILS`, confirm it, and a **Moderation** item
appears in the menu. Reports, removals and suspensions are described in ADR 0013.

## Option A: Fly.io (Singapore region)

```sh
fly launch --no-deploy --region sin        # creates fly.toml; say no to databases
fly volumes create forma_data --region sin --size 1
```

Add to `fly.toml`:

```toml
[env]
  FORMA_PUBLIC_URL = "https://forma.example.com"
  FORMA_RUNTIME_URL = "https://run.forma.example.com"
  FORMA_CLIENT_IP_HEADER = "fly-client-ip"

[mounts]
  source = "forma_data"
  destination = "/data"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  min_machines_running = 1
```

```sh
fly secrets set RESEND_API_KEY=re_... FORMA_MAIL_FROM="Forma <hello@forma.example.com>"
fly deploy
fly certs add forma.example.com
fly certs add run.forma.example.com      # then add the DNS records it prints
fly scale count 1                        # one writer for the database file
```

## Option B: any VPS with Docker

```sh
docker build -t forma .
docker run -d --name forma --restart unless-stopped \
  -p 127.0.0.1:8080:8080 -v forma-data:/data --env-file .env forma
```

Put a TLS proxy in front for both hostnames, for example Caddy:

```
forma.example.com, run.forma.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

With Caddy in front, set `FORMA_CLIENT_IP_HEADER=x-forwarded-for`.

## After the first deploy

1. Open the app, sign up, and check the confirmation email arrives and its link works.
2. Use "Forgot password?" once to check reset emails.
3. Open a post and confirm it loads (this exercises the second hostname).
4. Logs are JSON lines with route patterns and trace IDs, never cookies or email contents. Mail
   failures log `{"mail":"retry"|"failed"}`; a `failed` usually means the sender domain is not
   verified in Resend.

## Backups

Everything lives in `FORMA_DATA_DIR/forma.sqlite`. The server writes it with an atomic rename,
so copying the file at any moment gives a consistent snapshot. Copy it off the server daily (on
Fly, volume snapshots are also taken automatically). To restore, stop the app, replace the file,
start it again. Never run two instances against one data directory; the lock file refuses it.

## Known limits before a wider launch

- One process, one database file: fine for a beta with hundreds of people, not for big scale.
  The next step up is moving the store to Postgres.
- `GET /api/bootstrap` still returns every user to signed-in clients, which the current web app
  needs for names and avatars. Replace it with paged lookups before the user list gets large.
- Account deletion and a moderation screen exist (ADR 0013). Data export and purging the hidden
  posts of deleted accounts are still missing; both matter for Indonesia's PDP law.
- Notifications and messages arrive by polling (every 20 and 5 seconds); there are no push or
  email notifications yet.
- Organisation domains and admins for "Who you are" are still a fixed list in code.
