# Noblenest — productie-image (meertraps-build)

# ---- Build -----------------------------------------------------------------
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ---- Runtime ---------------------------------------------------------------
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/build ./build
COPY --from=build /app/public ./public

# Niet als root draaien
RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["npm", "run", "docker-start"]
