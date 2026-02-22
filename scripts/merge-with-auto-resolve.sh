#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash scripts/merge-with-auto-resolve.sh <target-branch> [ours|theirs]

Example:
  git switch codex/fix-code-issues-and-reverse-broken-merges-v0e0um
  git fetch origin
  bash scripts/merge-with-auto-resolve.sh origin/feature/wall-street-v2 ours
  git push origin HEAD
USAGE
}

TARGET="${1:-}"
STRATEGY="${2:-ours}"

if [[ -z "$TARGET" || "$TARGET" == "-h" || "$TARGET" == "--help" ]]; then
  usage
  exit 1
fi

if [[ "$STRATEGY" != "ours" && "$STRATEGY" != "theirs" ]]; then
  echo "[error] strategy must be ours|theirs" >&2
  exit 2
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[error] Not inside a git repository" >&2
  exit 3
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "[error] Working tree is not clean. Commit/stash first." >&2
  exit 4
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "[info] merging '$TARGET' into '$CURRENT_BRANCH' with strategy=$STRATEGY"

set +e
git merge --no-ff "$TARGET"
MERGE_RC=$?
set -e

if [[ "$MERGE_RC" -eq 0 ]]; then
  echo "[ok] merge completed without conflicts"
  npm run check
  exit 0
fi

if [[ "$MERGE_RC" -ne 1 ]]; then
  echo "[error] merge failed unexpectedly (rc=$MERGE_RC)" >&2
  exit "$MERGE_RC"
fi

HOTSPOTS=(
  "index.html"
  "app.js"
  "top-streams-fallback.js"
  "src/app.js"
  "src/top-streams-fallback.js"
  "scripts/verify-runtime-integrity.js"
)

for f in "${HOTSPOTS[@]}"; do
  if git ls-files -u -- "$f" | grep -q .; then
    git checkout "--$STRATEGY" -- "$f"
    git add "$f"
    echo "[ok] resolved hotspot: $f"
  fi
done

while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  git checkout "--$STRATEGY" -- "$f"
  git add "$f"
  echo "[ok] resolved remaining: $f"
done < <(git diff --name-only --diff-filter=U)

if git ls-files -u | grep -q .; then
  echo "[error] unresolved files remain after auto-resolution" >&2
  git status --short
  exit 5
fi

npm run check

git commit --no-edit

echo "[done] merge conflict resolved automatically and committed"
