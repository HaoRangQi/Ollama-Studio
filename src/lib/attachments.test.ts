import { describe, expect, it } from 'vitest';
import type { ChatAttachment } from '../types';
import {
  attachmentDataSize,
  attachmentImages,
  attachmentKind,
  isSupportedAttachment
} from './attachments';

function file(name: string, type: string): File {
  return new File(['x'], name, { type });
}

describe('attachmentKind', () => {
  it('accepts images and videos by MIME type', () => {
    expect(attachmentKind(file('photo.png', 'image/png'))).toBe('image');
    expect(attachmentKind(file('clip.mp4', 'video/mp4'))).toBe('video');
  });

  it('falls back to the extension when the MIME type is empty', () => {
    expect(attachmentKind(file('photo.webp', ''))).toBe('image');
    expect(attachmentKind(file('clip.webm', ''))).toBe('video');
  });

  it('rejects PDFs and arbitrary files', () => {
    expect(attachmentKind(file('paper.pdf', 'application/pdf'))).toBe('unsupported');
    expect(isSupportedAttachment(file('archive.zip', 'application/zip'))).toBe(false);
  });
});

describe('attachmentImages', () => {
  const attachments: ChatAttachment[] = [
    {
      id: 'a',
      kind: 'image',
      name: 'a.png',
      mimeType: 'image/png',
      dataUrls: ['data:image/jpeg;base64,AAAA']
    },
    {
      id: 'b',
      kind: 'video',
      name: 'b.mp4',
      mimeType: 'video/mp4',
      dataUrls: ['data:image/jpeg;base64,BBBB', 'data:image/jpeg;base64,CCCC']
    }
  ];

  it('flattens video frames and strips data URL prefixes', () => {
    expect(attachmentImages(attachments)).toEqual(['AAAA', 'BBBB', 'CCCC']);
  });

  it('returns raw base64 unchanged', () => {
    expect(attachmentImages([{ ...attachments[0], dataUrls: ['AAAA'] }])).toEqual(['AAAA']);
  });

  it('sums data URL lengths for quota checks', () => {
    expect(attachmentDataSize(attachments)).toBe(81);
  });
});
