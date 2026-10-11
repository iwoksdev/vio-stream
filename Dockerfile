# Node 24 LTS. Native SQLite is built in the build stage if a prebuild is unavailable.
FROM node:24-bookworm-slim AS compile
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . ./
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data DOWNLOAD_DIR=/downloads
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && mkdir /data /downloads && chown node:node /data /downloads
COPY --from=compile --chown=node:node /app/node_modules ./node_modules
COPY --from=compile --chown=node:node /app/dist ./dist
COPY --from=compile --chown=node:node /app/public/movie-seed.json ./public/movie-seed.json
COPY --from=compile --chown=node:node /app/server ./server
COPY --from=compile --chown=node:node /app/scripts/manage-user.mjs ./scripts/manage-user.mjs
COPY --from=compile --chown=node:node /app/server.mjs /app/api-lib.mjs /app/package.json /app/streams.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]
