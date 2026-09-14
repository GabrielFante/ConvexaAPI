FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV HUSKY=0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM build AS migrate
USER node
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM build AS runtime-deps
RUN npm prune --omit=dev --omit=peer --ignore-scripts

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=runtime-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts /app/package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
