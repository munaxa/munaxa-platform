#!/usr/bin/env bash
# Offline Terraform plan of infra/aws/stack against an EMPTY local state, with every outbound
# connection refused (proxy 127.0.0.1:9) and no AWS credentials in the environment.
# Usage: offline-plan.sh <stack dir> <out json> [extra -var args...]
set -euo pipefail
dir="$1"; out="$2"; shift 2
cd "$dir"
export HTTPS_PROXY=http://127.0.0.1:9 HTTP_PROXY=http://127.0.0.1:9 https_proxy=http://127.0.0.1:9 http_proxy=http://127.0.0.1:9 NO_PROXY= no_proxy=
for v in $(env | grep -o '^AWS_[A-Za-z0-9_]*'); do unset "$v"; done
rm -f offline.tfstate tfplan.offline
terraform init -reconfigure -lockfile=readonly -input=false -no-color >/dev/null
terraform plan -input=false -no-color -refresh=false -var-file=envs/nonprod.tfvars "$@" -out=tfplan.offline > plan.offline.txt
terraform show -json tfplan.offline > "$out"
tail -1 plan.offline.txt | head -1; grep -E "^Plan:" plan.offline.txt
