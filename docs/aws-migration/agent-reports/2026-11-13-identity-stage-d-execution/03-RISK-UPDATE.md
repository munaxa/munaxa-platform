# 03. Risk update

Read-only AWS checks, 21:20 and 21:3x UTC, 13 Nov 2026 [V].

## Database and backstop (N-1)

| Item | Value |
| --- | --- |
| Status | **stopped** |
| Events | 16:26:50 started by RDS (7-day stopped limit); 17:26 master credentials reset (rotation); **21:07:07 "DB instance stopped"** |
| Backstop | `StopDBInstance` at 21:00:48 by `assumed-role/munaxa-nonprod-session-backstop`, no error. Ten `ecs:UpdateService` calls at 21:00 returned `ServiceNotFoundException`, as expected with no services |
| ECS | cluster `munaxa-nonprod`: 0 services, 0 tasks |
| Running time | about 4 h 40 min (16:27–21:07), within the Testing RDS budget line; RDS month to date US$3.12 at 20:15 |

## Register

| Id | Status | Evidence | Mitigation (not implemented) |
| --- | --- | --- | --- |
| S-1 scheduled `down` fails at "Plan the switches" | **Open — non-blocking** | after the merge, main's switch plan holds 6 changes instead of 2; it fails the same safe way, and the database job still stops the instance. The 19:17 scheduled run had not started by 21:3x (GitHub delay) | stage D apply clears it |
| S-2 RDS master secret rotation while stopped | **Open — non-blocking** | rotation succeeded at 17:26 while running; next 20 Nov 23:59, when the instance is likely stopped again, so hourly `RotationFailed` will resume | none for stage D; review the Testing rotation period later |
| S-3 unused certificate | **Open — non-blocking** | `*.test.munaxa.com` ISSUED, not after 2027-05-22, renewal INELIGIBLE, in use by 0 | use in a session or re-request before about April 2027 |
| B-1 account US$10 budget | **Open — non-blocking** | actual US$9.67, 80 % alert in ALARM; alerts only, no budget actions | owner: keep as early warning or retire |
| B-2 Testing US$50 budget | **Resolved** for stage D | US$1.99 of 50; account US$9.67 of 50 | the apply adds no running cost |
| N-1 database auto-start | **Resolved (for now)** | stopped by the backstop at 21:00–21:07 | next auto-start about 20 Nov; the backstop handles it |
| N-3 plan freshness | **Open — non-blocking** | an apply uses a fresh plan made in the apply dispatch itself | none |
