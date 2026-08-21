#!/bin/bash
set -e

APPS=("api" "web")

echo ">>> Starting deploy for apps ${APPS[@]}"

# 1️⃣ Napraw PATH i wczytaj NVM
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Użyj wersji Node zadeklarowanej w .nvmrc - `nvm install` jest no-op i tylko
# przełącza, jeśli ta wersja już jest zainstalowana na serwerze (powinna być,
# bo to ta sama wersja co w fudini/xposter), więc to bezpieczniejsze niż
# poleganie na aliasie "default", który może być nieaktualny.
NODE_VERSION_WANTED=$(cat .nvmrc)
nvm install "$NODE_VERSION_WANTED"
nvm use "$NODE_VERSION_WANTED"

corepack enable
command -v pm2 >/dev/null 2>&1 || npm install -g pm2

# Długo działający proces PM2 ("God process"), który zarządza wszystkimi
# aplikacjami na tym serwerze (w tym fudini i xposter), zostaje przy wersji, z
# jaką był ostatnio odpalony - nowsza instalacja CLI powyżej tego nie zmienia.
# `pm2 update` bezpiecznie migruje daemon w miejscu, bez zabijania
# zarządzanych procesów, więc można to odpalać bezwarunkowo przy każdym
# deployu.
pm2 update

# 2️⃣ Sprawdzenie dostępności binarek
echo ">>> Node: $(node -v)"
echo ">>> pnpm: $(pnpm -v)"
echo ">>> pm2: $(pm2 -v || echo 'pm2 not installed')"

# Odpalamy wzmocnienie serwera Mikrus (https://wiki.mikr.us/amfetamina/)
echo '>>> Run Mikrus Amfetamina'
if command -v mikrus >/dev/null; then
    echo "⚡ Uruchamianie mikrus amfetamina"
    mikrus amfetamina
else
    echo "⚠️  mikrus nie znaleziony – pomijam"
fi

# .env pliki są tworzone przez workflow z GitHub Secrets (nie z ręcznie
# utrzymywanego pliku na serwerze jak w xposter/fudini) i rsync'owane PRZED
# tym deployem do stałej ścieżki poza katalogami apps/packages, żeby
# przetrwały `rm -rf apps packages` przy rozpakowywaniu nowego archiwum.
echo '>>> copy .env files'
cp "$HOME/.env.llm-lens-api" "apps/api/.env"
cp "$HOME/.env.llm-lens-web" "apps/web/.env"

echo '>>> install production dependencies'
# Ten sam wzorzec co w fudini/xposter: zamiana katalogu przez `mv` zamiast
# `rm -rf` w miejscu, bo to pojedynczy, natychmiastowy syscall - nie blokuje
# instalacji, nawet jeśli usuwanie starego katalogu w tle akurat się zawiesza
# na jakimś dziwnym stanie systemu plików.
rm -rf node_modules.stale.* 2>/dev/null &
if [ -d node_modules ]; then
  STALE_DIR="node_modules.stale.$$"
  mv node_modules "$STALE_DIR"
  rm -rf "$STALE_DIR" 2>/dev/null &
fi

CI=true pnpm install --frozen-lockfile --prefer-offline

# 3️⃣ Sprawdza, czy proces faktycznie wstał (PM2 online + odpowiada po HTTP),
# zamiast ufać samemu "pm2 restart", które zwraca sukces natychmiast po zleceniu restartu.
get_port() {
  case "$1" in
    api) echo 3032 ;;
    web) echo 3031 ;;
  esac
}

get_process_name() {
  case "$1" in
    api) echo "llm-lens-api-prod" ;;
    web) echo "llm-lens-prod" ;;
  esac
}

wait_for_health() {
  local process_name=$1
  local app=$2
  local port=$3
  local max_attempts=30 # 30x2s = 60s
  local pm2_status="unknown"

  echo ">>> Czekam aż $process_name wstanie..."

  for _ in $(seq 1 "$max_attempts"); do
    sleep 2

    pm2_status=$(pm2 jlist | node -e "
      const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
      const proc = data.find(p => p.name === process.argv[1]);
      console.log(proc ? proc.pm2_env.status : 'missing');
    " "$process_name")

    if [ "$pm2_status" != "online" ]; then
      continue
    fi

    local health_path="/"
    [ "$app" = "api" ] && health_path="/health"

    if curl -sf "http://localhost:$port$health_path" > /dev/null; then
      echo ">>> $process_name działa (PM2: online, HTTP $health_path: OK)"
      return 0
    fi
  done

  echo "❌ $process_name nie wstał poprawnie po $((max_attempts * 2))s (status PM2: $pm2_status)"
  echo "--- Ostatnie logi $process_name: ---"
  pm2 logs "$process_name" --lines 50 --nostream
  return 1
}

for APP in "${APPS[@]}"; do
  PROCESS_NAME=$(get_process_name "$APP")
  echo ">>> PM2 starting $PROCESS_NAME"

  if pm2 list | grep -q "$PROCESS_NAME"; then
    echo ">>> Reloading $PROCESS_NAME..."
    pm2 restart "$PROCESS_NAME" --update-env || echo "Nie udało się restart $PROCESS_NAME, uruchamiam nowy"
  else
    echo ">>> Starting new process $PROCESS_NAME..."
    pm2 start ecosystem.config.cjs
  fi

  wait_for_health "$PROCESS_NAME" "$APP" "$(get_port "$APP")" || exit 1
done

echo ">>> Deploy zakończony!"
pm2 save
