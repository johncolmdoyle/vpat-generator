#!/bin/bash
# Runs inside the LocalStack container once it reports ready
# (mounted into /etc/localstack/init/ready.d). Creates the S3 bucket,
# SQS queues, and a placeholder Anthropic secret the API/worker expect.
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
BUCKET="${S3_BUCKET:-vpat-artifacts}"
QUEUE="${SCAN_QUEUE_NAME:-vpat-scan-jobs}"
DLQ="${SCAN_DLQ_NAME:-vpat-scan-jobs-dlq}"

echo "[init] creating S3 bucket: ${BUCKET}"
awslocal s3 mb "s3://${BUCKET}" --region "${REGION}" || true

echo "[init] creating SQS dead-letter queue: ${DLQ}"
awslocal sqs create-queue --queue-name "${DLQ}" --region "${REGION}" || true

echo "[init] creating SQS scan queue: ${QUEUE}"
awslocal sqs create-queue \
  --queue-name "${QUEUE}" \
  --region "${REGION}" \
  --attributes "VisibilityTimeout=300,MessageRetentionPeriod=1209600" || true

echo "[init] creating placeholder Anthropic API-key secret"
awslocal secretsmanager create-secret \
  --name "vpat/anthropic-api-key" \
  --secret-string "${ANTHROPIC_API_KEY:-not-set}" \
  --region "${REGION}" || true

echo "[init] LocalStack resources ready"
