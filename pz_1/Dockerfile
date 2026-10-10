FROM node:22-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --dangerously-allow-all-builds

COPY core ./core
COPY src ./src
COPY tsconfig.json ./

CMD ["pnpm", "start"]
