# Decisions

These are the calls that were open in the spec, plus the ones made while building.

- Integer cents and a date-only `occurredOn` in the user's timezone, so amounts don't drift through floats and "today" doesn't depend on the server clock.
- A pairing code instead of pasting an API key into Telegram. The long-lived secret never sits in chat history. OpenClaw saves the key to its own private file, kept separate from the skill, so the key isn't loaded into every prompt. Setup is Telegram-only.
- Keys are stored as HMAC-SHA256 with a server pepper. High-entropy keys don't need argon2. Scopes and revoke apply on the next request.
- Category (what it was), entity (whose cost), and tax tag (how it's treated) stay separate so tax cleanup doesn't rewrite the spending picture.
- Recurring price changes live in a rate history table. Past postings stay as they were unless you explicitly reprice them.
- Recurring postings are idempotent because of `@@unique([recurringId, periodKey])`, not because the cron remembers what it did.
- An incoming expense that matches an unedited recurring posting updates that posting instead of inserting a second row.
- The model never does arithmetic. TypeScript computes the facts. The model writes the words around them.
- Receipt bytes are only reachable through an authenticated route. Responses never include the blob pathname or a blob URL.
- Rate limits live in Postgres. This is a single-tenant scale and doesn't need another service.
- Prisma stays on 6.19.3. The 8.0 release is still a candidate, and the scoped `forUser` helper depends on the stable client extension API.
- The daily cron route also purges expenses deleted more than 30 days ago, so Vercel Hobby stays at two cron jobs.
- The Tax Pack is one ZIP. It contains the CSV and the receipt files.
- The Expenses page keeps period chips visible. The rest of the filters live in the sheet.
- Imported property-tax rows are tagged `PROPERTY_TAX` and tax-payment rows are tagged `TAX_PAYMENT`. Every other imported row starts as `UNREVIEWED`.
- When `BLOB_READ_WRITE_TOKEN` is empty, receipt bytes are stored under `.data/blobs`. Production uses Vercel Blob, private when the store allows it.
- A refund is a negative cent amount and is shown with a leading plus in the accent color.
- Replaying an idempotency key rebuilds the response from the saved expense. There isn't a second response table.
- A wrong pairing code locks the single live code after five misses. Wrong guesses can't be tied to a code any other way, because only the hash is stored. The route is also limited to five attempts a minute per IP.
- Currency is a display code. Historical amounts are not converted when it changes.
- The web expense list defaults to year-to-date so an imported year is visible. Home still opens on this month.
