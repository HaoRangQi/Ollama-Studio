import type { Language } from '../copy';

const KNOWN_PARAMETERS = new Set([
  'temperature',
  'top_p',
  'top_k',
  'num_ctx',
  'num_predict',
  'repeat_penalty',
  'repeat_last_n',
  'seed',
  'stop',
  'mirostat',
  'mirostat_tau',
  'mirostat_eta',
  'presence_penalty',
  'frequency_penalty'
]);

const NUMERIC_PARAMETERS = new Set([
  'temperature',
  'top_p',
  'top_k',
  'num_ctx',
  'num_predict',
  'repeat_penalty',
  'repeat_last_n',
  'seed',
  'mirostat',
  'mirostat_tau',
  'mirostat_eta',
  'presence_penalty',
  'frequency_penalty'
]);

export interface ParsedModelfile {
  from: string;
  parameters: Record<string, string>;
  instructions: string[];
  system: string;
  template: string;
  tripleQuotesBalanced: boolean;
}

/** 逐行解析 Modelfile；SYSTEM/TEMPLATE 支持三引号跨行。 */
export function parseModelfile(text: string): ParsedModelfile {
  const parameters: Record<string, string> = {};
  const instructions: string[] = [];
  let from = '';
  let system = '';
  let template = '';

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\s*([A-Za-z]+)\b(.*)$/);
    if (!match) continue;
    const instruction = match[1].toUpperCase();
    const rest = match[2].trim();
    instructions.push(instruction);

    if (instruction === 'FROM') {
      from = rest;
    } else if (instruction === 'PARAMETER') {
      const param = rest.match(/^(\S+)\s+(.+)$/);
      if (param) parameters[param[1].toLowerCase()] = param[2].trim();
    } else if (instruction === 'SYSTEM' || instruction === 'TEMPLATE') {
      let value = rest;
      if (value.startsWith('"""')) {
        let body = value.slice(3);
        if (body.includes('"""')) {
          body = body.slice(0, body.indexOf('"""'));
        } else {
          const chunks = [body];
          for (let next = index + 1; next < lines.length; next += 1) {
            const candidate = lines[next];
            const close = candidate.indexOf('"""');
            if (close >= 0) {
              chunks.push(candidate.slice(0, close));
              index = next;
              break;
            }
            chunks.push(candidate);
          }
          body = chunks.join('\n');
        }
        value = body;
      }
      if (instruction === 'SYSTEM') system = value;
      else template = value;
    }
  }

  return {
    from,
    parameters,
    instructions,
    system,
    template,
    tripleQuotesBalanced: (text.match(/"""/g)?.length ?? 0) % 2 === 0
  };
}

export function getParameter(text: string, name: string): string | undefined {
  return parseModelfile(text).parameters[name.toLowerCase()];
}

/** 更新已有 PARAMETER；缺失时插到 FROM 之后。 */
export function setParameter(text: string, name: string, value: string): string {
  const normalized = name.toLowerCase();
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const pattern = new RegExp(`^(\\s*PARAMETER\\s+${normalized}\\s+).*$`, 'i');
  let replaced = false;

  const next = lines.map((line) => {
    if (!replaced && pattern.test(line)) {
      replaced = true;
      return `${line.match(/^\s*/)?.[0] ?? ''}PARAMETER ${normalized} ${value}`;
    }
    return line;
  });

  if (replaced) return next.join('\n');

  const fromIndex = next.findIndex((line) => /^\s*FROM\b/i.test(line));
  const insertAt = fromIndex >= 0 ? fromIndex + 1 : next.length;
  next.splice(insertAt, 0, `PARAMETER ${normalized} ${value}`);
  return next.join('\n');
}

/** 统一指令大小写、去掉行尾空白、压缩连续空行。 */
export function formatModelfile(text: string): string {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const match = line.match(/^(\s*)([A-Za-z]+)(\b.*)$/);
      if (!match) return line.replace(/\s+$/, '');
      return `${match[1]}${match[2].toUpperCase()}${match[3]}`.replace(/\s+$/, '');
    });

  const output: string[] = [];
  let blank = 0;
  for (const line of lines) {
    if (!line.trim()) {
      blank += 1;
      if (blank > 1) continue;
    } else {
      blank = 0;
    }
    output.push(line);
  }
  while (output.length > 0 && !output[output.length - 1].trim()) output.pop();
  return `${output.join('\n')}\n`;
}

export function starterModelfile(base: string, system = ''): string {
  const prompt =
    system.trim() ||
    'You are a patient, restrained local AI assistant. Answer concisely and prefer actionable steps.';
  return `# Created in Ollama Studio · UI3
FROM ${base}
PARAMETER temperature 0.70
PARAMETER top_p 0.90
PARAMETER num_ctx 8192
PARAMETER num_predict 1024

SYSTEM """
${prompt}
"""
`;
}

export interface ValidationIssue {
  tone: 'ok' | 'warn' | 'error';
  text: string;
}

/** 构建前的本地检查；真正的错误仍以 Ollama create 的返回为准。 */
export function validateModelfile(
  text: string,
  options: { modelName: string; installed: string[]; language: Language }
): { issues: ValidationIssue[]; ok: boolean } {
  const zh = options.language === 'zh';
  const parsed = parseModelfile(text);
  const issues: ValidationIssue[] = [];
  const name = options.modelName.trim();

  if (!name) {
    issues.push({ tone: 'error', text: zh ? '缺少模型名称。' : 'Model name is required.' });
  } else if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(name)) {
    issues.push({
      tone: 'warn',
      text: zh
        ? '模型名称包含非常规字符；Ollama 可能拒绝。'
        : 'The model name contains unusual characters; Ollama may reject it.'
    });
  }

  if (!parsed.from) {
    issues.push({
      tone: 'error',
      text: zh
        ? '缺少 FROM：Modelfile 必须指定基座模型。'
        : 'Missing FROM: a Modelfile needs a base model.'
    });
  } else {
    const installed = options.installed.includes(parsed.from);
    issues.push({
      tone: 'ok',
      text: zh ? `FROM ${parsed.from}` : `FROM ${parsed.from}`
    });
    if (!installed) {
      issues.push({
        tone: 'warn',
        text: zh
          ? `本地未找到 ${parsed.from}；构建前请先拉取基座。`
          : `${parsed.from} is not installed locally; pull the base first.`
      });
    }
  }

  if (!parsed.tripleQuotesBalanced) {
    issues.push({
      tone: 'error',
      text: zh ? '三引号 """ 数量不成对。' : 'Triple quotes """ are unbalanced.'
    });
  }

  for (const [key, value] of Object.entries(parsed.parameters)) {
    if (!KNOWN_PARAMETERS.has(key)) {
      issues.push({
        tone: 'warn',
        text: zh ? `未知参数：${key}` : `Unknown parameter: ${key}`
      });
      continue;
    }
    if (NUMERIC_PARAMETERS.has(key)) {
      const first = key === 'stop' ? '0' : value.split(/\s+/)[0];
      if (!Number.isFinite(Number(first))) {
        issues.push({
          tone: 'error',
          text: zh
            ? `参数 ${key} 需要数字，当前为 ${value}`
            : `${key} expects a number, got ${value}`
        });
      }
    }
  }

  const parameterCount = Object.keys(parsed.parameters).length;
  if (parameterCount > 0) {
    issues.push({
      tone: 'ok',
      text: zh
        ? `解析到 ${parameterCount} 条 PARAMETER`
        : `Parsed ${parameterCount} PARAMETER instruction${parameterCount === 1 ? '' : 's'}`
    });
  }

  if (parsed.system) {
    const chars = parsed.system.length;
    const tokens = Math.max(1, Math.ceil(chars / 4));
    issues.push({
      tone: 'ok',
      text: zh
        ? `SYSTEM 提示约 ${chars} 字符（≈ ${tokens} tokens）`
        : `SYSTEM prompt is ${chars} chars (≈ ${tokens} tokens)`
    });
  }

  const contextValue = Number(parsed.parameters.num_ctx);
  if (Number.isFinite(contextValue) && contextValue > 0) {
    if (contextValue > 32768) {
      issues.push({
        tone: 'warn',
        text: zh
          ? `num_ctx ${contextValue} 偏大；请确认显存/内存足够。`
          : `num_ctx ${contextValue} is large; make sure memory is sufficient.`
      });
    } else {
      issues.push({
        tone: 'ok',
        text: zh ? `上下文 ${contextValue} tokens` : `Context window ${contextValue} tokens`
      });
    }
  }

  return { issues, ok: issues.every((issue) => issue.tone !== 'error') };
}

/** 编辑器语法高亮用的逐行 token 化。 */
export type Token = { text: string; tone: 'plain' | 'instr' | 'str' | 'num' | 'comment' | 'var' };

export function tokenizeModelfileLine(line: string): Token[] {
  if (/^\s*#/.test(line)) return [{ text: line, tone: 'comment' }];
  const match = line.match(/^(\s*)([A-Za-z]+)(\b.*)$/);
  const instruction = match?.[2].toUpperCase();
  const rest = match ? match[3] : line;
  const prefix = match ? `${match[1]}${instruction}` : '';
  const tokens: Token[] = [];
  if (prefix) tokens.push({ text: prefix, tone: 'instr' });

  const pattern = /("(?:[^"\\]|\\.)*"|\{\{[^}]*\}\}|\b\d+(?:\.\d+)?\b)/g;
  let cursor = 0;
  let found: RegExpExecArray | null;
  while ((found = pattern.exec(rest)) !== null) {
    if (found.index > cursor) {
      tokens.push({ text: rest.slice(cursor, found.index), tone: 'plain' });
    }
    const value = found[0];
    const tone = value.startsWith('"') ? 'str' : value.startsWith('{{') ? 'var' : 'num';
    tokens.push({ text: value, tone });
    cursor = found.index + value.length;
  }
  if (cursor < rest.length) tokens.push({ text: rest.slice(cursor), tone: 'plain' });
  return tokens;
}
