#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Uso:
  scripts/sync-and-push-branches.sh [--skip-check] <branch-1> <branch-2> [...]

Qué hace:
  1) Verifica que el repo esté limpio.
  2) Ejecuta `npm run check` (salvo --skip-check).
  3) Crea/actualiza cada rama indicada apuntando al commit actual.
  4) Hace push de cada rama a origin.

Ejemplo:
  scripts/sync-and-push-branches.sh hotfix-mtr-address-main codex/pr-135-fix
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

run_check=true
if [[ "${1:-}" == "--skip-check" ]]; then
  run_check=false
  shift
fi

if [[ "$#" -lt 2 ]]; then
  echo "❌ Debes indicar al menos 2 ramas para sincronizar y empujar." >&2
  usage >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Este script debe ejecutarse dentro de un repo Git." >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "❌ No existe remote origin configurado. Agrega origin y vuelve a intentar." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Working tree sucio. Commit/stash antes de sincronizar ramas." >&2
  git status --short
  exit 1
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
current_commit="$(git rev-parse --short HEAD)"

if [[ "$run_check" == true ]]; then
  echo "▶ Ejecutando validación: npm run check"
  npm run check
else
  echo "⚠️ Se omitió npm run check por --skip-check"
fi

echo "▶ Sincronizando ramas al commit $current_commit"
for target_branch in "$@"; do
  echo "  - $target_branch"
  git branch -f "$target_branch" HEAD
  git push -u origin "$target_branch"
done

git checkout "$current_branch" >/dev/null 2>&1 || true

echo "✅ Ramas sincronizadas y empujadas desde commit $current_commit"
