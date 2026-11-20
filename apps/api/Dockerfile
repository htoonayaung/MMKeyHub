FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable pnpm && apk add --no-cache openssl

FROM base AS deps
COPY pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --filter @mmkeyhub/api...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY prisma ./prisma
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN pnpm --filter @mmkeyhub/api prisma:generate
RUN pnpm --filter @mmkeyhub/api build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/prisma ./prisma
COPY apps/api/docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh \
  && mkdir -p /app/uploads/receipts /app/uploads/products \
  && chown -R node:node /app /app/uploads

USER node
EXPOSE 4000
CMD ["/app/docker-entrypoint.sh"]
