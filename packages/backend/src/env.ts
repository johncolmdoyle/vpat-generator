/** Central env config for the backend services. Defaults target local compose. */

const e = process.env;

export const env = {
  databaseUrl: e.DATABASE_URL ?? 'postgres://vpat:vpat@localhost:5432/vpat',

  aws: {
    region: e.AWS_REGION ?? 'us-east-1',
    /** LocalStack endpoint in compose; undefined ⇒ real AWS. */
    endpoint: e.AWS_ENDPOINT_URL || undefined,
    accessKeyId: e.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: e.AWS_SECRET_ACCESS_KEY ?? 'test',
    /** LocalStack S3 needs path-style addressing. */
    forcePathStyle: true,
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

  /** Single demo tenant seeded by the schema. */
  demoOrgId: '00000000-0000-0000-0000-000000000001',
  demoUserId: '00000000-0000-0000-0000-000000000002',

  apiPort: Number(e.PORT ?? e.API_PORT ?? 8080),
};
