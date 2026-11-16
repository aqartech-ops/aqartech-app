#!/usr/bin/env bash
# Every start of the Codespace: API, demo data (first time only), web app.
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# the web app calls the API through its Codespaces address
if [ -n "$CODESPACE_NAME" ]; then
  API="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  printf 'EXPO_PUBLIC_API_URL=%s\nEXPO_PUBLIC_API_URL_FORCE=1\n' "$API" > "$ROOT/.env"
fi

cd "$ROOT/backend"
nohup npm run start:dev > /tmp/aqartech-api.log 2>&1 &
echo "starting the API…"
for i in $(seq 1 120); do curl -sf http://localhost:3000/plans > /dev/null && break; sleep 2; done

# the browser calls the API from the app's address: the API port must be public
if [ -n "$CODESPACE_NAME" ]; then
  gh codespace ports visibility 3000:public -c "$CODESPACE_NAME" > /dev/null 2>&1 \
    || echo "⚠ Make port 3000 public: PORTS tab → right-click 3000 → Port Visibility → Public"
fi

# demo data once (2 buildings, owners, 6 tenants …)
if [ ! -f .demo-done ]; then
  npm run demo:reset -- --yes && touch .demo-done
fi

cd "$ROOT"
CI=1 nohup npx expo start --web --port 8081 > /tmp/aqartech-web.log 2>&1 &
echo "✔ AqarTech is starting — open the PORTS tab → 8081 (sign in: demo@aqartech.test / Demo@12345)"
