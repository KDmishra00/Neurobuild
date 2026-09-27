# ─── Stage 1: Build the React client ───────────────────────────────────────
FROM node:22-alpine AS client-builder

WORKDIR /build/client

# Install dependencies first (leverages Docker layer caching)
COPY client/package*.json ./
RUN npm ci

# Build the app (this also runs tsc type-checking)
COPY client/ ./
RUN npm run build

# ─── Stage 2: Production runtime ────────────────────────────────────────────
FROM node:22-alpine

# Docker doesn't clear the NODE_ENV inherited from the builder base
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Install server dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy server source
COPY server.js ./
COPY middleware ./middleware
COPY models ./models
COPY routes ./routes
COPY services ./services

# Copy the compiled React client
COPY --from=client-builder /build/client/dist ./client/dist

# Run as a non-root user
USER node

EXPOSE 3000

CMD ["node", "server.js"]