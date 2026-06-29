#!/usr/bin/env bash
# Stop hook: gate ending the turn on `npm run typecheck` when .ts/.tsx files
# have uncommitted changes. Bypasses itself on the second invocation in the
# same turn (stop_hook_active) so a stubborn/pre-existing error can't loop.
set -uo pipefail

input="$(cat)"

if printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$PWD}" || exit 0

if ! git status --porcelain | grep -qE '\.(ts|tsx)$'; then
  exit 0
fi

output="$(npm run typecheck 2>&1)"
status=$?

if [ "$status" -ne 0 ]; then
  echo "$output" >&2
  exit 2
fi

exit 0
