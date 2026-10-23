import type { Project } from '../engine/types';
import { drawAt } from './draw';

/** Real-alpha video formats (MP4/H.264 has no alpha plane, so these use other containers). */
export type AlphaFormat = 'webm' | 'mov';

const CORE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Renders transparent frames, then encodes them with ffmpeg.wasm (downloaded on first use, ~30 MB, runs in the browser):
 *  - webm: VP8 with alpha (yuva420p) – plays in Chrome / Edge / Firefox, small files
 *  - mov:  ProRes 4444 with alpha – the standard for After Effects / Premiere / Final Cut / DaVinci, large files
 */
export async function exportAlphaVideo(
  project: Project,
  opts: { width: number; height: number; fps: number; format: AlphaFormat },
  onProgress: (label: string, p: number) => void,
  signal: { cancelled: boolean },
): Promise<{ blob: Blob; filename: string }> {
  const { width: W, height: H, fps, format } = opts;
  const total = Math.ceil((project.timeline.duration / 1000) * fps);

  onProgress('인코더 불러오는 중… (처음 한 번만, 약 30MB)', 0);
  const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
  const ff = new FFmpeg();
  let phase: 'frames' | 'encode' = 'frames';
  ff.on('progress', ({ progress }) => { if (phase === 'encode') onProgress('인코딩 중…', 0.5 + Math.min(1, Math.max(0, progress)) * 0.5); });
  try {
    await ff.load({
      coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
  } catch {
    throw new Error('인코더를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
  }

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  try {
    for (let i = 0; i < total; i++) {
      if (signal.cancelled) throw new Error('취소됨');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawAt(ctx, W, H, project, (i * 1000) / fps, 'transparent');
      const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('프레임 변환 실패'))), 'image/png'));
      await ff.writeFile(`f${String(i + 1).padStart(5, '0')}.png`, new Uint8Array(await blob.arrayBuffer()));
      if (i % 4 === 0) { onProgress('프레임 그리는 중…', (i / total) * 0.5); await tick(); }
    }
    phase = 'encode';
    onProgress('인코딩 중…', 0.5);
    const out = format === 'webm' ? 'out.webm' : 'out.mov';
    const codec = format === 'webm'
      ? ['-c:v', 'libvpx', '-pix_fmt', 'yuva420p', '-b:v', '2M', '-crf', '12', '-auto-alt-ref', '0', '-deadline', 'realtime', '-cpu-used', '5']
      : ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0'];
    const code = await ff.exec(['-framerate', String(fps), '-i', 'f%05d.png', ...codec, '-y', out]);
    if (code !== 0) throw new Error('인코딩에 실패했어요.');
    const data = (await ff.readFile(out)) as Uint8Array;
    onProgress('완료', 1);
    return {
      blob: new Blob([data as BlobPart], { type: format === 'webm' ? 'video/webm' : 'video/quicktime' }),
      filename: format === 'webm' ? 'robot-eyes_alpha.webm' : 'robot-eyes_alpha_prores4444.mov',
    };
  } finally {
    ff.terminate();
  }
}
