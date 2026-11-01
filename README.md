# 🔥 StreakBoard

A habit and streak tracker built on **Appwrite TablesDB**. No signup needed: every visitor gets an anonymous session and can start tracking right away.

## Features

- Streak counter with a 90-day heatmap
- Daily check-ins handled by an Appwrite Function
- Duplicate check-ins are ignored; future dates are rejected (`422`)
- Undo a check-in and the stats stay correct
- Owner-only row-level permissions, so every user's data stays private

## Project structure

| Path | What it is |
| --- | --- |
| `streakboard-web/` | Frontend app |
| `streakboard-backend/` | Appwrite Function and backend code |
| `setup.fixed.mjs` | Node script that creates the database, tables, indexes and permissions in Appwrite |
| `setup-all.sh` | One-command setup script that runs the full setup |

## Backend design

Two related tables:

- `habits`
- `checkins`

`checkins` has a **unique index on `habitId` + `day`**, so duplicates are blocked at the database level. Rows use owner-only permissions.

## Getting started

### 1. Clone the repo

```bash
git clone https://github.com/shobhit-lab/StreakBoard.git
cd StreakBoard
```

### 2. Add your own Appwrite API key

> ⚠️ **Paste your own Appwrite API key.** Do not use anyone else's, and never commit your key to Git.

1. Open your [Appwrite Console](https://cloud.appwrite.io) and create (or pick) a project.
2. Go to **Overview → Integrations → API keys** and create a key with the scopes needed to manage databases/tables, rows, and functions.
3. Paste your **Project ID**, **endpoint**, and **API key** into the config the setup scripts read (for example a `.env` file or the variables at the top of the script):

```env
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=your_project_id
APPWRITE_API_KEY=paste_your_own_api_key_here
```

### 3. Run the setup

```bash
chmod +x setup-all.sh
./setup-all.sh
```

This runs `setup.fixed.mjs` and provisions everything in your Appwrite project. You can also run the Node script directly:

```bash
node setup.fixed.mjs
```

### 4. Run the web app

```bash
cd streakboard-web
npm install
npm run dev
```

Open the local URL shown in your terminal and click **Start tracking**.

## Security notes

- Keep your API key in `.env` and make sure `.env` is listed in `.gitignore`.
- The API key is only for setup and server-side use. Never ship it in the frontend.

## Built with

[Appwrite](https://appwrite.io) TablesDB, Appwrite Functions and anonymous sessions.
