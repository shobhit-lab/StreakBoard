# StreakBoard backend (Appwrite TablesDB)

Implements the backend half of the StreakBoard PRD: TablesDB schema, row-level security,
and five Appwrite Functions. Any Appwrite client (web, Flutter, React Native) can use it unchanged.

## Quick start

```bash
npm install
export APPWRITE_ENDPOINT=https://<REGION>.cloud.appwrite.io/v1
export APPWRITE_PROJECT_ID=<project id>
export APPWRITE_API_KEY=<server key with databases/tables/columns/indexes read+write>

npm test            # 26 offline tests, no Appwrite needed
npm run setup       # creates database, tables, columns, indexes (idempotent)
# edit projectId in appwrite.json, then:
npm run deploy      # syncs shared/ into each function, then `appwrite push functions`
```

In the console: enable **Anonymous** and **Email** auth and add your Web platform hostname.
`appwrite.json` already declares each function's execute permission, scopes and the three
event triggers for `cascade`. Verify they landed under the function's Settings -> Events.

## What was built

| Piece | File | Purpose |
| --- | --- | --- |
| Schema | `setup.mjs` | `habits`, `checkins`, `user_settings`, all indexes incl. unique `(habitId, day)` |
| `create-habit` | `functions/create-habit` | Validates input, enforces 50 active habits, sets owner-only permissions |
| `checkin` | `functions/checkin` | Auth, ownership (404 for foreign/missing), timezone-aware window, idempotent write, stats refresh |
| `stats` | `functions/stats` | One habit or all active habits; recomputes and repairs the cached columns |
| `cascade` | `functions/cascade` | Habit delete -> purge check-ins; check-in delete -> refresh stats; user delete -> purge everything |
| `export` | `functions/export` | Caller's habits + check-ins as JSON, 50k row cap, `truncated` flag |
| Logic | `shared/streaks.js` | Pure date and streak code; calendar-date math so DST cannot shift a day |

## Where this improves on the PRD

1. **Check-in ids are deterministic** (`sha256(habitId:day)`), so the unique index and the row id both guard against duplicates, and a conflict is resolved by `getRow` with no query.
2. **Undo keeps stats correct.** The PRD had clients delete a check-in and then call `stats`. A client can skip that second call, so `cascade` also listens to `checkins.*.delete` and rebuilds the cache itself.
3. **The 50-habit limit is actually enforceable.** Direct client `createRow` can't enforce it, so habit creation goes through `create-habit` (a fifth function) and `habits` has no client `create` permission. `checkins` is function-only from day one, instead of removing the permission later (PRD section 10, step 5).
4. **No stored API key.** Functions use Appwrite's per-execution key (`x-appwrite-key`) with scopes from `appwrite.json`; `APPWRITE_API_KEY` is only a local fallback.
5. **Cached stats are repaired, not trusted.** `stats` rewrites the cache only if it differs, so tampering is overwritten at no cost on the happy path.
6. Dropped the PRD line "Max 5 notes characters beyond 280 rejected"; it is covered by the 280-char column and the function check.

## Client cheat sheet

```js
await account.createAnonymousSession();
await functions.createExecution({ functionId: 'create-habit', body: JSON.stringify({ name: 'Read', emoji: '📚' }), async: false });
await functions.createExecution({ functionId: 'checkin', body: JSON.stringify({ habitId, day /* optional */ }), async: false });
const habits = await tablesDB.listRows({ databaseId: 'streakboard', tableId: 'habits', queries: [Query.equal('archived', false)] });
const history = await tablesDB.listRows({ databaseId: 'streakboard', tableId: 'checkins', queries: [Query.greaterThanEqual('day', from)] });
await tablesDB.deleteRow({ databaseId: 'streakboard', tableId: 'checkins', rowId });   // undo; cascade refreshes stats
```
On first run, create the user's `user_settings` row (`userId`, `timezone` from `Intl.DateTimeFormat().resolvedOptions().timeZone`)
directly with `createRow` and `Permission.read/update(Role.user(id))`; without it everything works in UTC.

## Known gaps (honest list)

- **Not run against a live Appwrite project.** Handlers are tested against an in-memory fake that mimics TablesDB semantics (404/409, queries, cursors). The SDK call shapes were checked against current docs, but pin `node-appwrite` to the version you install and do one end-to-end pass before demo.
- **Per-user rate limit (60/min) is not implemented.** Rely on Appwrite's built-in limits for now; the unique index already makes spam harmless to data integrity.
- **Unarchiving can exceed 50 active habits**, since archive/unarchive is a direct client update. Fix later by routing it through a function.
- **Event fan-out:** deleting a habit with N check-ins triggers N lightweight `checkins.delete` runs after the main purge (they exit as "habit gone"). Fine at hackathon scale.
- The heatmap query filters on `userId` + `day`, served by `by_user_day`; the row-level permissions already scope results to the owner.
- `user_settings.timezone` is client-writable. A bad value falls back to UTC; backfill days are clamped to 0 to 7 server-side.
