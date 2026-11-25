# syntax=docker/dockerfile:1.7

# The default runtime remains the web image. Set RUNTIME_TARGET=api when using
# the runtime alias for the API service.
ARG RUNTIME_TARGET=web

FROM node:26-alpine AS build

ARG VITE_SENTRY_RELEASE=
ARG SENTRY_ORG=
ARG SENTRY_PROJECT=
ARG SENTRY_URL=
ENV VITE_SENTRY_RELEASE=${VITE_SENTRY_RELEASE}
ENV SENTRY_ORG=${SENTRY_ORG}
ENV SENTRY_PROJECT=${SENTRY_PROJECT}
ENV SENTRY_URL=${SENTRY_URL}

WORKDIR /workspace

RUN npm install --global npm@12.0.1

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --audit=false --no-update-notifier

COPY . .

FROM build AS shared-build

RUN npm run build --workspace=@paralleax/shared

FROM shared-build AS api-build

RUN npm run build --workspace=@paralleax/api

FROM shared-build AS web-build

RUN --mount=type=secret,id=sentry_auth_token,required=false \
  case "$VITE_SENTRY_RELEASE" in *[!a-zA-Z0-9._/+@-]*|phx_*|sntrys_*|sntryu_*) exit 1 ;; esac \
  && [ "${#VITE_SENTRY_RELEASE}" -le 200 ] \
  && if [ -s /run/secrets/sentry_auth_token ]; then \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)" npm run build --workspace=@paralleax/web; \
  else \
    npm run build --workspace=@paralleax/web; \
  fi \
  && printf "%s" "$VITE_SENTRY_RELEASE" > /workspace/sentry-image-release.txt

FROM node:26-alpine AS api

ARG SENTRY_RELEASE=
ENV NODE_ENV=production
ENV PORT=3000
ENV SENTRY_RELEASE=${SENTRY_RELEASE}
WORKDIR /app

RUN apk add --no-cache dumb-init \
  && npm install --global npm@12.0.1

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev --audit=false --no-update-notifier \
  && npm cache clean --force

COPY --from=api-build /workspace/apps/api/dist apps/api/dist

RUN mkdir -p /app/storage/imports \
  && chown -R node:node /app/storage

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+'/api/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/main.js"]

FROM nginx:alpine AS web


COPY deploy/nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY --from=web-build /workspace/sentry-image-release.txt /etc/nginx/sentry-image-release.txt
COPY deploy/runtime-config.jq /etc/nginx/runtime-config.jq
COPY deploy/sentry-csp.envsh /docker-entrypoint.d/15-sentry-csp.envsh
COPY --from=web-build /workspace/apps/web/dist /usr/share/nginx/html

ENV API_HOST=api
ENV API_PORT=3000
ENV PORT=8080

ENV NGINX_ENVSUBST_OUTPUT_DIR=/tmp/nginx
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

RUN apk add --no-cache jq \
  && chmod +x /docker-entrypoint.d/15-sentry-csp.envsh \
  && mkdir -p /tmp/nginx && chown nginx:nginx /tmp/nginx


USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:${PORT}/healthz || exit 1

CMD ["nginx", "-c", "/tmp/nginx/nginx.conf", "-g", "daemon off;"]

FROM ${RUNTIME_TARGET} AS runtime
