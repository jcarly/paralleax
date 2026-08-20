# syntax=docker/dockerfile:1.7

# The default remains the web image. Platforms that build only the final stage,
# such as Railway, can set RUNTIME_TARGET=api for the API service.
ARG RUNTIME_TARGET=web

FROM node:24-alpine AS build

ARG VITE_FORMBRICKS_WORKSPACE_ID=
ARG VITE_FORMBRICKS_APP_URL=
ENV VITE_FORMBRICKS_WORKSPACE_ID=${VITE_FORMBRICKS_WORKSPACE_ID}
ENV VITE_FORMBRICKS_APP_URL=${VITE_FORMBRICKS_APP_URL}

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
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+'/api/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/main.js"]

FROM nginx:alpine AS web

ARG VITE_FORMBRICKS_WORKSPACE_ID=
ARG VITE_FORMBRICKS_APP_URL=

COPY deploy/nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

ENV API_HOST=api
ENV API_PORT=3000
ENV PORT=8080
ENV VITE_FORMBRICKS_WORKSPACE_ID=${VITE_FORMBRICKS_WORKSPACE_ID}
ENV VITE_FORMBRICKS_APP_URL=${VITE_FORMBRICKS_APP_URL}

ENV NGINX_ENVSUBST_OUTPUT_DIR=/tmp/nginx
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

RUN mkdir -p /tmp/nginx && chown nginx:nginx /tmp/nginx


USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:${PORT}/healthz || exit 1

CMD ["nginx", "-c", "/tmp/nginx/nginx.conf", "-g", "daemon off;"]

FROM ${RUNTIME_TARGET} AS runtime
