#!/usr/bin/env bash
# Controlled read-only diagnostic for the four simulation revision 3 mismatches (D30.1, LD01.1,
# LD30.1, LD50.1). NOT RUN. The owner runs it in CloudShell only after approving it.
#
# It makes only these read-only IAM API calls:
#   iam:SimulateCustomPolicy     (synthetic one-statement policies; no account policy is read)
#   iam:SimulatePrincipalPolicy  (the two live deployer roles, same as revision 3)
# It writes nothing to AWS, creates no credentials, and changes no policy. The full JSON
# response (no --query) is kept, so MatchedStatements, EvalResourceName and
# ResourceSpecificResults are visible.
#
# Usage: bash getlogevents-diagnostic.sh [out-dir]   (default /tmp/p7diag)
# Then send the owner thread "$OUT/summary.tsv" and the B*.json files (no secrets are in them).
set -u
OUT=${1:-/tmp/p7diag}
mkdir -p "$OUT" || exit 2
ACCT=229251310592
R=eu-central-1
NP_ROLE=arn:aws:iam::$ACCT:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod
P_ROLE=arn:aws:iam::$ACCT:role/munaxa-shared/bootstrap/munaxa-shared-deployer-prod
CTX='[{"ContextKeyName":"aws:RequestedRegion","ContextKeyValues":["eu-central-1"],"ContextKeyType":"string"}]'

STREAM_NP=arn:aws:logs:$R:$ACCT:log-group:/munaxa/nonprod/identity:log-stream:ecs/identity/1
GROUP_NP=arn:aws:logs:$R:$ACCT:log-group:/munaxa/nonprod/identity
GROUPSTAR_NP=arn:aws:logs:$R:$ACCT:log-group:/munaxa/nonprod/identity:*
STREAM_P=arn:aws:logs:$R:$ACCT:log-group:/munaxa/prod/identity:log-stream:ecs/identity/1
GROUP_P=arn:aws:logs:$R:$ACCT:log-group:/munaxa/prod/identity
STREAM_OTHER=arn:aws:logs:$R:$ACCT:log-group:/aws/other:log-stream:x
GROUP_OTHER=arn:aws:logs:$R:$ACCT:log-group:/aws/other

# Synthetic policies: one statement each, Resource "*", no condition.
printf '%s' '["{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"SynAllowAll\",\"Effect\":\"Allow\",\"Action\":\"logs:GetLogEvents\",\"Resource\":\"*\"}]}"]' > "$OUT/syn-allow.json"
printf '%s' '["{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"SynAllowAll\",\"Effect\":\"Allow\",\"Action\":\"logs:GetLogEvents\",\"Resource\":\"*\"},{\"Sid\":\"SynDenyAll\",\"Effect\":\"Deny\",\"Action\":\"logs:GetLogEvents\",\"Resource\":\"*\"}]}"]' > "$OUT/syn-allow-deny.json"

printf 'test\tapi\tprincipal_or_policy\taction\tresource\tEvalDecision\tEvalResourceName\tmatched_sids\tresource_specific\tmissing_context\n' > "$OUT/summary.tsv"
row() { # test api who action resource json-file
  local f=$6 d n m rs
  if ! jq -e . "$f" >/dev/null 2>&1; then
    printf '%s\t%s\t%s\t%s\t%s\tERROR\t-\t-\t%s\t-\n' "$1" "$2" "$3" "$4" "$5" "$(head -c 200 "$f" | tr '\t\n' '  ')" >> "$OUT/summary.tsv"; return
  fi
  d=$(jq -r '.EvaluationResults[0].EvalDecision // "ERROR(no EvalDecision)"' "$f")
  n=$(jq -r '.EvaluationResults[0].EvalResourceName // "-"' "$f")
  m=$(jq -r 'def st: (.SourcePolicyId // "-") + "@L" + ((.StartPosition.Line // 0)|tostring) + "C" + ((.StartPosition.Column // 0)|tostring);
    [(.EvaluationResults[0].MatchedStatements[]? | st), (.EvaluationResults[0].ResourceSpecificResults[]?.MatchedStatements[]? | st)] | unique | join(",")' "$f")
  rs=$(jq -r '[.EvaluationResults[0].ResourceSpecificResults[]? | (.EvalResourceName + "=" + .EvalResourceDecision)] | join(",")' "$f")
  mc=$(jq -r '[(.EvaluationResults[0].MissingContextValues[]?), (.EvaluationResults[0].ResourceSpecificResults[]?.MissingContextValues[]?)] | unique | join(",")' "$f")
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5" "$d" "$n" "${m:--}" "${rs:--}" "${mc:--}" >> "$OUT/summary.tsv"
}
custom() { # test policy-file action resource
  local f="$OUT/$1.json"
  aws iam simulate-custom-policy --policy-input-list "file://$2" --action-names "$3" --resource-arns "$4" \
    --context-entries "$CTX" --output json > "$f" 2>&1
  row "$1" custom "$(basename "$2" .json)" "$3" "$4" "$f"
}
principal() { # test role action resource
  local f="$OUT/$1.json"
  aws iam simulate-principal-policy --policy-source-arn "$2" --action-names "$3" --resource-arns "$4" \
    --context-entries "$CTX" --output json > "$f" 2>&1
  row "$1" principal "${2##*/}" "$3" "$4" "$f"
}

# Block A: does the simulator apply ANY statement to a log-stream ARN for GetLogEvents?
custom A1 "$OUT/syn-allow.json" logs:GetLogEvents "$STREAM_NP"
custom A2 "$OUT/syn-allow.json" logs:GetLogEvents "$GROUP_NP"
custom A3 "$OUT/syn-allow.json" logs:GetLogEvents "$GROUPSTAR_NP"
custom A4 "$OUT/syn-allow.json" logs:GetLogEvents '*'
custom A5 "$OUT/syn-allow-deny.json" logs:GetLogEvents "$STREAM_NP"
custom A6 "$OUT/syn-allow-deny.json" logs:GetLogEvents "$GROUP_NP"
custom A7 "$OUT/syn-allow-deny.json" logs:GetLogEvents '*'
# Control: an action whose SAR resource type is log-group (LD02.1 passed as explicitDeny).
printf '%s' '["{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"SynAllowAll\",\"Effect\":\"Allow\",\"Action\":\"logs:FilterLogEvents\",\"Resource\":\"*\"}]}"]' > "$OUT/syn-allow-filter.json"
custom A8 "$OUT/syn-allow-filter.json" logs:FilterLogEvents "$GROUP_NP"
custom A9 "$OUT/syn-allow-filter.json" logs:FilterLogEvents "$STREAM_NP"

# Block B: the live deployer roles, the four failing requests and alternative resource forms.
principal B1 "$NP_ROLE" logs:GetLogEvents "$STREAM_OTHER"   # = D30.1
principal B2 "$NP_ROLE" logs:GetLogEvents "$GROUP_OTHER"
principal B3 "$NP_ROLE" logs:GetLogEvents "$STREAM_NP"      # = LD01.1
principal B4 "$NP_ROLE" logs:GetLogEvents "$GROUP_NP"
principal B5 "$NP_ROLE" logs:GetLogEvents "$GROUPSTAR_NP"
principal B6 "$NP_ROLE" logs:GetLogEvents '*'
principal B7 "$P_ROLE"  logs:GetLogEvents "$STREAM_P"       # = LD30.1
principal B8 "$P_ROLE"  logs:GetLogEvents "$GROUP_P"
principal B9 "$NP_ROLE" logs:GetLogEvents "$STREAM_P"       # = LD50.1
principal B10 "$NP_ROLE" logs:GetLogEvents "$GROUP_P"

column -t -s $'\t' "$OUT/summary.tsv" 2>/dev/null || cat "$OUT/summary.tsv"
echo "DIAG done: $(($(wc -l < "$OUT/summary.tsv") - 1)) rows in $OUT/summary.tsv (19 expected)"
