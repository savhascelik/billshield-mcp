FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY lib ./lib
COPY src ./src
COPY tests ./tests
COPY README.md ./

ENV NODE_ENV=production \
    PORT=4040 \
    HOST=0.0.0.0

EXPOSE 4040

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4040) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.mjs"]
