import type { IncomingMessage } from 'node:http';
import { GgufImportError } from './importGguf';

const MAX_JSON_BODY = 64 * 1024;

/** 读取并解析小体积 JSON 请求体（本地接口只收配置参数，不收文件）。 */
export async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_JSON_BODY) throw new GgufImportError('请求体过大。', 413);
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new GgufImportError('请求体不是合法 JSON。', 400);
  }
}
