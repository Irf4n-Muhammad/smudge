# Forma production image: one container, one public port, two hostnames (app + post runtime).
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 FORMA_MODE=production FORMA_DATA_DIR=/data PORT=8080
COPY --from=build /app /app
# SQLite file, MCP token and server lock live here. Mount a persistent volume.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
CMD ["node", "scripts/start.mjs"]
