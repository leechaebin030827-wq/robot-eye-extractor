import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { zipSync } from 'fflate';
import type { Project } from '../engine/types';
import { drawAt } from './draw';

export const mp4Supported = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

/** 'mp4' = solid background · 'stacked' = MP4 with the alpha matte stored beside the picture · 'png' = transparent PNG sequence (ZIP) */
export type ExportKind = 'mp4' | 'stacked' | 'png' | 'frame' | 'frameBg';
/** kinds that render without a background colour */
export const isTransparentKind = (k: ExportKind) => k === 'stacked' || k === 'png' || k === 'frame';

interface Opts { width: number; height: number; fps: number; bg: string; kind: ExportKind; t?: number }

const tick = () => new Promise((r) => setTimeout(r, 0));

function frameCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, ctx: c.getContext('2d', { willReadFrequently: true })! };
}

/**
 * Deterministic offline render: every frame is drawn at an exact time.
 *  - mp4:     H.264, solid background colour.
 *  - stacked: H.264 at 2× width — LEFT = colour (premultiplied on black), RIGHT = alpha matte (white = opaque).
 *             A normal MP4 (H.264 cannot carry a real alpha channel); key it with the matte in your editor / shader.
 *  - png:     lossless PNG frames with real transparency, zipped.
 */
export async function exportVideo(project: Project, opts: Opts, onProgress: (p: number) => void, signal: { cancelled: boolean }): Promise<{ blob: Blob; filename: string }> {
  const { width: W, height: H, fps, kind } = opts;
  const total = Math.ceil((project.timeline.duration / 1000) * fps);
  const transparent = kind !== 'mp4' && kind !== 'frameBg';
  const src = frameCanvas(W, H);

  if (kind === 'frame' || kind === 'frameBg') {
    // single still of the current playhead frame
    drawAt(src.ctx, W, H, project, opts.t ?? 0, kind === 'frame' ? 'transparent' : opts.bg);
    const blob: Blob = await new Promise((res, rej) => src.c.toBlob((b) => (b ? res(b) : rej(new Error('PNG 변환 실패'))), 'image/png'));
    onProgress(1);
    return { blob, filename: `robot-eyes_${Math.round(opts.t ?? 0)}ms${kind === 'frame' ? '_alpha' : ''}.png` };
  }

  if (kind === 'png') {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < total; i++) {
      if (signal.cancelled) throw new Error('취소됨');
      src.ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawAt(src.ctx, W, H, project, (i * 1000) / fps, 'transparent');
      const blob: Blob = await new Promise((res, rej) => src.c.toBlob((b) => (b ? res(b) : rej(new Error('PNG 변환 실패'))), 'image/png'));
      files[`frame_${String(i + 1).padStart(4, '0')}.png`] = new Uint8Array(await blob.arrayBuffer());
      if (i % 4 === 0) { onProgress((i / total) * 0.95); await tick(); }
    }
    const zip = zipSync(files, { level: 0 });
    onProgress(1);
    return { blob: new Blob([zip as BlobPart], { type: 'application/zip' }), filename: `robot-eyes-alpha_${fps}fps.zip` };
  }

  if (!mp4Supported()) throw new Error('이 브라우저는 MP4 내보내기를 지원하지 않습니다. 최신 Chrome / Edge / Safari 를 사용하세요.');
  const outW = kind === 'stacked' ? W * 2 : W;
  const comp = kind === 'stacked' ? frameCanvas(outW, H) : src;
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: outW, height: H }, fastStart: 'in-memory' });
  let error: unknown = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { error = e; } });
  const area = outW * H;
  const level = area > 2_300_000 ? 'avc1.640033' : area > 920_000 ? 'avc1.640032' : 'avc1.64001f';
  const config: VideoEncoderConfig = { codec: level, width: outW, height: H, bitrate: area * fps * 0.12, framerate: fps };
  const sup = await VideoEncoder.isConfigSupported(config);
  if (!sup.supported) throw new Error('이 브라우저는 이 크기의 H.264 인코딩을 지원하지 않습니다. 해상도를 낮추거나 최신 Chrome / Edge / Safari 를 사용하세요.');
  encoder.configure(config);

  for (let i = 0; i < total; i++) {
    if (signal.cancelled) { encoder.close(); throw new Error('취소됨'); }
    if (error) throw error;
    src.ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawAt(src.ctx, W, H, project, (i * 1000) / fps, transparent ? 'transparent' : opts.bg);
    if (kind === 'stacked') {
      const cx = comp.ctx;
      cx.fillStyle = '#000'; cx.fillRect(0, 0, outW, H);
      cx.drawImage(src.c, 0, 0);                       // colour composited over black (= premultiplied)
      const px = src.ctx.getImageData(0, 0, W, H);      // alpha → grayscale matte on the right half
      const d = px.data;
      for (let k = 0; k < d.length; k += 4) { const a = d[k + 3]; d[k] = a; d[k + 1] = a; d[k + 2] = a; d[k + 3] = 255; }
      cx.putImageData(px, W, 0);
    }
    const frame = new VideoFrame(comp.c, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    if (encoder.encodeQueueSize > 8) await tick();
    if (i % 5 === 0) { onProgress(i / total); await tick(); }
  }
  await encoder.flush();
  muxer.finalize();
  encoder.close();
  onProgress(1);
  return {
    blob: new Blob([(muxer.target as ArrayBufferTarget).buffer], { type: 'video/mp4' }),
    filename: kind === 'stacked' ? 'robot-eyes_alpha-stacked.mp4' : 'robot-eyes.mp4',
  };
}
