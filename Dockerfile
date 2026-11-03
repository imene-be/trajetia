# ⚠️ Non testé : le démon Docker n'était pas démarré lors de la préparation.
FROM node:24-slim AS construction
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production DB_PATH=/data/trajetia.db
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=construction /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3001
USER node
CMD ["node", "server/index.js"]
