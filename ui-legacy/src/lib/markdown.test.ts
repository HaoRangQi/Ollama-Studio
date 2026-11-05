import { describe, expect, it } from 'vitest';
import { parseMessageSegments } from './markdown';

describe('parseMessageSegments', () => {
  it('returns a single text segment for plain content', () => {
    expect(parseMessageSegments('hello world')).toEqual([{ type: 'text', content: 'hello world' }]);
  });

  it('parses a fenced code block with a language', () => {
    const segments = parseMessageSegments('Here is code:\n```ts\nconst a = 1;\n```\nDone.');
    expect(segments).toEqual([
      { type: 'text', content: 'Here is code:' },
      { type: 'code', content: 'const a = 1;', language: 'ts' },
      { type: 'text', content: 'Done.' }
    ]);
  });

  it('parses multiple code blocks and keeps empty-language blocks', () => {
    const segments = parseMessageSegments('```\na\n```\nmiddle\n```python\nb\n```');
    expect(segments.map((segment) => segment.type)).toEqual(['code', 'text', 'code']);
    expect(segments[0].language).toBeUndefined();
    expect(segments[2].language).toBe('python');
  });

  it('treats an unterminated fence as code to the end', () => {
    const segments = parseMessageSegments('before\n```js\nconst a = 1;');
    expect(segments).toEqual([
      { type: 'text', content: 'before' },
      { type: 'code', content: 'const a = 1;', language: 'js' }
    ]);
  });

  it('drops whitespace-only text segments', () => {
    expect(parseMessageSegments('\n\n```js\nx\n```\n\n')).toEqual([
      { type: 'code', content: 'x', language: 'js' }
    ]);
  });
});
