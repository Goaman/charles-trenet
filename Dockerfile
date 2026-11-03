# charles-trenet.net — read-only archive (Bun + SQLite)
FROM oven/bun:1.3-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json tsconfig.json ./
COPY src ./src
COPY public ./public
COPY db ./db
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/sante || exit 1
CMD ["bun", "src/server.ts"]
