import type { ChatAttachment } from '../types';

export const MAX_ATTACHMENTS = 6;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_TOTAL_DATA_URL_CHARS = 4_000_000;

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.82;
const VIDEO_FRAME_COUNT = 3;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v|ogv|ogg)$/i;

export type AttachmentKind = 'image' | 'video' | 'unsupported';

/**
 * Ollama's chat API accepts images only. Videos are sampled into frames in the
 * browser; arbitrary files (PDF, archives, etc.) are rejected explicitly.
 */
export function attachmentKind(file: File): AttachmentKind {
  if (file.type.startsWith('image/') || (!file.type && IMAGE_EXTENSIONS.test(file.name))) {
    return 'image';
  }
  if (file.type.startsWith('video/') || (!file.type && VIDEO_EXTENSIONS.test(file.name))) {
    return 'video';
  }
  return 'unsupported';
}

export function isSupportedAttachment(file: File): boolean {
  return attachmentKind(file) !== 'unsupported';
}

function createAttachmentId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `attachment-${cryptoApi.randomUUID()}`;
  }
  return `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function canvasToJpeg(source: CanvasImageSource, width: number, height: number): string {
  if (!width || !height) throw new Error('无法读取图片尺寸。');
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建图片画布。');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

async function imageToJpeg(file: File): Promise<string> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        return canvasToJpeg(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    } catch {
      // Fall through to the <img> decoder for formats the bitmap decoder rejects.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('无法读取图片文件。'));
      image.src = url;
    });
    return canvasToJpeg(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function waitForMediaEvent(
  video: HTMLVideoElement,
  event: 'loadeddata' | 'seeked',
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('读取视频超时。'));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(event, handleEvent);
      video.removeEventListener('error', handleError);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('浏览器无法解码这个视频，请换 MP4/WebM。'));
    };
    video.addEventListener(event, handleEvent, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

async function videoToFrames(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  video.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(video);

  try {
    await waitForMediaEvent(video, 'loadeddata', 15000);
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('无法读取视频尺寸。');
    }

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const times =
      duration > 0.4
        ? Array.from(
            new Set(
              [0.05, duration / 2, Math.max(duration - 0.05, 0)].map((time) =>
                Math.min(Math.max(time, 0), Math.max(duration - 0.05, 0))
              )
            )
          )
        : [0];

    const frames: string[] = [];
    for (const time of times.slice(0, VIDEO_FRAME_COUNT)) {
      if (time > 0) {
        video.currentTime = time;
        await waitForMediaEvent(video, 'seeked', 8000);
      }
      frames.push(canvasToJpeg(video, video.videoWidth, video.videoHeight));
    }
    return frames;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}

export async function createAttachment(file: File): Promise<ChatAttachment> {
  const kind = attachmentKind(file);
  if (kind === 'unsupported') {
    throw new Error('仅支持图片或视频；Ollama 聊天接口不接受 PDF、压缩包或任意文件。');
  }

  if (kind === 'image') {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error('图片超过 20 MB，请选择更小的文件。');
    }
    const dataUrl = await imageToJpeg(file);
    return {
      id: createAttachmentId(),
      kind,
      name: file.name || 'image',
      mimeType: file.type || 'image/jpeg',
      dataUrls: [dataUrl]
    };
  }

  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error('视频超过 100 MB，请选择更小的文件。');
  }
  const dataUrls = await videoToFrames(file);
  return {
    id: createAttachmentId(),
    kind,
    name: file.name || 'video',
    mimeType: file.type || 'video/mp4',
    dataUrls
  };
}

/** Converts stored data URLs to the raw base64 strings Ollama expects. */
export function attachmentImages(attachments: ChatAttachment[]): string[] {
  return attachments
    .flatMap((attachment) =>
      attachment.dataUrls.map((dataUrl) => {
        const comma = dataUrl.indexOf(',');
        return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      })
    )
    .filter(Boolean);
}

export function attachmentDataSize(attachments: ChatAttachment[]): number {
  return attachments.reduce(
    (total, attachment) =>
      total + attachment.dataUrls.reduce((sum, dataUrl) => sum + dataUrl.length, 0),
    0
  );
}
