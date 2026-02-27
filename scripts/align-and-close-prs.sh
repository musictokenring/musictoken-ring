#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Uso:
  scripts/align-and-close-prs.sh [opciones]

Opciones:
  --owner <org>            Owner GitHub (opcional; se infiere desde origin)
  --repo <repo>            Repo GitHub (opcional; se infiere desde origin)
  --anchor <ref>           Ref ancla (default: origin/hotfix-mtr-address-main)
  --align-prs <lista>      PRs a alinear al ancla (ej: 135,137)
  --close-prs <lista>      PRs a cerrar borrando rama head remota (ej: 138,139,140)
  --skip-check             No ejecutar npm run check
  --dry-run                Solo imprimir acciones, sin mutar remoto
  -h, --help               Mostrar ayuda

Qué hace:
  1) aborta merge/rebase atascado
  2) valida working tree limpio (o hace fail)
  3) alinea ramas head de PRs indicados al commit ancla y push -f
  4) cierra PRs indicados borrando su rama head remota

Ejemplo (caso 5 PRs):
  scripts/align-and-close-prs.sh \
    --anchor origin/hotfix-mtr-address-main \
    --align-prs 135,137 \
    --close-prs 138,139,140
USAGE
}

OWNER=""
REPO=""
ANCHOR_REF="origin/hotfix-mtr-address-main"
ALIGN_PRS=""
CLOSE_PRS=""
SKIP_CHECK=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner) OWNER="${2:-}"; shift 2 ;;
    --repo) REPO="${2:-}"; shift 2 ;;
    --anchor) ANCHOR_REF="${2:-}"; shift 2 ;;
    --align-prs) ALIGN_PRS="${2:-}"; shift 2 ;;
    --close-prs) CLOSE_PRS="${2:-}"; shift 2 ;;
    --skip-check) SKIP_CHECK=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "❌ argumento desconocido: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ -z "$ALIGN_PRS" && -z "$CLOSE_PRS" ]]; then
  echo "❌ Debes indicar --align-prs y/o --close-prs" >&2
  usage >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Ejecuta dentro de un repo git" >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "❌ Remote origin no configurado" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Working tree sucio. Haz commit/stash y reintenta." >&2
  git status --short
  exit 1
fi

git merge --abort >/dev/null 2>&1 || true
git rebase --abort >/dev/null 2>&1 || true

git fetch --all --prune

git rev-parse --verify "$ANCHOR_REF" >/dev/null 2>&1 || {
  echo "❌ Ref ancla inexistente: $ANCHOR_REF" >&2
  exit 1
}

if [[ -z "$OWNER" || -z "$REPO" ]]; then
  read -r OWNER REPO <<EOF2
$(python3 - <<'PY' "$(git remote get-url origin)"
import re, sys
u=sys.argv[1].strip()
m=re.search(r'github\.com[:/]+([^/]+)/([^/]+?)(?:\.git)?$', u)
if not m:
    print(' ')
else:
    print(m.group(1), m.group(2))
PY
)
EOF2
fi

if [[ -z "$OWNER" || -z "$REPO" ]]; then
  echo "❌ No se pudo inferir owner/repo. Pasa --owner y --repo." >&2
  exit 1
fi

get_pr_head() {
  local pr="$1"
  curl -fsSL "https://api.github.com/repos/${OWNER}/${REPO}/pulls/${pr}" \
    | python3 -c "import sys, json; print(json.load(sys.stdin).get('head',{}).get('ref',''))"
}

anchor_commit="$(git rev-parse --short "$ANCHOR_REF")"
current_branch="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$SKIP_CHECK" -eq 0 ]]; then
  echo "▶ npm run check"
  npm run check
else
  echo "⚠️ se omite npm run check"
fi

IFS=',' read -r -a align_array <<< "$ALIGN_PRS"
for pr in "${align_array[@]}"; do
  pr="${pr// /}"
  [[ -z "$pr" ]] && continue
  head_ref="$(get_pr_head "$pr")"
  if [[ -z "$head_ref" ]]; then
    echo "⚠️ PR #$pr sin head_ref; se omite"
    continue
  fi
  echo "▶ Alinear PR #$pr ($head_ref) -> $ANCHOR_REF ($anchor_commit)"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    git checkout -B "$head_ref" "$ANCHOR_REF"
    git push -f -u origin "$head_ref"
  fi
done

IFS=',' read -r -a close_array <<< "$CLOSE_PRS"
for pr in "${close_array[@]}"; do
  pr="${pr// /}"
  [[ -z "$pr" ]] && continue
  head_ref="$(get_pr_head "$pr")"
  if [[ -z "$head_ref" ]]; then
    echo "⚠️ PR #$pr sin head_ref; se omite"
    continue
  fi
  echo "▶ Cerrar PR #$pr eliminando rama remota $head_ref"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    git push origin --delete "$head_ref" || true
  fi
done

if [[ "$DRY_RUN" -eq 0 ]]; then
  git checkout "$current_branch" >/dev/null 2>&1 || true
fi

echo "✅ Proceso terminado"
