#!/usr/bin/env bash
set -euo pipefail

# Resolve an in-progress merge conflict safely for this frontend runtime.
# Default strategy keeps current branch changes for known hotspots.

STRATEGY="${1:-ours}"
if [[ "$STRATEGY" != "ours" && "$STRATEGY" != "theirs" ]]; then
  echo "[error] strategy must be ours|theirs" >&2
  exit 1
fi

if ! git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  echo "[error] No merge in progress. Run this command only after a merge reports conflicts." >&2
  exit 2
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
    echo "[ok] resolved hotspot $f using $STRATEGY"
  fi
done

# Resolve any remaining unmerged paths with the same strategy.
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  git checkout "--$STRATEGY" -- "$f"
  git add "$f"
  echo "[ok] resolved remaining $f using $STRATEGY"
done < <(git diff --name-only --diff-filter=U)

if git ls-files -u | grep -q .; then
  echo "[error] unresolved files remain" >&2
  git status --short
  exit 3
fi

npm run check

git commit --no-edit

echo "[done] conflict resolved, checks passed, merge commit created"
