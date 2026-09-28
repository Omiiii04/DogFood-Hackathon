# Stage 1: Dependencies
FROM node:20-alpine AS dependencies
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production --prefer-offline || npm install --production

# Stage 2: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Ensure upload directory exists and has correct ownership for the non-root node user
RUN mkdir -p /app/uploads/thumbnails && chown -R node:node /app

# Copy production node_modules from dependencies stage
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules

# Copy application source files
COPY --chown=node:node . .

# Run under non-root node user
USER node

EXPOSE 5000

CMD ["node", "src/index.js"]
