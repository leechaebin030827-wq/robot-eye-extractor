import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { Project } from '../engine/types';
import { drawAt } from './draw';

export const mp4Supported = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

/** Deterministic offline render: every frame is drawn at an exact time and encoded to H.264 MP4. */
export async function exportMp4(project: Project, opts: { width: number; height: number; fps: number; bg: string }, onProgress: (p: number) => void, signal: { cancelled: boolean }): Promise<Blob> {
  const { width, height, fps } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width, height }, fastStart: 'in-memory' });
  let error: unknown = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { error = e; } });
  const level = width * height > 1280 * 720 ? 'avc1.640032' : 'avc1.64001f';
  const config: VideoEncoderConfig = { codec: level, width, height, bitrate: width * height * fps * 0.12, framerate: fps };
  const sup = await VideoEncoder.isConfigSupported(config);
  if (!sup.supported) throw new Error('이 브라우저는 H.264 인코딩을 지원하지 않습니다. 최신 Chrome / Edge / Safari 를 사용하세요.');
  encoder.configure(config);

  const total = Math.ceil((project.timeline.duration / 1000) * fps);
  for (let i = 0; i < total; i++) {
    if (signal.cancelled) { encoder.close(); throw new Error('취소됨'); }
    if (error) throw error;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawAt(ctx, width, height, project, (i * 1000) / fps, opts.bg);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
    if (i % 5 === 0) { onProgress(i / total); await new Promise((r) => setTimeout(r, 0)); }
  }
  await encoder.flush();
  muxer.finalize();
  encoder.close();
  onProgress(1);
  return new Blob([(muxer.target as ArrayBufferTarget).buffer], { type: 'video/mp4' });
}
