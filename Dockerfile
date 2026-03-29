FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
RUN npm install --production
COPY server/ ./
COPY --from=client-build /app/client/dist ./public
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "src/index.js"]
