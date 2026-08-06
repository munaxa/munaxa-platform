# Deprecation policy

The platform is consumed by products that cannot all upgrade on the same day. This policy exists so
that "we removed it" is never the first thing a consumer learns about a change.

Previously this was prose in the extension guide and was enforced by nothing. It is now the rule
the release check and the review checklist are written against.

## The rule

**A public export is removed no sooner than two minor releases after it is deprecated, and never in
a minor release.**

Concretely, for something deprecated in 2.1.0:

| Release | State |
| --- | --- |
| 2.1.0 | Marked `@deprecated` with a replacement named. Still works, unchanged. |
| 2.2.0 | Still works. Still deprecated. |
| 2.3.0 | Still works. Earliest release in which removal may be *announced*. |
| 3.0.0 | May be removed. |

Two minors is the floor, not the target. A capability with a security implication — an auth path, a
crypto format, a stored encoding — gets longer, because a consumer that upgrades late must not be
forced to choose between an unsupported version and a rushed migration.

## What counts as public

Everything reachable from a package's `.` export. If it can be imported without reaching into
`dist/`, it is public, and this policy applies.

That includes the test doubles (`FixedClock`, `MemoryLogger`, `Memory*Store`). They are exported
today from the main entry point, so they are supported API. Moving them behind a `/testing` subpath
is itself a deprecation and follows the schedule above.

## How to deprecate

1. Add `@deprecated` with the replacement named in the tag. A deprecation that does not say what to
   use instead converts into a support question rather than a migration.

   ```ts
   /**
    * @deprecated since 2.1.0 — use `cacheKey()` from `@munaxa/types`, which escapes each segment.
    *   Removed no earlier than 3.0.0.
    */
   ```

2. Add a changeset describing it as a **minor**. Deprecating is not a breaking change; removing is.
3. Record it in the package's `CHANGELOG.md` under a `Deprecated` heading.
4. Keep the tests. A deprecated export that has stopped being tested is already broken; nobody has
   noticed yet.

## What is exempt

**Anything never published.** 2.0.0 has not been released, so everything removed between 1.0.0 and
2.0.0 — the four unwired ports, the Firebase preset — is removed outright. There is no consumer to
protect, and carrying a deprecation shim for a version that never existed is pure cost.

**Security defects.** If an export cannot be used safely, it goes as soon as the fix ships, in
whatever release that is, with the reason stated. `providerPresets.firebase` is the worked example:
it accepted unverified tokens, so it now throws rather than being deprecated politely for a year.
The rule this policy protects is a consumer's right to plan, not their right to keep a hazard.

## Formats outlive APIs

An API can be deprecated; a stored format usually cannot. Password hashes, ciphertext envelopes,
JWT claims, cookie names, cache keys and the audit canonical form are pinned by each package's
`test/compat.test.ts`, and changing one is a deliberate edit to that file plus a major release plus
a migration path for existing data.

The distinction matters because these fail differently. A removed API fails at compile time, loudly,
in the consumer's own build. A changed format fails at runtime, quietly, against data already
written — which is how a password hash change becomes a mass lockout and an audit canonical-form
change becomes a tamper alarm nobody can turn off.
