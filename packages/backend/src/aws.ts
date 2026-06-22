/** AWS SDK clients wired to LocalStack (or real AWS when AWS_ENDPOINT_URL is unset). */
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  SQSClient,
  GetQueueUrlCommand,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  DeleteSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import { env } from './env.js';

const common = {
  region: env.aws.region,
  endpoint: env.aws.endpoint,
};

const staticCredentials =
  env.aws.accessKeyId && env.aws.secretAccessKey
    ? { accessKeyId: env.aws.accessKeyId, secretAccessKey: env.aws.secretAccessKey }
    : undefined;

if (staticCredentials) {
  Object.assign(common, { credentials: staticCredentials });
}

export const s3 = new S3Client({ ...common, forcePathStyle: env.aws.forcePathStyle });
export const sqs = new SQSClient(common);
export const secrets = new SecretsManagerClient(common);

// Separate client whose endpoint is reachable from the browser, used only to mint
// presigned download URLs (the signature covers the host, so we can't just rewrite it).
const s3Presigner = new S3Client({
  ...common,
  endpoint: env.s3PublicEndpoint,
  forcePathStyle: env.aws.forcePathStyle,
});

/* ---------- S3 ---------- */

export async function s3Put(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

/** Short-lived presigned download URL, signed for the browser-reachable endpoint. */
export async function s3PresignGet(key: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(s3Presigner, new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }), { expiresIn });
}

/* ---------- SQS ---------- */

let cachedQueueUrl: string | undefined;
export async function scanQueueUrl(): Promise<string> {
  if (cachedQueueUrl) return cachedQueueUrl;
  // The queue is created by the LocalStack init script; retry while it appears.
  let lastErr: unknown;
  for (let i = 0; i < 20; i++) {
    try {
      const out = await sqs.send(new GetQueueUrlCommand({ QueueName: env.scanQueueName }));
      cachedQueueUrl = out.QueueUrl!;
      return cachedQueueUrl;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

export async function sqsSend(body: unknown): Promise<void> {
  const url = await scanQueueUrl();
  await sqs.send(new SendMessageCommand({ QueueUrl: url, MessageBody: JSON.stringify(body) }));
}

export interface ReceivedMessage<T> {
  body: T;
  receiptHandle: string;
}

export async function sqsReceive<T>(waitSeconds = 20): Promise<ReceivedMessage<T> | null> {
  const url = await scanQueueUrl();
  const out = await sqs.send(
    new ReceiveMessageCommand({ QueueUrl: url, MaxNumberOfMessages: 1, WaitTimeSeconds: waitSeconds }),
  );
  const msg = out.Messages?.[0];
  if (!msg?.Body || !msg.ReceiptHandle) return null;
  return { body: JSON.parse(msg.Body) as T, receiptHandle: msg.ReceiptHandle };
}

export async function sqsDelete(receiptHandle: string): Promise<void> {
  const url = await scanQueueUrl();
  await sqs.send(new DeleteMessageCommand({ QueueUrl: url, ReceiptHandle: receiptHandle }));
}

/* ---------- Secrets Manager (Step-2 scan credentials) ---------- */

export async function storeSecret(name: string, value: unknown): Promise<string> {
  const out = await secrets.send(
    new CreateSecretCommand({ Name: name, SecretString: JSON.stringify(value) }),
  );
  return out.ARN ?? name;
}

export async function readSecret<T>(id: string): Promise<T | null> {
  try {
    const out = await secrets.send(new GetSecretValueCommand({ SecretId: id }));
    return out.SecretString ? (JSON.parse(out.SecretString) as T) : null;
  } catch {
    return null;
  }
}

/** Destroy scan credentials after use — they are radioactive (ARCHITECTURE.md §4). */
export async function destroySecret(id: string): Promise<void> {
  try {
    await secrets.send(new DeleteSecretCommand({ SecretId: id, ForceDeleteWithoutRecovery: true }));
  } catch {
    /* best-effort */
  }
}
