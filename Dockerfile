# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7

ARG NODE_VERSION=20.18.1

################################################################################
# Base stage with common dependencies
FROM node:${NODE_VERSION}-alpine AS base

# Install security updates and necessary packages
RUN apk update && apk upgrade && \
    apk add --no-cache \
    chromium \
    chromium-chromedriver \
    ca-certificates \
    tzdata \
    && rm -rf /var/cache/apk/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Set working directory
WORKDIR /usr/src/app

# Create non-root user for security
RUN addgroup -g 1001 -S saiki && \
    adduser -S saiki -u 1001

################################################################################
# Dependencies stage
FROM base AS deps

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --frozen-lockfile --ignore-scripts

################################################################################
# Build stage
FROM base AS build

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including dev)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --frozen-lockfile --ignore-scripts

# Copy source code
COPY . .

# Build the application
RUN npm run build

################################################################################
# Production stage
FROM base AS production

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV FRONTEND_PORT=3000
ENV API_PORT=3001
ENV API_URL=http://localhost:3001
ENV FRONTEND_URL=http://localhost:3000

# Switch to non-root user
USER saiki

# Copy package.json for package manager commands
COPY --chown=saiki:saiki package.json ./

# Copy configuration files
COPY --chown=saiki:saiki configuration ./configuration

# Copy production dependencies
COPY --from=deps --chown=saiki:saiki /usr/src/app/node_modules ./node_modules

# Copy built application
COPY --from=build --chown=saiki:saiki /usr/src/app/dist ./dist
COPY --from=build --chown=saiki:saiki /usr/src/app/public ./public

# Add healthcheck for API server
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); const options = { host: 'localhost', port: process.env.API_PORT || 3001, path: '/health' }; const req = http.request(options, (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.end();" || exit 1

# Expose both frontend and API ports
EXPOSE $FRONTEND_PORT $API_PORT

# Default to web mode for containerized deployments
ENTRYPOINT ["node", "dist/src/app/index.js"]
CMD ["--mode", "web", "--web-port", "3000"]
