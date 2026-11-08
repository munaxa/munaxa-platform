#!/usr/bin/env bash
# Config A deployer IAM simulation: PREPARED FOR OWNER REVIEW, NOT RUN (8 Nov 2026).
# Report: ../02-CONFIG-A-IAM-ASSESSMENT.md §5.
#
# Running this needs a SEPARATE explicit owner authorization. It is read-only (iam:SimulatePrincipalPolicy
# evaluates the deployer's identity policies; it creates and changes nothing), but it is not covered by
# the 8 Nov read-only inspection authorization.
#
# Limits, read before trusting a result:
# - The simulator evaluates the policies against the resource ARN given here. It does NOT know which
#   resource a service really authorizes against. U-2 (RegisterTaskDefinition) is therefore run twice:
#   on the task-definition ARN and on "*". If the "*" case is denied and the ARN case allowed, the apply
#   works only if ECS authorizes on the ARN; the simulation cannot settle which.
# - KMS key policies and the PutKeyPolicy lockout safety check are not evaluated (U-3).
# - Earlier simulations missed a real failure (G3 parent-VPC context), so a clean result lowers risk;
#   only the first real apply proves it.
#
# Usage (owner, CloudShell eu-central-1, root):  bash config-a-iam-simulation-PREPARED-NOT-RUN.sh 2>&1 | tee /tmp/config-a-sim.log
set -uo pipefail
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1 AWS_PAGER=""
A=229251310592
R=eu-central-1
DEPLOYER="arn:aws:iam::$A:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod"
TAGS=(
  "ContextKeyName=aws:RequestTag/Project,ContextKeyValues=munaxa,ContextKeyType=string"
  "ContextKeyName=aws:RequestTag/Environment,ContextKeyValues=nonprod,ContextKeyType=string"
  "ContextKeyName=aws:RequestedRegion,ContextKeyValues=$R,ContextKeyType=string"
)
REGION_ONLY=("ContextKeyName=aws:RequestedRegion,ContextKeyValues=$R,ContextKeyType=string")

sim() { # $1 label, $2 action, $3 resource, rest: context entries
  local label=$1 action=$2 res=$3; shift 3
  printf '\n--- %s: %s on %s\n' "$label" "$action" "$res"
  aws iam simulate-principal-policy --policy-source-arn "$DEPLOYER" \
    --action-names "$action" --resource-arns "$res" --context-entries "$@" \
    --query 'EvaluationResults[].{Decision:EvalDecision,Matched:MatchedStatements[].SourcePolicyId,Missing:MissingContextValues}' \
    --output json 2>&1
}

date -u +'started %Y-%m-%dT%H:%M:%SZ'
aws sts get-caller-identity --query Arn --output text

# U-2 RegisterTaskDefinition (+ tag on create), both resource forms
for fam in munaxa-nonprod-identity munaxa-nonprod-control-api; do
  sim U-2a ecs:RegisterTaskDefinition "arn:aws:ecs:$R:$A:task-definition/$fam:1" "${TAGS[@]}"
  sim U-2b ecs:RegisterTaskDefinition "*" "${TAGS[@]}"
  sim U-2c ecs:TagResource "arn:aws:ecs:$R:$A:task-definition/$fam:1" "${TAGS[@]}" \
    "ContextKeyName=ecs:CreateAction,ContextKeyValues=RegisterTaskDefinition,ContextKeyType=string"
done

# U-4 PassRole of the execution and task roles to ECS tasks
for role in munaxa-nonprod-identity-execution munaxa-nonprod-control-api-execution munaxa-nonprod-control-api-task munaxa-nonprod-identity-bootstrap-execution; do
  sim U-4 iam:PassRole "arn:aws:iam::$A:role/munaxa-shared/$role" "${REGION_ONLY[@]}" \
    "ContextKeyName=iam:PassedToService,ContextKeyValues=ecs-tasks.amazonaws.com,ContextKeyType=string"
done

# U-6 Role creation with the workload boundary
sim U-6 iam:CreateRole "arn:aws:iam::$A:role/munaxa-shared/munaxa-nonprod-control-api-task" "${TAGS[@]}" \
  "ContextKeyName=iam:PermissionsBoundary,ContextKeyValues=arn:aws:iam::$A:policy/munaxa-shared/munaxa-shared-workload-boundary,ContextKeyType=string"

# U-7 Asymmetric licence key: create with tags (the key id is unknown before creation, so "*")
sim U-7 kms:CreateKey "*" "${TAGS[@]}" \
  "ContextKeyName=kms:KeySpec,ContextKeyValues=ECC_NIST_P256,ContextKeyType=string" \
  "ContextKeyName=kms:KeyUsage,ContextKeyValues=SIGN_VERIFY,ContextKeyType=string"
sim U-7 kms:TagResource "*" "${TAGS[@]}"

# U-3 identity-policy part only of PutKeyPolicy and the refresh reads, on a key tagged for nonprod
KEY="arn:aws:kms:$R:$A:key/00000000-0000-0000-0000-000000000000"
RTAGS=(
  "ContextKeyName=aws:ResourceTag/Project,ContextKeyValues=munaxa,ContextKeyType=string"
  "ContextKeyName=aws:ResourceTag/Environment,ContextKeyValues=nonprod,ContextKeyType=string"
  "ContextKeyName=aws:RequestedRegion,ContextKeyValues=$R,ContextKeyType=string"
)
for act in kms:PutKeyPolicy kms:GetKeyPolicy kms:DescribeKey kms:GetKeyRotationStatus kms:ListResourceTags kms:GetPublicKey; do
  sim U-3/U-5 "$act" "$KEY" "${RTAGS[@]}"
done
sim U-8 kms:CreateAlias "arn:aws:kms:$R:$A:alias/munaxa-nonprod-control-licence" "${REGION_ONLY[@]}"

# Log groups for the new services
sim U-9 logs:CreateLogGroup "arn:aws:logs:$R:$A:log-group:/munaxa/nonprod/control-api" "${TAGS[@]}"

date -u +'finished %Y-%m-%dT%H:%M:%SZ'
