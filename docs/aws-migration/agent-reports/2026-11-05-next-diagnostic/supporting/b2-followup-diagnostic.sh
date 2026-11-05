#!/usr/bin/env bash
# Follow-up read-only diagnostic for B2 (2026-11-05-next-diagnostic, 01 §5). Isolates why
# B2 (GetLogEvents on the foreign group /aws/other) was implicitDeny. NOT RUN; owner approval needed.
#
# It makes only these read-only IAM API calls:
#   iam:SimulateCustomPolicy     (synthetic one-statement policies; no account policy is read)
#   iam:SimulatePrincipalPolicy  (the live nonprod deployer role, same as revision 3)
# It writes nothing to AWS, creates no credentials, and changes no policy. The full JSON
# response (no --query) is kept, so MatchedStatements, EvalResourceName and
# ResourceSpecificResults are visible.
#
# Usage: bash b2-followup-diagnostic.sh [out-dir]   (default /tmp/p7diag2)
# Then send the lead "$OUT/summary.tsv" and every C*.json file (no secrets are in them).
set -u
OUT=${1:-/tmp/p7diag2}
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
OTHERNAME=arn:aws:logs:$R:$ACCT:log-group:/other
OWN2=arn:aws:logs:$R:$ACCT:log-group:/munaxa/nonprod/zzz
printf '%s' '["{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"SynAllowAll\",\"Effect\":\"Allow\",\"Action\":\"logs:GetLogEvents\",\"Resource\":\"*\"},{\"Sid\":\"SynDenyAll\",\"Effect\":\"Deny\",\"Action\":\"logs:GetLogEvents\",\"Resource\":\"*\"}]}"]' > "$OUT/syn-allow-deny.json"
printf '%s' '["{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"SynDenyAll\",\"Effect\":\"Deny\",\"Action\":\"logs:GetLogEvents\",\"Resource\":\"*\"}]}"]' > "$OUT/syn-deny-only.json"

# C1/C2: synthetic analogues of B2 on the same foreign group (no account policy involved).
custom C1 "$OUT/syn-allow-deny.json" logs:GetLogEvents "$GROUP_OTHER"
custom C2 "$OUT/syn-deny-only.json"  logs:GetLogEvents "$GROUP_OTHER"
# C3-C5: the live nonprod deployer, foreign resources where the ONLY unconditioned matching
# statement is a Deny on "*" in the attached managed -allow policy (as in B2).
principal C3 "$NP_ROLE" logs:FilterLogEvents "$GROUP_OTHER"
principal C4 "$NP_ROLE" rds:DownloadDBLogFilePortion arn:aws:rds:$R:$ACCT:db:other-db
principal C5 "$NP_ROLE" acm:ExportCertificate arn:aws:acm:$R:$ACCT:certificate/foreign
# C6: control. Same shape, but the lone "*" Deny is in the INLINE policy (NeverAccountSettingsOrSharing);
# revision 3 N44.1 passed as explicitDeny on a similar secret.
principal C6 "$NP_ROLE" secretsmanager:PutResourcePolicy arn:aws:secretsmanager:$R:$ACCT:secret:other/x-AbCdEf
# C7/C8: is the group name special? A non-/aws/ foreign group, and a second own-named group.
principal C7 "$NP_ROLE" logs:GetLogEvents "$OTHERNAME"
principal C8 "$NP_ROLE" logs:GetLogEvents "$OWN2"
# C9/C10: repeat B2 and B4 exactly, to check reproducibility.
principal C9 "$NP_ROLE" logs:GetLogEvents "$GROUP_OTHER"
principal C10 "$NP_ROLE" logs:GetLogEvents "$GROUP_NP"

column -t -s $'\t' "$OUT/summary.tsv" 2>/dev/null || cat "$OUT/summary.tsv"
echo "DIAG2 done: $(($(wc -l < "$OUT/summary.tsv") - 1)) rows in $OUT/summary.tsv (10 expected)"
