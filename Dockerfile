# Builds the members' app, then runs the backend, which serves it.
FROM node:22-alpine AS web
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY --from=web /app/frontend/dist /app/frontend/dist
# The member database lives here; the app runs as the unprivileged node user
RUN mkdir -p data && chown node:node data
ENV PORT=4100
EXPOSE 4100
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
