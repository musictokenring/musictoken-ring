#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/resolve-pr-conflicts.sh [target_branch] [base_branch]
# Example:
#   scripts/resolve-pr-conflicts.sh codex/fix-contact-link-and-create-contact-form-uzk4jq main

TARGET_BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
BASE_BRANCH="${2:-main}"

echo "[info] target branch: ${TARGET_BRANCH}"
echo "[info] base branch:   ${BASE_BRANCH}"

if ! git remote | grep -qx 'origin'; then
  echo "[error] Missing 'origin' remote. Configure it first:" >&2
  echo "        git remote add origin <repo_url>" >&2
  exit 1
fi

git fetch origin --prune

# Switch to target branch from remote if needed.
if git show-ref --verify --quiet "refs/heads/${TARGET_BRANCH}"; then
  git switch "${TARGET_BRANCH}"
else
  git switch -C "${TARGET_BRANCH}" --track "origin/${TARGET_BRANCH}"
fi

# Clean local state so merge runs predictably.
git reset --hard "origin/${TARGET_BRANCH}"

# Recreate merge state exactly against base branch.
set +e
git merge --no-ff "origin/${BASE_BRANCH}"
MERGE_CODE=$?
set -e

if [ "$MERGE_CODE" -eq 0 ]; then
  echo "[info] No conflicts. Branch already mergeable with origin/${BASE_BRANCH}."
  exit 0
fi

echo "[info] Merge reported conflicts. Resolving known files with branch version (ours)."

# Keep PR branch implementation for known hotspots.
git checkout --ours game-engine.js styles/main.css || true
git add game-engine.js styles/main.css || true

# If markers survived for any reason, strip them keeping OUR side.
python3 - <<'PY'
from pathlib import Path

files = [Path('game-engine.js'), Path('styles/main.css')]

for p in files:
    if not p.exists():
        continue
    s = p.read_text(encoding='utf-8')
    if '<<<<<<< ' not in s:
        continue

    out = []
    i = 0
    lines = s.splitlines(keepends=True)
    n = len(lines)
    while i < n:
        if lines[i].startswith('<<<<<<< '):
            i += 1
            ours = []
            while i < n and not lines[i].startswith('======='):
                ours.append(lines[i]); i += 1
            if i < n and lines[i].startswith('======='):
                i += 1
            while i < n and not lines[i].startswith('>>>>>>> '):
                i += 1
            if i < n and lines[i].startswith('>>>>>>> '):
                i += 1
            out.extend(ours)
        else:
            out.append(lines[i]); i += 1

    p.write_text(''.join(out), encoding='utf-8')
    print(f'[info] cleaned markers in {p}')
PY

# If anything else still conflicts, force ours to unblock merge.
UNMERGED_COUNT=$(git ls-files -u | wc -l | tr -d ' ')
if [ "$UNMERGED_COUNT" != "0" ]; then
  echo "[warn] Still ${UNMERGED_COUNT} unmerged index entries. Applying --ours to remaining files."
  git diff --name-only --diff-filter=U | while read -r file; do
    git checkout --ours -- "$file"
    git add "$file"
  done
fi

if git ls-files -u | grep -q .; then
  echo "[error] Conflicts remain after automated resolution. Resolve manually." >&2
  git status --short
  exit 2
fi

if grep -nE '^(<<<<<<<|=======|>>>>>>>)' game-engine.js styles/main.css >/dev/null 2>&1; then
  echo "[error] Conflict markers still present in key files." >&2
  exit 3
fi

# Optional checks
node --check game-engine.js >/dev/null

# Finalize merge commit and push.
if ! git diff --cached --quiet; then
  git commit -m "Resolve conflicts with ${BASE_BRANCH} keeping PR branch battle/practice flow implementation"
  git push origin "${TARGET_BRANCH}"
  echo "[ok] Conflicts resolved, merge commit pushed to origin/${TARGET_BRANCH}."
else
  echo "[info] Nothing staged; likely already resolved and up to date."
fi
