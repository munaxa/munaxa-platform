#!/usr/bin/env bash
# Builds build/identity-config-2db6ed9.mjs: munaxa-identity packages/config at 2db6ed9 bundled with the
# @munaxa/config and @munaxa/types 2.5.0 sources from munaxa-platform. Usage:
#   build-identity-config.sh <munaxa-identity checkout at 2db6ed9> <munaxa-platform checkout>
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd); ID=$1; PF=$2
[[ $(git -C "$ID" rev-parse HEAD) == 2db6ed9bb2eec55a38a1d9808b4a51f6258662d8 ]] || { echo "identity checkout is not 2db6ed9"; exit 1; }
mkdir -p "$D/build"
npx --yes esbuild@0.25.0 "$ID/packages/config/src/index.ts" --bundle --platform=node --format=esm \
  --alias:@munaxa/config="$PF/packages/platform/config/src/index.ts" \
  --alias:@munaxa/types="$PF/packages/platform/types/src/index.ts" \
  --outfile="$D/build/identity-config-2db6ed9.mjs" --log-level=warning
echo "built build/identity-config-2db6ed9.mjs"
