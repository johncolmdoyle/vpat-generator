import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '@vpat/backend';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { SubscriptionPlan } from '@vpat/shared';

export interface AuthClaims {
  sub: string;
  email: string | null;
  planHint: SubscriptionPlan | null;
  permissions: string[];
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: {
      auth0Sub: string;
      email: string | null;
      userId: string;
      permissions: string[];
    } | null;
  }
}

const issuer = env.auth0.domain ? `https://${env.auth0.domain}/` : '';
const jwks = issuer ? createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`)) : null;

function bearerToken(req: FastifyRequest): string | null {
  const raw = req.headers.authorization;
  if (!raw) return null;
  const [scheme, token] = raw.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

function toClaims(payload: JWTPayload): AuthClaims | null {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
  const rawPlan = env.auth0.planClaim ? payload[env.auth0.planClaim] : undefined;
  const rawPermissions = payload[env.auth0.permissionsClaim];
  const planHint =
    rawPlan === 'starter' || rawPlan === 'growth' || rawPlan === 'enterprise'
      ? rawPlan
      : null;
  const permissions = Array.isArray(rawPermissions)
    ? rawPermissions.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  return {
    sub: payload.sub,
    email: normalizeEmail(typeof payload.email === 'string' ? payload.email : null),
    planHint,
    permissions,
  };
}

export function assertAuthConfigured() {
  if (!env.auth0.domain || !env.auth0.audience || !jwks) {
    throw new Error('Missing AUTH0_DOMAIN or AUTH0_AUDIENCE for protected API routes');
  }
}

export async function validateAccessToken(req: FastifyRequest, reply: FastifyReply): Promise<AuthClaims | null> {
  assertAuthConfigured();
  const token = bearerToken(req);
  if (!token) {
    await reply.code(401).send({ error: 'missing bearer token' });
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, jwks!, {
      issuer,
      audience: env.auth0.audience,
    });
    const claims = toClaims(payload);
    if (!claims) {
      await reply.code(401).send({ error: 'invalid token payload' });
      return null;
    }
    return {
      ...claims,
      email: claims.email ?? normalizeEmail(Array.isArray(req.headers['x-user-email']) ? req.headers['x-user-email'][0] : req.headers['x-user-email']),
    };
  } catch {
    await reply.code(401).send({ error: 'invalid access token' });
    return null;
  }
}
