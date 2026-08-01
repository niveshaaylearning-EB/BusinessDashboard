# Frontend — Vite/React build, served by nginx
# No .env is baked into this image. VITE_API_URL is optional (api.js
# auto-detects the backend from the browser's hostname on port 8000) —
# only set it at build time below if you need to override that.

# ── Build stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Serve stage ─────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
