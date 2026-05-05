# Build Stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage
FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
# Note: server.js will be built into dist during npm run build
COPY --from=builder /app/dist/server.js ./server.js

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
