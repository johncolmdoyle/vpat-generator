# Playwright base image ships Chromium + matching system deps. Build context = repo root.
# IMPORTANT: keep this tag in lockstep with the exact `playwright` version pinned in
# apps/worker/package.json — a mismatch means the image lacks the browser build the
# npm package looks for.
FROM mcr.microsoft.com/playwright:v1.61.0-jammy
# Browsers are already in the image; don't re-download during npm ci.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY . .

CMD ["npm", "run", "start", "--workspace", "@vpat/worker"]
