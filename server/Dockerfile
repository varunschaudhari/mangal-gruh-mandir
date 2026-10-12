# Built from the repo root (docker-compose.yml: context ".") so /shared is included.
# Layout inside the image mirrors the repo: /app/server (WORKDIR) and /app/shared.
FROM node:20-alpine AS base
WORKDIR /app/server
COPY server/package*.json ./

# Development stage
FROM base AS development
RUN npm install
COPY shared /app/shared
COPY server .
CMD ["npm", "run", "dev"]

# Production stage
FROM base AS production
RUN npm ci --omit=dev
COPY shared /app/shared
COPY server .
CMD ["node", "src/index.js"]
