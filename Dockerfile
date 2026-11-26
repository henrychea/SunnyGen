FROM node:24-slim AS build

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/cli/package.json apps/cli/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

FROM node:24-slim AS runtime

ENV NODE_ENV=production \
    PORT=8977 \
    HOST=0.0.0.0 \
    SUNNYGEN_DATA_DIR=/data

ARG UID=1000
ARG GID=1000

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates ffmpeg; \
    rm -rf /var/lib/apt/lists/*; \
    userdel -r node >/dev/null 2>&1 || true; \
    groupdel node >/dev/null 2>&1 || true; \
    groupadd --gid "${GID}" sunnygen; \
    useradd --uid "${UID}" --gid sunnygen --home-dir /app --no-create-home --shell /usr/sbin/nologin sunnygen

WORKDIR /app

COPY --chown=${UID}:${GID} --from=build /app/apps/web/.output /app

RUN mkdir -p /data && chown "${UID}:${GID}" /data

USER sunnygen

EXPOSE 8977

CMD ["node", "server/index.mjs"]
