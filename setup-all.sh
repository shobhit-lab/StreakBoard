#!/usr/bin/env bash
# StreakBoard one-shot setup. Run from anywhere:  bash setup-all.sh
# - writes the frontend .env (endpoint + project ID only, never the API key)
# - creates the database/tables in Appwrite using your API key (asked once, hidden, not saved)
# - deploys the five functions
set -euo pipefail

ENDPOINT="https://fra.cloud.appwrite.io/v1"
PROJECT_ID="6ae6279a003770be29d9"
WEB="$HOME/Downloads/streakboard-web"
BACK="$HOME/Downloads/streakboard-backend"

[ -d "$WEB" ] || { echo "Can't find $WEB. Unzip streakboard-web.zip into ~/Downloads first."; exit 1; }
if [ ! -d "$BACK" ]; then
  if [ -f "$HOME/Downloads/streakboard-backend.zip" ]; then
    (cd "$HOME/Downloads" && unzip -q streakboard-backend.zip)
  else
    echo "Can't find $BACK or streakboard-backend.zip in ~/Downloads."; exit 1
  fi
fi

echo "1/4  Writing frontend .env"
cat > "$WEB/.env" <<ENV
VITE_APPWRITE_ENDPOINT=$ENDPOINT
VITE_APPWRITE_PROJECT_ID=$PROJECT_ID
ENV

echo "2/4  Creating database and tables (needs your Appwrite API key)"
echo "     Console -> your project -> Overview -> Integrations -> API keys -> Create"
echo "     Scopes: read + write for databases, tables, columns, indexes."
read -r -s -p "     Paste API key (hidden): " APPWRITE_API_KEY; echo
export APPWRITE_ENDPOINT="$ENDPOINT" APPWRITE_PROJECT_ID="$PROJECT_ID" APPWRITE_API_KEY
cd "$BACK"
npm install --no-audit --no-fund
# newer node-appwrite no longer exports IndexType: run a patched COPY (original setup.mjs untouched)
python3 - <<'PY'
s = open('setup.mjs').read()
old = "import { Client, TablesDB, Permission, Role, IndexType } from 'node-appwrite';"
new = "import * as sdk from 'node-appwrite';\nconst { Client, TablesDB, Permission, Role } = sdk;\nconst IndexType = sdk.IndexType ?? sdk.TablesDBIndexType;"
open('setup.fixed.mjs', 'w').write(s.replace(old, new, 1))
PY
node setup.fixed.mjs
unset APPWRITE_API_KEY

echo "3/4  Deploying functions"
sed -i "s/<PROJECT_ID>/$PROJECT_ID/" appwrite.json
command -v appwrite >/dev/null || npm install -g appwrite-cli
echo "     If asked, log in to Appwrite in the browser/terminal."
appwrite login
npm run deploy

echo "4/4  Installing the frontend"
cd "$WEB" && npm install --no-audit --no-fund

echo
echo "Done. Start the app with:  cd $WEB && npm run dev"
echo "Reminder: in the Appwrite console enable Anonymous + Email auth, add a Web platform for localhost,"
echo "and check cascade's three event triggers under Functions -> cascade -> Settings -> Events."
