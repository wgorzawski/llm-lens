# LLM Lens - one image for both the API and the web app.
#   docker compose up -d        (see docker-compose.yml)
# or
#   docker run -p 3001:3001 -v llmlens:/data -e JWT_SECRET=... llm-lens api
#   docker run -p 3000:3000 -e NUXT_PUBLIC_API_BASE=http://localhost:3001/api llm-lens web

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV HUSKY=0 CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/types/package.json packages/types/
COPY packages/parsers/package.json packages/parsers/
COPY packages/instrument/package.json packages/instrument/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@llm-lens/api..." --filter "@llm-lens/web..." --filter "@llm-lens/instrument"
COPY packages packages
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter @llm-lens/types build \
 && pnpm --filter @llm-lens/parsers build \
 && pnpm --filter @llm-lens/api build \
 && NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @llm-lens/web build

# Production dependencies of the API only (the Nuxt output bundles its own)
FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV HUSKY=0 CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/
COPY packages/parsers/package.json packages/parsers/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter "@llm-lens/api..."

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    DATABASE_URL=file:/data/llm-lens.db \
    UPLOADS_DIR=/data/uploads \
    BACKUP_DIR=/data/backups \
    PORT=3001
COPY --from=deps /app ./
COPY --from=build /app/packages/types/dist packages/types/dist
COPY --from=build /app/packages/parsers/dist packages/parsers/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/.output apps/web/.output
COPY docker-entrypoint.sh /usr/local/bin/llm-lens
RUN chmod +x /usr/local/bin/llm-lens && mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 3000 3001
ENTRYPOINT ["llm-lens"]
CMD ["api"]
