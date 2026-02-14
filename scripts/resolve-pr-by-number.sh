#!/usr/bin/env bash
set -euo pipefail

# Resolve merge conflicts for a specific GitHub PR by number.
#
# Usage:
#   scripts/resolve-pr-by-number.sh --pr 20
#   scripts/resolve-pr-by-number.sh --pr 20 --strategy ours
#   scripts/resolve-pr-by-number.sh --pr 20 --strategy theirs --no-push

PR_NUMBER=""
STRATEGY="ours"
REMOTE="origin"
NO_PUSH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr)
      PR_NUMBER="${2:-}"; shift 2 ;;
    --strategy)
      STRATEGY="${2:-ours}"; shift 2 ;;
    --remote)
      REMOTE="${2:-origin}"; shift 2 ;;
    --no-push)
      NO_PUSH=1; shift ;;
    *)
      echo "[error] Unknown argument: $1" >&2
      exit 1 ;;
  esac
done

if [[ -z "$PR_NUMBER" ]]; then
  echo "[error] --pr is required" >&2
  exit 1
fi
if [[ "$STRATEGY" != "ours" && "$STRATEGY" != "theirs" ]]; then
  echo "[error] --strategy must be ours|theirs" >&2
  exit 1
fi
if ! git remote | grep -qx "$REMOTE"; then
  echo "[error] Remote '$REMOTE' not configured." >&2
  exit 1
fi

REMOTE_URL="$(git remote get-url "$REMOTE")"

read -r OWNER REPO <<EOF2
$(python3 - <<'PY' "$REMOTE_URL"
import re, sys
u=sys.argv[1].strip()
owner=repo=''
# https://github.com/owner/repo(.git)
m=re.search(r'github\.com[:/]+([^/]+)/([^/]+?)(?:\.git)?$', u)
if m:
    owner, repo = m.group(1), m.group(2)
print(owner, repo)
PY
)
EOF2

if [[ -z "$OWNER" || -z "$REPO" ]]; then
  echo "[error] Could not parse GitHub owner/repo from remote: $REMOTE_URL" >&2
  exit 2
fi

echo "[info] repo=${OWNER}/${REPO} pr=${PR_NUMBER} strategy=${STRATEGY}"

PR_JSON="$(curl -fsSL "https://api.github.com/repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}")"

read -r HEAD_REF BASE_REF <<EOF2
$(python3 - <<'PY' "$PR_JSON"
import json, sys
j=json.loads(sys.argv[1])
print(j.get('head',{}).get('ref',''), j.get('base',{}).get('ref',''))
PY
)
EOF2

if [[ -z "$HEAD_REF" || -z "$BASE_REF" ]]; then
  echo "[error] Could not get head/base refs from PR #${PR_NUMBER}" >&2
  exit 3
fi

echo "[info] head=${HEAD_REF} base=${BASE_REF}"

git fetch "$REMOTE" --prune

if git show-ref --verify --quiet "refs/heads/${HEAD_REF}"; then
  git switch "$HEAD_REF"
elif git show-ref --verify --quiet "refs/remotes/${REMOTE}/${HEAD_REF}"; then
  git switch -C "$HEAD_REF" --track "${REMOTE}/${HEAD_REF}"
else
  echo "[error] Head ref not found: ${HEAD_REF}" >&2
  exit 4
fi

if ! git show-ref --verify --quiet "refs/remotes/${REMOTE}/${BASE_REF}"; then
  echo "[error] Base ref not found on remote: ${BASE_REF}" >&2
  exit 5
fi

# Deterministic merge state
git reset --hard "${REMOTE}/${HEAD_REF}"

set +e
git merge --no-ff "${REMOTE}/${BASE_REF}"
MERGE_CODE=$?
set -e

if [[ "$MERGE_CODE" -eq 0 ]]; then
  echo "[ok] No conflicts detected for PR #${PR_NUMBER}."
  exit 0
fi
if [[ "$MERGE_CODE" -ne 1 ]]; then
  echo "[error] Merge failed unexpectedly (exit $MERGE_CODE)." >&2
  exit "$MERGE_CODE"
fi

HOTSPOTS=(
  "game-engine.js"
  "styles/main.css"
  "scripts/resolve-pr-conflicts.sh"
)

for f in "${HOTSPOTS[@]}"; do
  if git diff --name-only --diff-filter=U | grep -qx "$f"; then
    git checkout --"$STRATEGY" -- "$f"
    git add "$f"
    echo "[info] resolved hotspot: $f"
  fi
done

# Resolve any remaining conflict using chosen strategy
if git ls-files -u | grep -q .; then
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    git checkout --"$STRATEGY" -- "$f"
    git add "$f"
    echo "[info] resolved remaining: $f"
  done < <(git diff --name-only --diff-filter=U)
fi

if git ls-files -u | grep -q .; then
  echo "[error] Still unmerged paths after resolution." >&2
  git status --short
  exit 6
fi

if grep -nE '^(<<<<<<<|=======|>>>>>>>)' game-engine.js styles/main.css scripts/resolve-pr-conflicts.sh >/dev/null 2>&1; then
  echo "[error] Conflict markers still present in hotspot files." >&2
  exit 7
fi

node --check game-engine.js >/dev/null

if git diff --cached --quiet; then
  echo "[info] Nothing staged after resolution."
  exit 0
fi

git commit -m "Resolve PR #${PR_NUMBER} conflicts using ${STRATEGY} strategy"

if [[ "$NO_PUSH" -eq 0 ]]; then
  git push "$REMOTE" "$HEAD_REF"
  echo "[ok] Conflict resolution pushed to ${REMOTE}/${HEAD_REF}"
else
  echo "[ok] Conflict resolution committed locally (push skipped)."
fi
