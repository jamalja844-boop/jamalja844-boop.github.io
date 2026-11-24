# --- deps
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx next build

# --- runtime (web + worker share this image)
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
# ffmpeg/ffprobe for media probing; Chromium runtime libs for the Remotion renderer
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates fonts-noto fonts-noto-color-emoji \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev \
      libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN groupadd -r app && useradd -r -g app -m app
COPY --from=build --chown=app:app /app ./
USER app
# download Remotion's headless Chromium at build time so renders start immediately
RUN npx remotion browser ensure || true
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
