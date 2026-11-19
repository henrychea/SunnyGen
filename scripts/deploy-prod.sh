#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="${SUNNYGEN_PROD_REPO:-$(cd "$SCRIPT_DIR/.." && pwd)}"
COMPOSE_PROJECT="${SUNNYGEN_COMPOSE_PROJECT:-sunnygen-prod}"
LOCK_FILE="${SUNNYGEN_DEPLOY_LOCK:-${XDG_RUNTIME_DIR:-/tmp}/sunnygen-deploy.lock}"

exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

cd "$REPO_DIR"

git fetch --quiet origin main
target="$(git rev-parse origin/main)"

if ! git cat-file -e "${target}:Dockerfile" 2>/dev/null; then
  echo "main has no Dockerfile yet"
  exit 0
fi

current="$(git rev-parse HEAD)"

if [ "$current" = "$target" ]; then
  exit 0
fi

git checkout -f --quiet --detach "$target"

if ! docker compose -p "$COMPOSE_PROJECT" up -d --build; then
  git checkout -f --quiet --detach "$current" || true
  echo "sunnygen-prod deploy failed; container left at ${current}" >&2
  exit 1
fi

docker image prune -f >/dev/null
echo "sunnygen-prod deployed ${target}"
