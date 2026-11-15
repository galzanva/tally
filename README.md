# Tally

Expenses for one household, with a REST API OpenClaw can call.

## Run

```bash
pnpm install
pnpm db:deploy
pnpm user:create -- --email you@example.com --password 'at-least-10-chars' --name G
pnpm dev
```

Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `API_KEY_PEPPER`, `SESSION_SECRET`, `CRON_SECRET`, and `APP_URL`. Add `BLOB_READ_WRITE_TOKEN` before production receipt uploads, and `LLM_API_KEY` before the AI helper will write reviews.

```bash
pnpm import:xlsx Expenses-tracker.xlsx --user you@example.com --dry-run
pnpm import:xlsx Expenses-tracker.xlsx --user you@example.com --create-recurring
```

## OpenClaw checklist

- The Telegram bot only accepts G's own Telegram user ID.
- OpenClaw is allowed to write files in its own folder.
- The key file (`~/.openclaw/secrets/tally.json`, mode 600) is not in any folder that gets synced or committed.
- The skill text points at that file and does not contain the key.
- To rotate: revoke the key in Settings → Connections, generate a new pairing code, and paste the new setup message.
