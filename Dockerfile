FROM node:24.4.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.server.json tsconfig.web.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM node:24.4.1-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY scripts/migrate-postgres.mjs ./scripts/migrate-postgres.mjs
USER node
EXPOSE 3001
CMD ["node", "dist/server/main.js"]
