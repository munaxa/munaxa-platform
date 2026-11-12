"""Mutation run for the Platform limiter fix. Each mutant is applied to the source, the security
package's tests run (with a real Redis when MUNAXA_TEST_REDIS_URL is set), and the source restored.
A mutant is caught when at least one test fails. Run from the munaxa-platform root after
`pnpm build` (cache is rebuilt per mutant when the mutant touches it)."""
import os, subprocess, sys

R = 'packages/platform/security/src/ratelimit.ts'
C = 'packages/platform/cache/src/redis.ts'
W = 'packages/platform/cache/src/counters.ts'
MUTANTS = [
    ('counter key follows the penalty window', R,
     "const state = await this.#window.hitWithHistory(key, rule.window, cost);",
     "const penaltyWindow = ((await this.#cache.get<number>(`${key}:violations`)) ?? 0) > 0 ? rule.window * 2 : rule.window;\n      const state = await this.#window.hitWithHistory(key, penaltyWindow, cost);"),
    ('refused attempts are not counted', R,
     "const state = await this.#window.hitWithHistory(key, rule.window, cost);",
     "const peekBlock = await this.#cache.get<number>(`${key}:block`);\n      const state = await this.#window.hitWithHistory(key, rule.window, peekBlock !== undefined && peekBlock > this.#clock.now() ? 0 : cost);"),
    ('store failure admits a deny rule', R,
     "if (rule.onStoreFailure === 'deny') {", "if (rule.onStoreFailure === ('never' as string)) {"),
    ('route match uses the raw path', R,
     "return target.method.toUpperCase() === method && path(canonicalRoutePath(target.path));",
     "return target.method.toUpperCase() === method && path(target.path);"),
    ('login rule removed from the baseline', R,
     "    id: 'login-per-ip',\n    match: (target) => isRoute(target, 'POST', (path) => path.endsWith('/login')),",
     "    id: 'login-per-ip',\n    match: () => false,"),
    ('counter identity drops the subject', R,
     "const key = cacheKey('rl', rule.id, target.tenantId, subject);\n    const cost",
     "const key = cacheKey('rl', rule.id, target.tenantId);\n    const cost"),
    ('degraded not reported from check()', R,
     "degraded ||= decision.degraded === true;", "degraded ||= false;"),
    ('block never set (adaptive off)', R,
     "if (await this.#cache.setIfAbsent(blockKey, until, { ttl: penalty })) {",
     "if (await this.#cache.setIfAbsent(blockKey, until, { ttl: penalty }) && false) {"),
    ('malformed counter accepted (NaN passes)', W,
     "if (!isCount(current) || !isCount(previous)) {", "if (!isCount(0)) {"),
    ('IPv6 counted per address', R,
     "return target.ipAddress === undefined ? undefined : addressSubject(target.ipAddress);",
     "return target.ipAddress;"),
    ('increment script drops the expiry', C,
     "  redis.call('PEXPIRE', KEYS[1], ttl)\n", ""),
    ('real 429 reported as 503 after a degraded rule', R,
     "      if (!decision.allowed) return decision;",
     "      if (!decision.allowed) return degraded ? { ...decision, degraded } : decision;"),
    ('construction accepts cost above limit', R,
     " || (rule.cost ?? 1) > rule.limit) {", ") {"),
]

env = dict(os.environ)
caught = 0
for name, path, old, new in MUTANTS:
    source = open(path).read()
    if source.count(old) != 1:
        print(f'SKIP (anchor not found once): {name}'); continue
    open(path, 'w').write(source.replace(old, new))
    try:
        if path in (C, W):
            subprocess.run(['pnpm', '--filter', '@munaxa/cache', 'build'], capture_output=True, check=True)
        result = subprocess.run(['pnpm', '--filter', '@munaxa/security', 'exec', 'vitest', 'run'],
                                capture_output=True, text=True, env=env)
        failed = result.returncode != 0
    finally:
        open(path, 'w').write(source)
        if path in (C, W):
            subprocess.run(['pnpm', '--filter', '@munaxa/cache', 'build'], capture_output=True, check=True)
    caught += failed
    print(f"{'CAUGHT  ' if failed else 'SURVIVED'} {name}")
print(f'{caught}/{len(MUTANTS)} mutants caught')
sys.exit(0 if caught == len(MUTANTS) else 1)
