/** Per-criterion conformance drafting (BACKEND.md §2). Uses Claude when
 *  ANTHROPIC_API_KEY is set + the scan was real; otherwise a deterministic heuristic.
 *  For the mock scan it returns the criterion's baked draft so the API-backed flow
 *  reproduces the standalone demo exactly. */
import { env } from '@vpat/backend';
import { CONF, type ConformanceLevel, type Criterion } from '@vpat/shared';
import type { CriterionData } from './scan.js';

export interface Draft {
  status: ConformanceLevel;
  remarks: string;
  confidence: number;
}

const hasKey = env.anthropic.apiKey.length > 0;

function heuristic(c: Criterion, data: CriterionData): Draft {
  if (c.obsolete) {
    return { status: CONF.SUPPORTS, remarks: c.remarks, confidence: 1 };
  }
  const where = [...new Set(data.evidence.map((e) => e.where).filter(Boolean))].join(', ');
  if (data.auto === 0) {
    return {
      status: CONF.SUPPORTS,
      remarks: 'No automated violations were detected for this criterion. Manual review recommended.',
      confidence: 0.8,
    };
  }
  if (data.auto <= 5) {
    return {
      status: CONF.PARTIAL,
      remarks: `${data.auto} automated issue(s) detected${where ? ` on ${where}` : ''}. Some functionality does not meet the criterion.`,
      confidence: 0.7,
    };
  }
  return {
    status: CONF.NOT,
    remarks: `${data.auto} automated issues detected${where ? ` on ${where}` : ''}. The majority of functionality does not meet the criterion.`,
    confidence: 0.75,
  };
}

async function withClaude(c: Criterion, data: CriterionData): Promise<Draft> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.anthropic.apiKey });

  const evidence = data.evidence.map((e) => `- [${e.type}] ${e.text} (${e.where})`).join('\n') || '- none';
  const msg = await client.messages.create({
    model: env.anthropic.model,
    max_tokens: 600,
    tool_choice: { type: 'tool', name: 'record_conformance' },
    tools: [
      {
        name: 'record_conformance',
        description: 'Record the conformance evaluation for one accessibility criterion.',
        input_schema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['Supports', 'Partially Supports', 'Does Not Support', 'Not Applicable', 'Not Evaluated'],
            },
            remarks: { type: 'string', description: 'Plain-language explanation citing the specific issues and locations.' },
            confidence: { type: 'number', description: '0.0–1.0 self-rated confidence.' },
          },
          required: ['status', 'remarks', 'confidence'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Evaluate this accessibility success criterion against the sanitized automated evidence and return a conformance level, remarks, and confidence.

Criterion: ${c.id} ${c.name}${c.level ? ` (Level ${c.level})` : ''}
Principle: ${c.principle}
Automated checks aggregated to this criterion: ${data.auto}
Evidence:
${evidence}`,
      },
    ],
  });

  const block = msg.content.find((b) => b.type === 'tool_use');
  if (block && block.type === 'tool_use') {
    const input = block.input as { status: ConformanceLevel; remarks: string; confidence: number };
    return {
      status: input.status,
      remarks: input.remarks,
      confidence: Math.max(0, Math.min(1, input.confidence)),
    };
  }
  throw new Error('no tool_use block in response');
}

export async function draftCriterion(
  c: Criterion,
  data: CriterionData,
  opts: { mock: boolean },
): Promise<Draft> {
  // Mock scan → reuse the baked draft (identical to the standalone demo).
  if (opts.mock) {
    return { status: c.status, remarks: c.remarks, confidence: c.confidence };
  }
  if (hasKey && !c.obsolete) {
    try {
      return await withClaude(c, data);
    } catch {
      return heuristic(c, data);
    }
  }
  return heuristic(c, data);
}
