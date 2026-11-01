# StreakBoard web

A daily habit tracker. React + Vite + the Appwrite web SDK, talking to the StreakBoard
backend (TablesDB + the functions `create-habit`, `checkin`, `stats`, `export`, `cascade`).
Visual design follows the Twist template: its palette, black cards, pill buttons, and
Clash Grotesk / Switzer type, with a light/dark toggle.

## Run it

```bash
npm install
cp .env.example .env      # fill in VITE_APPWRITE_ENDPOINT and VITE_APPWRITE_PROJECT_ID
npm run dev               # http://localhost:5173
npm run build             # static site in dist/
```

Needs Node 20.19+. No API key is used or needed in the browser.

## Backend checklist (Appwrite console)

1. Backend deployed as in its README (`npm run setup`, `npm run deploy`), database id `streakboard`.
2. **Auth**: Anonymous and Email/Password both enabled.
3. **Platforms**: add a Web platform for `localhost` and your production hostname.
4. Each function's execute permission includes `users` (already in `appwrite.json`).
5. `cascade` has its three event triggers (Functions -> cascade -> Settings -> Events).

## How the app uses the backend

| Feature | Call |
| --- | --- |
| First visit | `account.get()`; on 401 `createAnonymousSession()`. Later visits reuse the session. |
| Settings | Create `user_settings` once: `{ userId, timezone }`, read+update for the owner only. |
| Habit list | `listRows` on `habits`, `archived = false` |
| Add habit | Function `create-habit` `{ name, emoji }` |
| Check in | Function `checkin` `{ habitId, day? }`. Optimistic; replaced by the returned `stats`. |
| Undo | `deleteRow` on the check-in, then Function `stats` for that habit |
| Heatmap | `listRows` on `checkins`, `day >= today - 89`, cursor-paginated |
| Rename / archive | `updateRow` on `habits` (`name` / `archived`) |
| Export | Function `export`, downloaded as JSON |
| Upgrade | `account.updateEmail({ email, password })` once any streak reaches 3 days. Same user id, data kept. |

Notes on choices:

- Function 400/404/422 replies come back inside the execution result; `src/api.js` maps them to
  readable messages. A 404 also refreshes the list.
- Today's check-in sends no `day`, so the server decides "today" from the user's time zone.
  Tapping a heatmap cell in the past week back-fills it (or clears it if already filled).
- The queries also filter on `userId`, so they use the `by_user_*` indexes.
- The cached `currentStreak` is shown as 0 when the last check-in is older than yesterday, and `stats`
  is called in the background to repair the cache.
- Requests send `content-type: application/json` so `req.bodyJson` is populated in the functions.

## Not included on purpose

No sign-in screen (the upgrade creates the account; signing in on another device needs
`account.createEmailPasswordSession`, which was not requested), no social features, payments,
notifications, leaderboards or analytics.

## Fonts

Clash Grotesk and Switzer are copied from the Twist export (Fontshare). Confirm their license
fits your use before shipping.
