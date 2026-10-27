#!/bin/sh
# llm-lens api | web - starts one part of LLM Lens (see Dockerfile / docker-compose.yml)
set -e
case "$1" in
  api)
    cd /app/apps/api
    exec node dist/index.js
    ;;
  web)
    # Nuxt listens on PORT / NITRO_PORT; the web defaults to 3000 even though the image sets PORT=3001 for the API
    export PORT="${WEB_PORT:-3000}"
    exec node /app/apps/web/.output/server/index.mjs
    ;;
  *)
    exec "$@"
    ;;
esac
