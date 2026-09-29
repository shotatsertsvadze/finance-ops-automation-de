# The demo in one image: the API serves the built client (ADR-076).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY scripts ./scripts
COPY db ./db
COPY fixtures ./fixtures
COPY client/public ./client/public
ENV API_HOST=0.0.0.0 API_PORT=4400 STORAGE_DIR=/app/storage
# Not root. The start writes originals and the demo statement, nothing else.
RUN mkdir -p storage && chown -R node:node storage client/public/demo dist/demo
EXPOSE 4400
USER node
# A fresh demo on every start: rebuild the schema, seed, generate a month of
# invoices, publish the statement that answers them, then serve.
CMD ["sh", "-c", "node scripts/reset.js && node scripts/demo-data.js && cp client/public/demo/statement_2026-09.json dist/demo/ && exec node server/index.js"]
