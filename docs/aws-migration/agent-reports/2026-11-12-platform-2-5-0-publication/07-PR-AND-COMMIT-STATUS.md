# 07. PR, commit and run status

## munaxa-platform

| Item | Value |
| --- | --- |
| main at release | `ee9015f12fb9bb306179a26a94f7f273e2cfe5ba` |
| #111 release workflow | `be7f12beb8a6e2b20b1bac806d87e6a599bdcf12` |
| #112 versions 2.5.0 | `2bf78accdec843c22467f49a41627b58c7f64713` |
| #114 infra corrections | `c40a6b165e9b0679bc2e544cf8f96576b6d3f13c` |
| #115 Phase C/D report | `ee9015f12fb9bb306179a26a94f7f273e2cfe5ba` |
| Dry run | [43285216277](https://github.com/munaxa/munaxa-platform/actions/runs/43285216277), success, publish job skipped |
| Publication | [43285585963](https://github.com/munaxa/munaxa-platform/actions/runs/43285585963), success, 13 published |
| Tags / Releases | 0 / 0 |
| This report | the PR that adds this folder (squash-merged to main) |

## Published packages (GitHub Packages, `@munaxa` scope, version 2.5.0)

types, interfaces, crypto, config, cache, logging, audit, rbac, session, security, notifications, auth, conformance. `@munaxa/licensing` is unchanged at 0.2.0.

## munaxa-identity

| Item | Value |
| --- | --- |
| PR | [#18](https://github.com/munaxa/munaxa-identity/pull/18): marked ready, then **squash-merged** |
| Final head | `4aabdf742146de723a308683a74416f1bc140099` |
| Merge commit on main | `5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175` "chore(deps): adopt Platform 2.5.0 (#18)" |
| Base before merge | `25823b1` |
| PR CI | [43286790685](https://github.com/munaxa/munaxa-identity/actions/runs/43286790685) success |
| main CI on `5a5994f` | [43287805158](https://github.com/munaxa/munaxa-identity/actions/runs/43287805158) **success** |
| Temporary runs | [43285974617](https://github.com/munaxa/munaxa-identity/actions/runs/43285974617), [43286188504](https://github.com/munaxa/munaxa-identity/actions/runs/43286188504) (read-only, success) |
| Workflows triggered by the merge | CI only. The ECR image workflow needs an `image/*` tag, and none was created. The only tag remains the earlier `image/5277d71...`. |

Work, Control, School and Docs were not changed.
