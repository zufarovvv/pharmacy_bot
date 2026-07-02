#!/usr/bin/env bash
# Деплой фронта на Cloudflare Pages (проект: datfo → https://datfo.pages.dev).
#
# Фронт ходит на СВОЙ ЖЕ домен (/api/*), а вшитый в бандл _worker.js проксирует
# эти запросы на бек. Поэтому публичный адрес API постоянный (datfo.pages.dev),
# а при смене адреса бека (туннель умер / переехали на VPS) достаточно
# перезапустить этот скрипт с новым URL — фронт, кнопки бота и CORS не меняются.
#
# Использование:
#   ./deploy_frontend.sh https://<адрес-бека>
# Требует: npx + авторизация wrangler (npx wrangler whoami).
set -euo pipefail

BACKEND_URL="${1:?Укажи адрес бека: ./deploy_frontend.sh https://xxx.trycloudflare.com}"
BACKEND_URL="${BACKEND_URL%/}"
PROJECT="datfo"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)/webapp"
BUILD_DIR="$(mktemp -d)/pages_deploy"

mkdir -p "$BUILD_DIR"
cp -R "$SRC_DIR/" "$BUILD_DIR/"
rm -f "$BUILD_DIR/.DS_Store"

# Фронт работает same-origin: все fetch идут на текущий домен (Pages).
printf "window.DATFO_API_BASE = '';\n" > "$BUILD_DIR/config.js"

# Worker внутри Pages: /api/* → бек, остальное → статика.
cat > "$BUILD_DIR/_worker.js" <<EOF
const BACKEND_URL = '${BACKEND_URL}';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const backend = new URL(BACKEND_URL);
      url.protocol = backend.protocol;
      url.hostname = backend.hostname;
      url.port = backend.port || '';
      // Заголовки/метод/тело переносим как есть (initData, Authorization, JSON).
      return fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
};
EOF

echo "→ деплой $PROJECT (бек: $BACKEND_URL)"
npx --yes wrangler pages deploy "$BUILD_DIR" --project-name "$PROJECT" --branch main --commit-dirty=true
echo "✓ https://datfo.pages.dev  (API: https://datfo.pages.dev/api/health)"
