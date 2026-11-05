export interface MessageSegment {
  type: 'text' | 'code';
  content: string;
  language?: string;
}

const FENCE = /^```([^\n`]*)$/;

/**
 * Splits an assistant reply into plain text and fenced code blocks so the UI
 * can render code with its own copy button. An unterminated fence is treated
 * as a code block running to the end of the message.
 */
export function parseMessageSegments(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const lines = content.split('\n');
  let textLines: string[] = [];
  let codeLines: string[] | null = null;
  let language = '';

  const flushText = () => {
    if (textLines.length === 0) return;
    const text = textLines.join('\n');
    textLines = [];
    if (text.trim()) segments.push({ type: 'text', content: text });
  };

  const flushCode = () => {
    if (codeLines === null) return;
    segments.push({
      type: 'code',
      content: codeLines.join('\n'),
      language: language || undefined
    });
    codeLines = null;
    language = '';
  };

  for (const line of lines) {
    if (codeLines === null) {
      const match = FENCE.exec(line.trimEnd());
      if (match) {
        flushText();
        language = match[1].trim();
        codeLines = [];
      } else {
        textLines.push(line);
      }
    } else if (/^```\s*$/.test(line)) {
      flushCode();
    } else {
      codeLines.push(line);
    }
  }

  if (codeLines !== null) {
    flushCode();
  } else {
    flushText();
  }

  return segments;
}
