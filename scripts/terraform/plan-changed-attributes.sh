#!/usr/bin/env bash
# Names, never values, of what a saved Terraform plan changes in each existing resource, for the
# plan review while the human-readable plan stays out of public job logs.
#
#   plan-changed-attributes.sh <plan.json>    Markdown: one row per update or replacement
#
# <plan.json> is `terraform show -json tfplan`. For each resource that is updated or replaced, it
# prints the top-level attributes whose planned value differs or is unknown until apply, and for a
# replacement the attributes that force it. Creates and deletes are listed by plan-summary.sh.
# shellcheck disable=SC2016 # the single-quoted string is a jq program, not shell
set -euo pipefail
plan_json="${1:?usage: plan-changed-attributes.sh <plan.json>}"
[ -s "$plan_json" ] || { echo "plan-changed-attributes: $plan_json is missing or empty" >&2; exit 1; }

jq -r '
  [.resource_changes[]?
   | select(.change.actions == ["update"] or ((.change.actions | index("create")) and (.change.actions | index("delete"))))
   | . as $r
   | (($r.change.before // {}) | if type == "object" then . else {} end) as $b
   | (($r.change.after // {}) | if type == "object" then . else {} end) as $a
   | (($r.change.after_unknown // {}) | if type == "object" then . else {} end) as $u
   | {
       address: $r.address,
       kind: (if $r.change.actions == ["update"] then "update" else "replace" end),
       changed: ([($b + $a + $u) | keys[] | select($b[.] != $a[.] or $u[.] == true)] | unique),
       forces: ([($r.change.replace_paths // [])[] | map(tostring) | join(".")] | unique)
     }] as $rows
  | if ($rows | length) == 0 then "No resource is updated or replaced."
    else
      "| Action | Address | Attributes that change | Forces replacement |",
      "| --- | --- | --- | --- |",
      ($rows[] | "| \(.kind) | `\(.address)` | \(.changed | join(", ")) | \(.forces | join(", ")) |")
    end
' "$plan_json"
