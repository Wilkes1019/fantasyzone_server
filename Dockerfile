FROM node:20-alpine

WORKDIR /app

# Install deps (including devDeps so we can use tsx at runtime)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Run the possession poller with tsx
ENV NODE_ENV=production
CMD ["npx", "tsx", "scripts/possession-poller.ts"]

