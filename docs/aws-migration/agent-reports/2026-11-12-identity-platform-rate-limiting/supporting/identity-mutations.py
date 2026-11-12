"""Mutation run for the Identity edge fix. Each mutant is applied, apps/api rebuilt, the edge and
recovery suites run against local PostgreSQL + Redis, and the source restored. Run from the
munaxa-identity root with TEST_* database variables set (as in CI)."""
import subprocess, sys

E = 'apps/api/src/security/edge.middleware.ts'
L = 'apps/api/src/security/auth-edge-limits.ts'
A = 'apps/api/src/auth/auth.service.ts'
C = 'apps/api/src/platform/cache.ts'
R = 'apps/api/src/password/password-recovery.ts'
MUTANTS = [
    ('edge route match disabled (request.path again)', E,
     "const route = canonicalRoute(target);",
     "const route = request.path;"),
    ('route not lowercased', L,
     "return normalizePath(path).toLowerCase();", "return normalizePath(path);"),
    ('login-per-ip policy removed', L,
     "    id: 'login-per-ip',\n    match: (target) => isLogin(target.method, target.path),",
     "    id: 'login-per-ip',\n    match: () => false,"),
    ('password-reset edge policy removed', L,
     "match: (target) => isPasswordReset(target.method, target.path),", "match: () => false,"),
    ('mfa-per-session policy removed', L,
     "match: (target) => isMfa(target.method, target.path),\n    dimension: 'session',",
     "match: () => false,\n    dimension: 'session',"),
    ('store failure treated as unlimited', L,
     "if (decision.degraded === true) return { kind: 'unavailable', rule: rule.id };", ""),
    ('wrong counter identity (one credential counter for all)', L,
     "`${kind}:${createHash('sha256').update(value).digest('hex').slice(0, 32)}`", "`${kind}:all`"),
    ('login-per-identifier policy removed', L,
     "  // Per identifier first: a refusal here stops before the address is charged.\n  {\n    id: 'login-per-identifier',\n    match: (target) => isLogin(target.method, target.path),\n    dimension: 'user',\n    limit: policy.loginPerIdentifier,\n    window: 15 * MINUTE,\n  },\n",
     ""),
    ('login rule also matches introspection', L,
     "isMethod(method, 'POST') && route === LOGIN_ROUTE;",
     "(isMethod(method, 'POST') && route === LOGIN_ROUTE) || route === '/api/auth/introspect';"),
    ('identifier not trimmed before lockout', A,
     "const identifier = request.identifier.trim();", "const identifier = request.identifier;"),
    ('no Redis command timeout', C,
     "    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,\n", ""),
    ('reset address rule adaptive again', R,
     "    id: 'password-forgot-per-ip',\n    dimension: 'ip' as const,\n    limit: perIp,",
     "    id: 'password-forgot-per-ip',\n    dimension: 'ip' as const,\n    adaptiveFactor: 2,\n    limit: perIp,"),
    ('identifier counter not scoped by organisation', L,
     "update(`${scope}\\u0000${normalised}`)", "update(`\\u0000${normalised}`)"),
    ('IPv6 counted per address, not per /64', L,
     "...(request.ipAddress === undefined ? {} : { ipAddress: addressSubject(request.ipAddress) }),",
     "...(request.ipAddress === undefined ? {} : { ipAddress: request.ipAddress }),"),
    ('encoded introspect spelling gets the introspection limit', E,
     "return routed ? route : `${route}#encoded`;", "return route;"),
    ('default organisation counted apart from its explicit key', E,
     "const identifier = login ? identifierSubject(body?.identifier, organisation) : undefined;",
     "const identifier = login ? identifierSubject(body?.identifier, typed) : undefined;"),
]
TESTS = ['src/auth-edge-limits.http.integration.test.ts', 'src/password-recovery.integration.test.ts']

caught = 0
for name, path, old, new in MUTANTS:
    source = open(path).read()
    if source.count(old) != 1:
        print(f'SKIP (anchor not found once): {name}', flush=True); continue
    open(path, 'w').write(source.replace(old, new))
    try:
        built = subprocess.run(['pnpm', '--filter', '@identity/api', 'build'], capture_output=True)
        if built.returncode != 0:
            failed = True; how = 'build fails'
        else:
            result = subprocess.run(['npx', 'vitest', 'run', *TESTS], cwd='packages/testing',
                                    capture_output=True, text=True)
            failed = result.returncode != 0; how = 'tests fail'
    finally:
        open(path, 'w').write(source)
    caught += failed
    print(f"{'CAUGHT  ' if failed else 'SURVIVED'} {name}{' (' + how + ')' if failed else ''}", flush=True)
subprocess.run(['pnpm', '--filter', '@identity/api', 'build'], capture_output=True)
print(f'{caught}/{len(MUTANTS)} mutants caught')
sys.exit(0 if caught == len(MUTANTS) else 1)
