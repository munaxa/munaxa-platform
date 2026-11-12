# 04. Identity image publication (Phase C)

## Status: DONE. Both images were published once, from `5a5994f`

| Item | Value |
| --- | --- |
| Source commit | `5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175` (identity#18 squash merge; `origin/main` at the time) |
| Tag | `image/5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175` on commit `5a5994f…` [V] |
| Who created the tag | the owner, through the GitHub release page, at about 20:55 UTC. The release is pre-release "Identity images 5a5994f", target `main`. This session's git push of the tag was refused with HTTP 403, because the session may push only its own branch. The release page created the same tag, and it starts the same workflow |
| Workflow run | [43305145232](https://github.com/munaxa/munaxa-identity/actions/runs/43305145232), `publish-images-ecr.yml` from the tagged commit, event `push`, **attempt 1** (nothing was repeated), conclusion **success** |
| Environment approval | `image-release` approved by **tam2om** (run approvals API). Claude did not approve it |
| Timing (UTC) | run started 20:55:50. `Resolve the source commit` 20:55:53 to 20:56:05. `munaxa-identity/api` 20:56:14 to 20:57:35. `munaxa-identity/migrate` 20:56:15 to 20:57:46 |
| Job ids | source 131486319867, api 131486456732, migrate 131486456748 |

## Published images

| ECR repository | Tags | Digest (manifest) | Config | Pushed |
| --- | --- | --- | --- | --- |
| `229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api` | `5a5994f`, `sha-5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175` | `sha256:848d33c086ae72f6b478bc605b97e64628dcae00477e751a170847b7ea565c97` | `sha256:defb68934273065944782bc96ff42b4e439d5eb89bc9ba816ab0172f30f7f493` | 20:57:12 |
| `229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate` | `5a5994f`, `sha-5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175` | `sha256:df44505d9ec562020c659b47c58289ef88d7533aa7e9ed23d74f237a0d6c3ada` | `sha256:f8aad205b44ab64560b94ca623a48d3cf74a3e62a0e2ee62f3880f9c22102118` | 20:57:20 |

Pin strings for the future P-5 tfvars PR (not made here):

```
identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:848d33c086ae72f6b478bc605b97e64628dcae00477e751a170847b7ea565c97"
identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:df44505d9ec562020c659b47c58289ef88d7533aa7e9ed23d74f237a0d6c3ada"
```

Nothing else was published. After the run, each repository holds exactly two images [V, `ecr:DescribeImages`]: the new one and the 8 Nov `5277d71` image. No `latest` tag exists. The images were not deployed, and nothing references them yet.
