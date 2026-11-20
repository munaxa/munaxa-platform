# 13. Ordered execution plan

Each step after step 1 needs the owner's yes for that step (file 12). Claude prepares and runs each step after the yes. The owner approves, signs in where MFA or Cloudflare needs a person, and runs the CloudShell scripts that create secret values.

```
1  A-R  rotation check (automatic, ~00:30 UTC 21 Nov)
2  A-1  Identity Stage E (gives the operator ids C-2 needs)
2' A-2  merges (parallel, any time)
3  A-3  Docs bootstrap   A-4 Docs fill   A-4C Control fill   A-6 Resend decision
4  A-5  Docs release     A-5C Control release
5  A-7  Cloudflare Access app + C-1 apply (33 creates; independent of Stage E)
6  A-8  C-2 + D-1 apply (services off; after A-1, A-4, A-4C, A-5, A-7)
7  A-9  Control and Docs session; operator signs in; mint the Docs credential
8  A-10 replace-key CONTROL_PLANE_TOKEN; pin apply; licensed Docs session
```

## Ordering rules (each backed by evidence)

1. **Stage E before C-2.** C-2 changes the db-admin task definition, and the E-1 guard checks db-admin against the Stage E manifest (file 05 §1). If C-2 must go first, its PR also updates `envs/nonprod.stage-e-tasks.json`.
2. **A-3 before A-5.** The Docs release pushes `migrate`, which needs the repository (blocker 1).
3. **docs#179 and control#10 before their releases.** This gives a reproducible Docs base and clean Control images.
4. **A-5C before C-1.** Pin the new Control digests once, instead of pinning the vulnerable `a24c568` and replacing it.
5. **A-4C before C-2.** C-2 pins the Control bundle version ids, and db-admin reads the Control URLs.
6. **Each config change is its own plan, declaration (`expected-changes.json`) and apply with services off.** The session workflow refuses task-definition changes.
7. **Every session is capped by the 3-hour hard stop, R (21:05 UTC) and the backstop (21:00 UTC).**
