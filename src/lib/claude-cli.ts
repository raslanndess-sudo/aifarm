/**
 * Claude CLI wrapper — spawn `claude --print` to get structured JSON output.
 * No API key required (uses user's logged-in Claude Code CLI).
 *
 * Mode: `ROLE: JSON RESPONDER. NO PROSE.` + explicit example to anchor schema.
 * Caller passes a Zod schema for runtime validation of the response.
 */

import { spawn } from 'child_process';
import type { z, ZodSchema } from 'zod';

export type ClaudeCliOptions = {
  /** Soft timeout in ms (default 60_000). On timeout the child is killed and the call rejects. */
  timeoutMs?: number;
  /** Override the CLI binary path. Default: `claude` from PATH. */
  binPath?: string;
};

export class ClaudeCliError extends Error {
  constructor(
    message: string,
    public readonly stage: 'spawn' | 'timeout' | 'exit' | 'parse' | 'validate',
    public readonly stdout?: string,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = 'ClaudeCliError';
  }
}

/**
 * Run a Claude CLI request and parse the response as JSON validated against the given schema.
 *
 * @param userPrompt  The actual prompt (will be wrapped with JSON-only directive)
 * @param schema      Zod schema describing the expected JSON shape
 * @param example     A JSON example matching the schema, used to anchor Claude's output
 * @param opts        Timeout / binPath overrides
 */
export async function callClaudeJson<T>(
  userPrompt: string,
  schema: ZodSchema<T>,
  example: T,
  opts: ClaudeCliOptions = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const bin = opts.binPath ?? 'claude';

  const wrapped = [
    'ROLE: JSON RESPONDER. NO PROSE. NO MARKDOWN. NO COMMENTS.',
    'Return ONLY one valid JSON object that matches the schema implied by the example.',
    'Do not wrap in code fences. Do not add explanations.',
    '',
    'Example output (shape only, content must reflect the user request):',
    JSON.stringify(example, null, 2),
    '',
    'User request:',
    userPrompt,
  ].join('\n');

  return await new Promise<T>((resolve, reject) => {
    const child = spawn(bin, ['--print', '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new ClaudeCliError(
          `Claude CLI timed out after ${timeoutMs}ms`,
          'timeout',
          stdout,
          stderr,
        ),
      );
    }, timeoutMs);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new ClaudeCliError(`spawn failed: ${err.message}`, 'spawn'));
    });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        reject(
          new ClaudeCliError(
            `Claude CLI exited with code ${code}`,
            'exit',
            stdout,
            stderr,
          ),
        );
        return;
      }

      // Strip any non-JSON wrapping (occasional code fences or leading prose despite the directive)
      const cleaned = extractJsonObject(stdout);
      if (!cleaned) {
        reject(
          new ClaudeCliError(
            'no JSON object found in CLI output',
            'parse',
            stdout,
            stderr,
          ),
        );
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        reject(
          new ClaudeCliError(
            `JSON.parse failed: ${(e as Error).message}`,
            'parse',
            cleaned,
            stderr,
          ),
        );
        return;
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        reject(
          new ClaudeCliError(
            `schema validation failed: ${result.error.message}`,
            'validate',
            cleaned,
            stderr,
          ),
        );
        return;
      }

      resolve(result.data as T);
    });

    child.stdin.write(wrapped);
    child.stdin.end();
  });
}

/**
 * Extract the first balanced JSON object from a possibly-noisy string.
 * Returns the JSON substring or null if none found.
 */
function extractJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inStr = false; }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}
