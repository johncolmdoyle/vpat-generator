# Build context is the repo root (see docker-compose.yml).
FROM node:20-slim
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app

# Install deps with manifests first for layer caching.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN npm ci

# Source (node_modules excluded via .dockerignore).
COPY . .

EXPOSE 8080
CMD ["npm", "run", "start", "--workspace", "@vpat/api"]
