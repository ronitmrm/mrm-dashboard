FROM node:22-bookworm-slim

WORKDIR /app
RUN corepack enable
COPY . .

# The worker executes TypeScript through tsx, which is a dev dependency.
RUN pnpm install --frozen-lockfile --prod=false --filter @workspace/runtime... \
    && pnpm --filter @workspace/runtime... build

ENV NODE_ENV=production
USER node
CMD ["node", "--import", "./packages/runtime/node_modules/tsx/dist/loader.mjs", "packages/runtime/src/commands/run-worker.ts"]
