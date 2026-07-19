FROM node:25-bookworm-slim AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:25-bookworm-slim AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:25-bookworm-slim AS build-env
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_RELEASE
ARG SENTRY_DSN
ARG TIER
ARG VITE_CROWD_REPORT_TURNSTILE_SITE_KEY
ARG VITE_PUBLIC_POSTHOG_KEY
ARG VITE_PUBLIC_POSTHOG_HOST
ARG VITE_ROOT_URL
ENV SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT \
    GIT_SHA=$SENTRY_RELEASE \
    SENTRY_DSN=$SENTRY_DSN \
    TIER=$TIER \
    VITE_CROWD_REPORT_TURNSTILE_SITE_KEY=$VITE_CROWD_REPORT_TURNSTILE_SITE_KEY \
    VITE_PUBLIC_POSTHOG_KEY=$VITE_PUBLIC_POSTHOG_KEY \
    VITE_PUBLIC_POSTHOG_HOST=$VITE_PUBLIC_POSTHOG_HOST \
    VITE_ROOT_URL=$VITE_ROOT_URL

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
# Build application
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
    SENTRY_AUTH_TOKEN=$(cat /run/secrets/SENTRY_AUTH_TOKEN) NODE_OPTIONS="--max-old-space-size=4096" npm run build

FROM node:25-bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY ./package.json package-lock.json instrument.server.mjs /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/dist /app/dist
WORKDIR /app

CMD ["npm", "run", "start"]
