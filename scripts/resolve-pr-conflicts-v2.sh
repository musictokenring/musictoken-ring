#!/usr/bin/env bash
set -euo pipefail

# Resolve PR merge conflicts in a deterministic way.
#
# Usage:
#   scripts/resolve-pr-conflicts-v2.sh
#   scripts/resolve-pr-conflicts-v2.sh --target codex/my-branch --base main
#   scripts/resolve-pr-conflicts-v2.sh --target codex/my-branch --base main --strategy ours
#
# Notes:
# - Defaults: target=current branch, base=main, strategy=ours.
# - If you accidentally pass placeholder tokens like <rama-del-pr>, they are ignored.
# - Focuses on known hotspot files first, then resolves remaining unmerged files.

TARGET_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BASE_BRANCH="main"
STRATEGY="ours"
REMOTE="origin"
NO_PUSH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET_BRANCH="${2:-}"; shift 2 ;;
    --base)
      BASE_BRANCH="${2:-}"; shift 2 ;;
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

if [[ -z "$TARGET_BRANCH" ]] || [[ "$TARGET_BRANCH" == "<"*">" ]] || [[ "$TARGET_BRANCH" == "rama-del-pr" ]]; then
  TARGET_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  echo "[warn] Invalid/placeholder target provided. Using current branch: $TARGET_BRANCH"
fi

if [[ "$STRATEGY" != "ours" && "$STRATEGY" != "theirs" ]]; then
  echo "[error] --strategy must be 'ours' or 'theirs'" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[error] Not inside a git repository." >&2
  exit 1
fi

if ! git remote | grep -qx "$REMOTE"; then
  echo "[error] Remote '$REMOTE' not configured." >&2
  echo "[hint] git remote add $REMOTE <repo_url>" >&2
  exit 1
fi

echo "[info] remote=$REMOTE target=$TARGET_BRANCH base=$BASE_BRANCH strategy=$STRATEGY"

MERGE_IN_PROGRESS=0
if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  MERGE_IN_PROGRESS=1
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$CURRENT_BRANCH" != "$TARGET_BRANCH" ]]; then
    echo "[error] Merge in progress on branch $CURRENT_BRANCH, expected $TARGET_BRANCH." >&2
    echo "[hint] Finish/abort current merge first: git merge --continue OR git merge --abort" >&2
    exit 9
  fi
  echo "[warn] Existing merge in progress detected. Reusing current merge state."
fi

git fetch "$REMOTE" --prune

if [[ "$MERGE_IN_PROGRESS" -eq 0 ]]; then
if git show-ref --verify --quiet "refs/heads/${TARGET_BRANCH}"; then
  git switch "$TARGET_BRANCH"
elif git show-ref --verify --quiet "refs/remotes/${REMOTE}/${TARGET_BRANCH}"; then
  git switch -C "$TARGET_BRANCH" --track "${REMOTE}/${TARGET_BRANCH}"
else
  echo "[error] Branch not found: $TARGET_BRANCH" >&2
  echo "[hint] git branch -r | grep codex/" >&2
  exit 2
fi

fi

if ! git show-ref --verify --quiet "refs/remotes/${REMOTE}/${BASE_BRANCH}"; then
  echo "[error] Base branch not found on remote: ${REMOTE}/${BASE_BRANCH}" >&2
  exit 3
fi

# Clean state / merge only when not already in a merge state.
if [[ "$MERGE_IN_PROGRESS" -eq 0 ]]; then
  git reset --hard "${REMOTE}/${TARGET_BRANCH}"

  set +e
  git merge --no-ff "${REMOTE}/${BASE_BRANCH}"
  MERGE_CODE=$?
  set -e

  if [[ "$MERGE_CODE" -eq 0 ]]; then
    echo "[ok] No conflicts: branch is mergeable already."
    exit 0
  fi
  if [[ "$MERGE_CODE" -ne 1 ]]; then
    echo "[error] Merge failed unexpectedly (exit $MERGE_CODE)." >&2
    exit "$MERGE_CODE"
  fi
fi

echo "[info] Merge conflict detected. Applying strategy '$STRATEGY'."

HOTSPOTS=(
  "game-engine.js"
  "styles/main.css"
  "scripts/resolve-pr-conflicts.sh"
  "index.html"
  "privacy.html"
  "profile.html"
  "terms.html"
)

for f in "${HOTSPOTS[@]}"; do
  if git diff --name-only --diff-filter=U | grep -qx "$f"; then
    git checkout --"$STRATEGY" -- "$f"
    git add "$f"
    echo "[info] resolved hotspot: $f"
  fi
done

# Resolve any other remaining unmerged files the same way.
if git ls-files -u | grep -q .; then
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    git checkout --"$STRATEGY" -- "$f"
    git add "$f"
    echo "[info] resolved remaining: $f"
  done < <(git diff --name-only --diff-filter=U)
fi

if git ls-files -u | grep -q .; then
  echo "[error] Unmerged paths still present after auto-resolution." >&2
  git status --short
  exit 4
fi


UNMERGED_AFTER=$(git ls-files -u | wc -l | tr -d ' ')
echo "[info] unmerged entries after strategy application: ${UNMERGED_AFTER}"

# Safety check for conflict markers in key files.
if grep -nE '^(<<<<<<<|=======|>>>>>>>)' game-engine.js styles/main.css scripts/resolve-pr-conflicts.sh index.html >/dev/null 2>&1; then
  echo "[error] Conflict markers still present in key files." >&2
  exit 5
fi

node --check game-engine.js >/dev/null

if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  git add -A
  git commit --allow-empty -m "Resolve merge conflicts with ${BASE_BRANCH} using ${STRATEGY} strategy"
else
  if git diff --cached --quiet; then
    echo "[info] Nothing staged after merge resolution and no merge in progress."
    exit 0
  fi
  git commit -m "Resolve merge conflicts with ${BASE_BRANCH} using ${STRATEGY} strategy"
fi

if [[ "$NO_PUSH" -eq 0 ]]; then
  git push "$REMOTE" "$TARGET_BRANCH"
  echo "[ok] Resolved and pushed: ${REMOTE}/${TARGET_BRANCH}"
else
  echo "[ok] Resolved locally (push skipped by --no-push)."
fi
