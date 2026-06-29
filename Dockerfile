FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --prefer-offline

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
# Ensure public dir exists even if empty (prevents COPY failure in runner)
RUN mkdir -p /app/public

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs
RUN mkdir -p /data/uploads /backup/docvault && \
    chown -R nextjs:nodejs /data /backup
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

ENV NODE_ENV=production \
    PORT=9091 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/docvault.db \
    UPLOAD_DIR=/data/uploads \
    BACKUP_DIR=/backup/docvault \
    NEXT_TELEMETRY_DISABLED=1

EXPOSE 9091

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:9091/api/health || exit 1

USER nextjs
CMD ["node", "server.js"]
