/**
 * Anthropic Messages API adapter for standalone-mode `ctx.llm`.
 *
 * The suppliers plugin calls `ctx.llm.chat({ messages, model, maxTokens,
 * temperature })` and consumes an `AsyncIterable` whose chunks can be a
 * bare string, `{ text }`, or `{ delta: { text } }`. SAM provides this
 * service in plugin mode; the standalone host builds it here against
 * Anthropic's public API when `ANTHROPIC_API_KEY` is configured.
 *
 * Notes:
 *   - The plugin's source still references the legacy model name
 *     `claude-sonnet-4`, which is not a current Anthropic model ID. The
 *     `MODEL_ALIASES` table maps that (and a few other stale names) to
 *     the current shipping models. `ANTHROPIC_MODEL` env override wins
 *     when set — useful for forcing all calls to one model regardless of
 *     what the plugin asks for.
 *   - Opus 4.7 / 4.8 reject `temperature` / `top_p` / `top_k` (400 if
 *     sent). The adapter strips `temperature` when the resolved model is
 *     Opus 4.7+; Sonnet 4.6 still accepts it.
 *   - Tools / extended-thinking / prompt-caching aren't wired up — the
 *     suppliers usage is plain text completion with simple JSON-mode
 *     extraction (parsed by the caller).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { AppLogger } from '../src/app-context.js';

export interface LlmChatRequest {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: unknown[];
  context?: string;
}

export interface LlmService {
  chat(req: LlmChatRequest): AsyncIterable<unknown>;
  stream(req: LlmChatRequest): AsyncIterable<unknown>;
}

/**
 * Map stale or alias model names to the current shipping IDs.
 * Plugin source written before a model rename keeps working without
 * code changes on the plugin side.
 */
const MODEL_ALIASES: Record<string, string> = {
  'claude-sonnet-4': 'claude-sonnet-4-6',
  'claude-sonnet-4-5': 'claude-sonnet-4-6',
  'claude-sonnet-4-0': 'claude-sonnet-4-6',
  'claude-opus-4': 'claude-opus-4-8',
  'claude-opus-4-0': 'claude-opus-4-8',
  'claude-opus-4-1': 'claude-opus-4-8',
  'claude-opus-4-5': 'claude-opus-4-8',
  'claude-opus-4-6': 'claude-opus-4-8',
  'claude-opus-4-7': 'claude-opus-4-8',
  'claude-haiku-4': 'claude-haiku-4-5',
  'claude-3-5-sonnet': 'claude-sonnet-4-6',
  'claude-3-haiku': 'claude-haiku-4-5',
};

const DEFAULT_MODEL = 'claude-sonnet-4-6';

function resolveModel(
  requested: string | undefined,
  override: string | undefined,
  logger?: AppLogger,
): string {
  if (override) return override;
  if (!requested) return DEFAULT_MODEL;
  const aliased = MODEL_ALIASES[requested];
  if (aliased) {
    logger?.debug?.(
      `[anthropic-llm] aliasing model "${requested}" → "${aliased}"`,
    );
    return aliased;
  }
  return requested;
}

/** True for models that reject `temperature`/`top_p`/`top_k`. */
function rejectsSamplingParams(model: string): boolean {
  return (
    model.startsWith('claude-opus-4-7') || model.startsWith('claude-opus-4-8')
  );
}

export interface AnthropicLlmOptions {
  apiKey: string;
  /** Optional ANTHROPIC_MODEL override — forces every call to this model. */
  modelOverride?: string;
  logger?: AppLogger;
}

export function buildAnthropicLlm(opts: AnthropicLlmOptions): LlmService {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const logger = opts.logger;

  const impl = (req: LlmChatRequest): AsyncIterable<unknown> =>
    streamChat(client, req, opts.modelOverride, logger);

  return {
    chat: impl,
    stream: impl,
  };
}

async function* streamChat(
  client: Anthropic,
  req: LlmChatRequest,
  modelOverride: string | undefined,
  logger?: AppLogger,
): AsyncIterable<{ text: string }> {
  const model = resolveModel(req.model, modelOverride, logger);

  // Coerce + filter messages. Anthropic requires alternating user/assistant
  // turns starting with user; suppliers always calls with a single user
  // message (extraction / preview), so we just normalize the role.
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of req.messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (typeof m.content !== 'string' || m.content.length === 0) continue;
    messages.push({ role: m.role as 'user' | 'assistant', content: m.content });
  }
  if (messages.length === 0) {
    throw new Error('[anthropic-llm] no messages to send');
  }
  if (messages[0]?.role !== 'user') {
    throw new Error(
      '[anthropic-llm] first message must be from "user" (got ' +
        messages[0]?.role +
        ')',
    );
  }

  if (req.tools && Array.isArray(req.tools) && req.tools.length > 0) {
    logger?.warn(
      '[anthropic-llm] tools[] requested but not supported in standalone adapter; ignoring',
    );
  }

  const params: Anthropic.MessageCreateParamsStreaming = {
    model,
    max_tokens: req.maxTokens ?? 4000,
    messages,
    stream: true,
  };
  if (!rejectsSamplingParams(model) && typeof req.temperature === 'number') {
    params.temperature = req.temperature;
  }

  logger?.debug?.(
    `[anthropic-llm] stream model=${model} max_tokens=${params.max_tokens} msgs=${messages.length}`,
  );

  const stream = client.messages.stream(params);

  try {
    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield { text: event.delta.text };
      }
    }
  } catch (err) {
    logger?.error(
      `[anthropic-llm] stream failed: ${(err as Error).message ?? err}`,
    );
    throw err;
  }
}
