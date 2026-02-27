#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Uso:
  scripts/recover-codex-patch-conflict.sh [--force]

Qué hace:
  - Detecta la rama actual.
  - Muestra los comandos de recuperación para conflictos de parche de Codex.
  - Con --force ejecuta limpieza total del working tree contra origin/<rama>.

Nota:
  --force es destructivo: elimina cambios no comiteados y archivos no trackeados.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Este script debe ejecutarse dentro de un repo Git." >&2
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" == "HEAD" ]]; then
  echo "❌ No se pudo detectar una rama activa (HEAD detached)." >&2
  exit 1
fi

cat <<PLAN
Rama detectada: $branch

Plan recomendado para cuando Codex falla con:
  "Failed to apply patch ... setup script and agent modify the same files"

1) Guardar evidencia mínima:
   git status --short --branch
   git diff --stat

2) Limpiar repo a remoto y volver a correr tarea:
   git fetch origin
   git reset --hard origin/$branch
   git clean -fd

3) Verificación rápida:
   npm run check
PLAN

if [[ "${1:-}" != "--force" ]]; then
  echo "\nℹ️ Modo simulación. No se hicieron cambios. Usa --force para ejecutar limpieza."
  exit 0
fi

echo "\n⚠️ Ejecutando recuperación destructiva..."
git fetch origin
git reset --hard "origin/$branch"
git clean -fd

echo "✅ Repo limpio y sincronizado con origin/$branch"
