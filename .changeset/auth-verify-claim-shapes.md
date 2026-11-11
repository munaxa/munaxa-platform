---
'@munaxa/auth': patch
---

`TokenService.verifyAccessToken` now rejects a signed token whose `exp` is missing or not a finite
number (previously such a token never expired, because the comparison was against `NaN`), rejects a
non-numeric `iat`, and reads a string `aud` as a one-element list, so it is matched exactly rather
than as a substring. Tokens minted by `TokenService.issueAccessToken` are unaffected.
