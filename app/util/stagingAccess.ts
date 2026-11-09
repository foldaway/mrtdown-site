import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';

const issuer = 'https://foldaway.cloudflareaccess.com';
const accessKeys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer));

// These exact routes authenticate independently. The health check returns
// only liveness status. All passenger routes require Access.
const independentRoutes = new Set([
  'GET /healthz',
  'GET /internal/api/reference-catalog/v1',
  'POST /internal/api/crowd-reports',
  'POST /internal/api/tasks/crowd-report-dispatch',
  'POST /internal/api/tasks/facts',
  'POST /internal/api/tasks/public-holidays',
  'POST /internal/api/tasks/pull',
  'POST /internal/api/workflows/publicHolidays',
  'POST /internal/api/workflows/pull',
]);

export async function permitsStagingRequest(
  request: Request,
  audience: string | undefined,
  getKey: JWTVerifyGetKey = accessKeys,
) {
  const route = `${request.method} ${new URL(request.url).pathname}`;
  if (independentRoutes.has(route)) return true;

  const assertion = request.headers.get('cf-access-jwt-assertion');
  if (!audience || !assertion) return false;

  try {
    const { payload } = await jwtVerify(assertion, getKey, {
      algorithms: ['RS256'],
      audience,
      issuer,
      requiredClaims: ['exp', 'iat'],
    });
    return payload.type === 'app';
  } catch {
    return false;
  }
}
