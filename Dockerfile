# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS build

WORKDIR /workspace

RUN npm install --global npm@12.0.1

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --audit=false --no-update-notifier

COPY . .

RUN npm run build

FROM node:24-alpine AS api

ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

RUN apk add --no-cache dumb-init \
  && npm install --global npm@12.0.1

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev --audit=false --no-update-notifier \
  && npm cache clean --force

COPY --from=build /workspace/apps/api/dist apps/api/dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/main.js"]

FROM nginx:alpine AS web

COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["nginx", "-g", "daemon off;"]
