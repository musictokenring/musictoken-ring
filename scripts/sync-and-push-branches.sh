#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Uso:
  scripts/sync-and-push-branches.sh [--skip-check] [--anchor <branch|HEAD>] [--delete-remote <branch> ...] <branch-1> <branch-2> [branch-3 ...]

Qué hace:
  1) Verifica que el repo esté limpio.
  2) Ejecuta `npm run check` (salvo --skip-check).
  3) Toma un commit ancla (HEAD por defecto, o --anchor <branch|HEAD>).
  4) Fuerza cada rama objetivo para que apunte al mismo commit ancla.
  5) Hace push forzado de esas ramas a origin.
  6) Opcional: elimina ramas remotas sobrantes con --delete-remote.

Ejemplos:
  # Sincronizar 3 ramas al commit actual
  scripts/sync-and-push-branches.sh hotfix-mtr-address-main codex/pr-135-fix codex/pr-138-fix

  # Sincronizar usando una rama ancla explícita
  scripts/sync-and-push-branches.sh --anchor hotfix-mtr-address-main codex/pr-135-fix codex/pr-137-fix

  # Sincronizar y borrar rama remota sobrante
  scripts/sync-and-push-branches.sh hotfix-mtr-address-main codex/pr-135-fix codex/pr-137-fix --delete-remote codex/pr-138-fix
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

run_check=true
anchor_ref="HEAD"
delete_remote_branches=()
target_branches=()

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --skip-check)
      run_check=false
      shift
      ;;
    --anchor)
      anchor_ref="${2:-}"
      if [[ -z "$anchor_ref" ]]; then
        echo "❌ --anchor requiere un valor." >&2
        exit 1
      fi
      shift 2
      ;;
    --delete-remote)
      branch_to_delete="${2:-}"
      if [[ -z "$branch_to_delete" ]]; then
        echo "❌ --delete-remote requiere un nombre de rama." >&2
        exit 1
      fi
      delete_remote_branches+=("$branch_to_delete")
      shift 2
      ;;
    *)
      target_branches+=("$1")
      shift
      ;;
  esac
done

if [[ "${#target_branches[@]}" -lt 2 ]]; then
  echo "❌ Debes indicar al menos 2 ramas objetivo para sincronizar." >&2
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

if ! git rev-parse --verify "$anchor_ref" >/dev/null 2>&1; then
  echo "❌ El ancla '$anchor_ref' no existe." >&2
  exit 1
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
anchor_commit="$(git rev-parse --short "$anchor_ref")"

if [[ "$run_check" == true ]]; then
  echo "▶ Ejecutando validación: npm run check"
  npm run check
else
  echo "⚠️ Se omitió npm run check por --skip-check"
fi

echo "▶ Sincronizando ramas al commit ancla $anchor_commit ($anchor_ref)"
for target_branch in "${target_branches[@]}"; do
  echo "  - $target_branch"
  git branch -f "$target_branch" "$anchor_ref"
  git push -f -u origin "$target_branch"
done

if [[ "${#delete_remote_branches[@]}" -gt 0 ]]; then
  echo "▶ Eliminando ramas remotas sobrantes"
  for stale_branch in "${delete_remote_branches[@]}"; do
    echo "  - $stale_branch"
    git push origin --delete "$stale_branch"
  done
fi

git checkout "$current_branch" >/dev/null 2>&1 || true

echo "✅ Sincronización completada. Todas las ramas objetivo apuntan a $anchor_commit"
