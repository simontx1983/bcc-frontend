#!/usr/bin/env bash
# Phase γ regression guard — refuse merges that re-introduce the
# anti-patterns Phase γ retired.
#
# Run from bcc-frontend/:
#   bash scripts/error-contract-guard.sh
#
# Exits 1 with a per-file report if any forbidden pattern is found.
# Exits 0 otherwise. Designed to fit a pre-commit hook or CI gate.
#
# The grep patterns are deliberately narrow: they target the well-
# defined regressions ("read err.message in JSX or onError setter")
# and ignore framework code that legitimately reads `.message` (the
# typed error class constructors, the API client's BccApiError
# instantiation, the Sentry / console logging paths).

set -u

cd "$(dirname "$0")/.."

violations=0

# Section A: forbidden — err.message / error.message used as render copy
# Whitelist: paths that legitimately consume .message
#   - lib/api/types.ts                (BccApiError constructor)
#   - lib/api/client.ts               (transport layer)
#   - lib/api/bcc-trust-client.ts     (transport layer)
#   - lib/api/errors.ts               (the helper itself)
#   - lib/push/register.ts            (typed-error throws)
#   - lib/wallet/*.ts                 (typed-error throws)
echo "[error-contract-guard] Scanning for err.message / error.message presentation fallbacks..."

pattern_a='err\.message\s*!==\s*""|err\.message\s*\|\|\s*"|error\.message\s*!==\s*""'
matches=$(grep -RIn -E "$pattern_a" src \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules \
  | grep -v 'src/lib/api/types\.ts' \
  | grep -v 'src/lib/api/client\.ts' \
  | grep -v 'src/lib/api/bcc-trust-client\.ts' \
  | grep -v 'src/lib/api/errors\.ts' \
  | grep -v 'src/lib/push/register\.ts' \
  | grep -v 'src/lib/wallet/' \
  || true)

if [ -n "$matches" ]; then
  echo ""
  echo "FAIL — Section A: err.message / error.message presentation fallback found."
  echo "Phase γ doctrine: machine behavior MUST branch on err.code, not err.message."
  echo "Replace with: humanizeCode(err, { code: copy, ... }, defaultCopy)"
  echo ""
  echo "$matches"
  echo ""
  violations=$((violations + 1))
fi

# Section B: forbidden — err.message.includes(...) pattern-matching
echo "[error-contract-guard] Scanning for err.message.includes() / message string-matching..."

pattern_b='\.message\.includes\(|\.message\.indexOf\(|\.message\.match\('
matches=$(grep -RIn -E "$pattern_b" src \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules \
  | grep -v 'src/lib/api/types\.ts' \
  | grep -v 'src/lib/api/client\.ts' \
  | grep -v 'src/lib/api/bcc-trust-client\.ts' \
  | grep -v 'src/lib/api/errors\.ts' \
  | grep -v 'src/lib/push/register\.ts' \
  | grep -v 'src/lib/wallet/' \
  || true)

if [ -n "$matches" ]; then
  echo ""
  echo "FAIL — Section B: err.message.includes()-style pattern-matching found."
  echo "Phase γ doctrine: error semantics are codes, not English copy."
  echo "If you need to distinguish a sub-case, ask the server for a stable code."
  echo ""
  echo "$matches"
  echo ""
  violations=$((violations + 1))
fi

# Section C: warning-only — err.status === N branching outside whitelisted patterns
# Whitelisted contexts:
#   - app/**/page.tsx        — server-component notFound() short-circuits (status 404)
#   - lib/api/bcc-trust-client.ts — transport-level 401 refresh hook
#   - components/onchain/NftPickerModal.tsx — annotated backend-contract debt
#
# The grep deliberately matches only `err.status` / `error.status` /
# `*.reason.status` (BccApiError variable names). Other domain models
# (item.status, member.status, post.status) use the same property name
# for unrelated enum fields and would otherwise produce false positives.
echo "[error-contract-guard] Scanning for raw err.status === N status-branching..."

pattern_c='(\b(err|error|apiErr|reason)\.status|\.reason\.status)\s*===\s*[0-9]'
matches=$(grep -RIn -E "$pattern_c" src \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules \
  | grep -v 'src/app/.*/page\.tsx' \
  | grep -v 'src/lib/api/types\.ts' \
  | grep -v 'src/lib/api/client\.ts' \
  | grep -v 'src/lib/api/bcc-trust-client\.ts' \
  | grep -v 'src/lib/api/errors\.ts' \
  | grep -v 'src/components/onchain/NftPickerModal\.tsx' \
  | grep -v 'src/lib/api/nft-pieces-endpoints\.ts' \
  || true)

if [ -n "$matches" ]; then
  echo ""
  echo "WARN — Section C: err.status branching found outside whitelisted contexts."
  echo "Prefer humanizeCode() or isCode() on err.code."
  echo "If the backend genuinely lacks a stable code, add a comment naming the"
  echo "backend file:line and a code that should land there."
  echo ""
  echo "$matches"
  echo ""
  # Warning only — does NOT fail the script. Phase γ tolerates documented
  # status fallbacks; un-documented ones get caught in code review.
fi

if [ "$violations" -gt 0 ]; then
  echo "[error-contract-guard] $violations section(s) failed."
  exit 1
fi

echo "[error-contract-guard] OK — no Phase γ regressions detected."
exit 0
