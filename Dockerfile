# Build stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vitest.config.ts index.html ./
COPY src ./src
RUN npx vite build

# Serve stage — unprivileged nginx (uid 101), loopback-safe, no writable root needed
FROM nginxinc/nginx-unprivileged:stable-alpine
ARG FARSPACE_REVISION=unknown
ARG FARSPACE_VERSION=0.0.0
LABEL org.opencontainers.image.title="FarSpace" \
      org.opencontainers.image.description="Pixel-art space sim: fly, trade, mine, fight, walk your ship, orbit planets, chart the real stars." \
      org.opencontainers.image.source="https://github.com/AES256Afro/FarSpace" \
      org.opencontainers.image.url="https://fsociety.work" \
      org.opencontainers.image.version="${FARSPACE_VERSION}" \
      org.opencontainers.image.revision="${FARSPACE_REVISION}"
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
