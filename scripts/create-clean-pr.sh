#!/usr/bin/env bash
set -euo pipefail

# Creates a clean replacement PR branch from an existing PR branch, auto-resolving
# merge conflicts with a deterministic strategy and running pre-push guards.
#
# Example:
#   scripts/create-clean-pr.sh --target codex/fix-x --base main --strategy ours
#
# Optional:
#   --title "..." --body "..."  (if gh exists, creates PR automatically)

TARGET_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BASE_BRANCH="main"
REMOTE="origin"
STRATEGY="ours"
TITLE=""
BODY=""
NO_PR=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET_BRANCH="${2:-}"; shift 2 ;;
    --base) BASE_BRANCH="${2:-main}"; shift 2 ;;
    --remote) REMOTE="${2:-origin}"; shift 2 ;;
    --strategy) STRATEGY="${2:-ours}"; shift 2 ;;
    --title) TITLE="${2:-}"; shift 2 ;;
    --body) BODY="${2:-}"; shift 2 ;;
    --no-pr) NO_PR=1; shift ;;
    *) echo "[error] Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[error] Not inside a git repository" >&2
  exit 1
fi

if ! git remote | grep -qx "$REMOTE"; then
  echo "[error] Remote '$REMOTE' is not configured" >&2
  exit 2
fi

SAFE_TARGET="$(echo "$TARGET_BRANCH" | tr '/#' '--')"
NEW_BRANCH="clean-${SAFE_TARGET}-$(date +%Y%m%d-%H%M%S)"

echo "[info] target=$TARGET_BRANCH base=$BASE_BRANCH remote=$REMOTE strategy=$STRATEGY"
echo "[info] creating replacement branch: $NEW_BRANCH"

git fetch "$REMOTE" --prune

if git show-ref --verify --quiet "refs/remotes/${REMOTE}/${TARGET_BRANCH}"; then
  git switch -C "$NEW_BRANCH" --track "${REMOTE}/${TARGET_BRANCH}"
else
  git switch -C "$NEW_BRANCH" "$TARGET_BRANCH"
fi

bash scripts/resolve-pr-conflicts-v2.sh \
  --target "$NEW_BRANCH" \
  --base "$BASE_BRANCH" \
  --remote "$REMOTE" \
  --strategy "$STRATEGY" \
  --no-push

npm run prepush:guard

git push -u "$REMOTE" "$NEW_BRANCH"

if [[ "$NO_PR" -eq 1 ]]; then
  echo "[ok] Branch pushed: $NEW_BRANCH (PR creation skipped by --no-pr)"
  exit 0
fi

if command -v gh >/dev/null 2>&1; then
  PR_TITLE="${TITLE:-Replace blocked PR: clean auto-resolved branch}"
  PR_BODY="${BODY:-Esta PR reemplaza la anterior para evitar resolución manual de conflictos.\n\nSe creó una rama limpia, se resolvieron conflictos automáticamente con estrategia ${STRATEGY}, se ejecutó prepush:guard y luego se hizo push.}"
  gh pr create --base "$BASE_BRANCH" --head "$NEW_BRANCH" --title "$PR_TITLE" --body "$PR_BODY"
  echo "[ok] PR created from $NEW_BRANCH"
else
  echo "[warn] gh not found; open PR manually from branch $NEW_BRANCH"
fi
