# 10. Owner authorization package

Yes/no items, in order. Nothing below is authorized until the owner says yes to that item. Claude prepares and runs each step after the yes; the owner only approves, signs in where MFA or Cloudflare needs a person, and runs the CloudShell scripts that create secret values.

| Id | Question | What the owner does | Depends on |
| --- | --- | --- | --- |
| **A-1** | Start Identity Stage E in Testing, in a window you choose, after the 21 Nov rotation check? | say yes and a time (Amman) | rotation check passes |
| A-2 | Merge platform #141, #142, the script PR, this report PR, and docs#178? | yes/no | none |
| A-3 | Approve the Docs bootstrap plan (adds the `munaxa-docs/migrate` ECR repository) and its apply? | yes after Claude shows the plan summary | A-2 |
| A-4 | Run `docs-testing-secrets.sh bundles` in CloudShell (one tab, one run at a time) and send back only the lines it marks SEND CLAUDE? | run one command, type FILL, paste the Resend key or press Enter | A-2 |
| A-5 | Release Docs images from main (tag `image/<sha>`)? | yes/no | A-3 |
| A-6 | Resend: create the account and verify `notify.munaxa.com` now, or start Testing with the placeholder (mail does not send)? | choose | none |
| A-7 | Create the Cloudflare Access application for `operator-test.munaxa.com`, then apply Control step C-1? | create the Access app in Cloudflare (Claude gives the exact fields); yes to the apply | A-1 |
| A-8 | Apply Control C-2 together with the Docs pins D-1? | yes after Claude shows the plan summary | A-4, A-5, A-7 |
| A-9 | Run the Control and Docs session; you sign in to the portal (the operator password is in the AWS console secret, opened as root) and mint the Docs credential? | yes; sign in; mint | A-8 |
| A-10 | Run `replace-key CONTROL_PLANE_TOKEN`, then apply the pin and the Docs desired-1 PR, then the licensed Docs session? | run one command, paste the credential hidden; yes to the apply | A-9 |

**The next owner action is A-1.** A-2 to A-6 are independent of it and can be done in parallel.
