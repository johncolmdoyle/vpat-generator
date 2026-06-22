/** Central env config for the backend services. Defaults target local compose. */

const e = process.env;
const csv = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

export const env = {
  databaseUrl: e.DATABASE_URL ?? 'postgres://vpat:vpat@localhost:5432/vpat',

  aws: {
    region: e.AWS_REGION ?? 'us-east-1',
    /** LocalStack endpoint in compose; undefined ⇒ real AWS. */
    endpoint: e.AWS_ENDPOINT_URL || undefined,
    accessKeyId: e.AWS_ACCESS_KEY_ID || undefined,
    secretAccessKey: e.AWS_SECRET_ACCESS_KEY || undefined,
    /** LocalStack S3 needs path-style addressing. */
    forcePathStyle: Boolean(e.AWS_ENDPOINT_URL),
  },

  s3Bucket: e.S3_BUCKET ?? 'vpat-artifacts',
  scanQueueName: e.SCAN_QUEUE_NAME ?? 'vpat-scan-jobs',

  /** Endpoint the *browser* can reach for presigned S3 downloads. Inside compose the
   *  API talks to S3 via `http://localstack:4566`, but that host doesn't resolve from
   *  the user's machine — presign against the published port instead. */
  s3PublicEndpoint: e.S3_PUBLIC_ENDPOINT || e.AWS_ENDPOINT_URL || undefined,

  anthropic: {
    apiKey: e.ANTHROPIC_API_KEY ?? '',
    model: e.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
  },

  auth0: {
    domain: e.AUTH0_DOMAIN ?? '',
    audience: e.AUTH0_AUDIENCE ?? '',
    planClaim: e.AUTH0_PLAN_CLAIM ?? '',
    growthEmails: csv(e.GROWTH_PLAN_EMAILS),
    enterpriseEmails: csv(e.ENTERPRISE_PLAN_EMAILS),
  },

  appUrl: e.APP_URL ?? 'http://localhost:5173',

  stripe: {
    secretKey: e.STRIPE_SECRET_KEY ?? '',
    webhookSecret: e.STRIPE_WEBHOOK_SECRET ?? '',
    starterPriceId: e.STRIPE_STARTER_PRICE_ID ?? '',
    growthPriceId: e.STRIPE_GROWTH_PRICE_ID ?? '',
  },

  /** Single demo tenant seeded by the schema. */
  demoOrgId: '00000000-0000-0000-0000-000000000001',
  demoUserId: '00000000-0000-0000-0000-000000000002',

  apiPort: Number(e.PORT ?? e.API_PORT ?? 8080),
};
