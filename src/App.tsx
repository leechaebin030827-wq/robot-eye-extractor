import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ASSETS, ASSET_BY_ID, buildProject, defaultSequence, newBlock, totalMs, type Asset, type Sequence } from './studio/assets';
import { drawAt } from './studio/draw';
import { exportMp4, mp4Supported } from './studio/exportMp4';
import { EyeEditor } from './studio/EyeEditor';
import { isValidPattern } from './engine/patterns';
import { presetEyePattern } from './studio/assets';

const KEY = 'lieu-eye-studio:sequence:v2';
const PX = 64; // px per second in the strip
const MIN_W = 76;

const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

function load(): Sequence {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (o && Array.isArray(o.blocks)) {
      const blocks = o.blocks.filter((b: { assetId?: string; seconds?: number }) => b && ASSET_BY_ID[b.assetId ?? ''] && Number.isFinite(b.seconds))
        .map((b: { id: string; assetId: string; seconds: number }) => ({ id: String(b.id), assetId: b.assetId, seconds: Math.min(60, Math.max(0.1, b.seconds)) }));
      return { blocks, blend: Number.isFinite(o.blend) ? Math.min(1200, Math.max(0, o.blend)) : 450, eyeColor: o.bg === undefined ? '#FFFFFF' : hex(o.eyeColor, '#FFFFFF'), bg: hex(o.bg, '#000000'), mode: o.mode === 'freeform' ? 'freeform' : 'matrix', shape: o.shape === 'long' ? 'long' : 'round', spacing: Number.isFinite(o.spacing) ? Math.min(250, Math.max(30, o.spacing)) : 115, custom: o.custom && isValidPattern(o.custom.left) && isValidPattern(o.custom.right) ? { left: o.custom.left, right: o.custom.right } : null, useCustom: o.useCustom === true && !!o.custom };
    }
  } catch { /* fall through */ }
  return defaultSequence();
}

/** All visible chips share one low-rate loop so dozens of animated thumbnails stay cheap. */
const thumbTasks = new Set<(now: number) => void>();
let thumbTimer = 0;
function registerThumb(fn: (now: number) => void) {
  thumbTasks.add(fn);
  if (!thumbTimer) thumbTimer = window.setInterval(() => { if (!document.hidden) { const n = performance.now(); thumbTasks.forEach((f) => f(n)); } }, 1000 / 14);
  return () => { thumbTasks.delete(fn); if (!thumbTasks.size) { clearInterval(thumbTimer); thumbTimer = 0; } };
}

/** Animated chip: replays the asset (from the default eye) in a loop using the current style. */
function Thumb({ asset, base, aspect }: { asset: Asset; base: Sequence; aspect: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { mode, eyeColor, bg, shape, custom, useCustom } = base;
  useEffect(() => {
    const c = ref.current!;
    const W = 120, H = Math.round(120 / aspect), dpr = 2;
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    const seq: Sequence = { blocks: [newBlock('mood-default'), { id: 'x', assetId: asset.id, seconds: asset.seconds }], blend: 300, eyeColor, bg, mode, shape, spacing: 115, custom, useCustom };
    const p = buildProject(seq);
    p.shared.autoBlink = false; p.shared.idle = false; p.shared.microSaccade = 0;
    const from = 3000 - 500, span = 500 + Math.min(asset.seconds * 1000, 3200) + 400;
    const offset = Math.random() * span;
    return registerThumb((now) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawAt(ctx, W, H, p, from + ((now + offset) % span), bg, true);
    });
  }, [asset, mode, eyeColor, bg, shape, custom, useCustom, aspect]);
  return <canvas ref={ref} className="thumb" style={{ aspectRatio: String(aspect) }} />;
}

const ICONS: Record<string, string> = {
  play: 'M8 5v14l11-7z', pause: 'M7 5h4v14H7zM13 5h4v14h-4z', rewind: 'M6 5h2v14H6zM20 5v14L9 12z',
  plus: 'M12 5v14M5 12h14', trash: 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12', copy: 'M9 9h10v10H9zM5 15V5h10',
  left: 'M15 6l-6 6 6 6', right: 'M9 6l6 6-6 6', close: 'M6 6l12 12M18 6L6 18', export: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  grid: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z', blob: 'M12 5c4.6 0 8.5 2.4 8.5 7s-3.9 7-8.5 7-8.5-2.4-8.5-7S7.4 5 12 5z', eyeRound: 'M7.2 8.2a3.8 3.8 0 100 7.6 3.8 3.8 0 000-7.6zM16.8 8.2a3.8 3.8 0 100 7.6 3.8 3.8 0 000-7.6z', eyeLong: 'M6.6 4.5h1.2a2.2 2.2 0 012.2 2.2v10.6a2.2 2.2 0 01-2.2 2.2H6.6a2.2 2.2 0 01-2.2-2.2V6.7a2.2 2.2 0 012.2-2.2zM16.2 4.5h1.2a2.2 2.2 0 012.2 2.2v10.6a2.2 2.2 0 01-2.2 2.2h-1.2A2.2 2.2 0 0114 17.3V6.7a2.2 2.2 0 012.2-2.2z',
  check: 'M5 12.5l4.5 4.5L19 7', sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19', moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z', pen: 'M4 20l4-1 11-11-3-3L5 16z',
};
const FILLED = new Set(['play', 'pause', 'rewind', 'grid', 'blob', 'eyeRound', 'eyeLong']);
function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={FILLED.has(name) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

const TAB_INFO: Record<Asset['group'], { icon: string; hint: string }> = {
  감정: { icon: '🙂', hint: '표정을 유지해요' },
  동작: { icon: '🎬', hint: '움직이는 연기' },
  시선: { icon: '👀', hint: '눈동자 방향' },
  이모지: { icon: '😍', hint: '하트·별 같은 눈' },
};

const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function App() {
  const [seq, setSeq] = useState<Sequence>(load);
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [exportState, setExportState] = useState<null | { p: number }>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [res, setRes] = useState('1280x720');
  const [preview, setPreview] = useState<Asset | null>(null);
  const [editEye, setEditEye] = useState(false);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [tab, setTab] = useState<Asset['group']>('감정');

  const aspect = useMemo(() => { const [w, h] = res.split('x').map(Number); return w / h; }, [res]);
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;
  const project = useMemo(() => buildProject(seq), [seq]);
  const projectRef = useRef(project);
  projectRef.current = project;
  const previewProject = useMemo(() => {
    if (!preview) return null;
    const p = buildProject({ ...seq, blocks: [{ id: 'pv', assetId: preview.id, seconds: preview.seconds }] });
    return p;
  }, [preview, seq.eyeColor, seq.mode, seq.blend, seq.shape, seq.spacing, seq.custom, seq.useCustom]); // eslint-disable-line react-hooks/exhaustive-deps
  const pvRef = useRef<{ project: ReturnType<typeof buildProject> | null; t: number }>({ project: null, t: 0 });
  if (pvRef.current.project !== previewProject) pvRef.current = { project: previewProject, t: 0 };
  const bgRef = useRef(seq.bg);
  bgRef.current = seq.bg;
  const tRef = useRef(0);
  const playRef = useRef(playing);
  playRef.current = playing;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cancel = useRef({ cancelled: false });

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(seq)); } catch { /* ignore */ } }, [seq]);

  const render = useCallback(() => {
    const c = canvasRef.current, w = wrapRef.current;
    if (!c || !w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // the frame has exactly the export aspect ratio, so preview == exported video framing
    const A = aspectRef.current;
    const fw = Math.floor(Math.min(w.clientWidth, w.clientHeight * A)), fh = Math.floor(fw / A);
    if (c.width !== Math.round(fw * dpr) || c.height !== Math.round(fh * dpr)) { c.width = Math.round(fw * dpr); c.height = Math.round(fh * dpr); }
    c.style.width = `${fw}px`; c.style.height = `${fh}px`;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pv = pvRef.current;
    if (pv.project) drawAt(ctx, fw, fh, pv.project, pv.t, bgRef.current);
    else drawAt(ctx, fw, fh, projectRef.current, tRef.current, bgRef.current);
  }, []);

  // single rAF loop
  useEffect(() => {
    let raf = 0, last = performance.now(), lastUi = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(64, now - last); last = now;
      if (pvRef.current.project) {
        pvRef.current.t += dt;
        // preview plays once, then we return to the main sequence
        if (pvRef.current.t >= pvRef.current.project.timeline.duration) { pvRef.current = { project: null, t: 0 }; setPreview(null); }
      } else if (playRef.current) {
        const d = projectRef.current.timeline.duration;
        tRef.current = (tRef.current + dt) % d;
      }
      render();
      if (now - lastUi > 60) { lastUi = now; setTime(tRef.current); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [render]);

  const starts = useMemo(() => { let t = 0; return seq.blocks.map((b) => { const s = t; t += b.seconds * 1000; return s; }); }, [seq.blocks]);
  const widths = seq.blocks.map((b) => Math.max(MIN_W, b.seconds * PX));
  const offsets = widths.reduce<number[]>((a, w, i) => { a.push(i ? a[i - 1] + widths[i - 1] : 0); return a; }, []);
  const playheadX = (() => {
    for (let i = seq.blocks.length - 1; i >= 0; i--) if (time >= starts[i]) return offsets[i] + Math.min(1, (time - starts[i]) / (seq.blocks[i].seconds * 1000)) * widths[i];
    return 0;
  })();

  const stripRef = useRef<HTMLDivElement>(null);
  const xToTime = (clientX: number) => {
    const x = clientX - stripRef.current!.getBoundingClientRect().left;
    for (let i = seq.blocks.length - 1; i >= 0; i--) {
      if (x >= offsets[i] || i === 0) return starts[i] + Math.max(0, Math.min(1, (x - offsets[i]) / widths[i])) * seq.blocks[i].seconds * 1000;
    }
    return 0;
  };
  const scrub = (e: React.PointerEvent) => {
    if (!seq.blocks.length) return;
    e.preventDefault();
    setPreview(null);
    const wasPlaying = playRef.current;
    setPlaying(false);
    const set = (cx: number) => { tRef.current = Math.min(xToTime(cx), projectRef.current.timeline.duration - 1); setTime(tRef.current); };
    set(e.clientX);
    const move = (ev: PointerEvent) => set(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (wasPlaying) setPlaying(true); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const update = (fn: (s: Sequence) => Sequence) => setSeq((s) => fn(s));
  const add = (a: Asset) => {
    const b = newBlock(a.id);
    update((s) => {
      const i = selected ? s.blocks.findIndex((x) => x.id === selected) : -1;
      const blocks = s.blocks.slice();
      blocks.splice(i >= 0 ? i + 1 : blocks.length, 0, b);
      return { ...s, blocks };
    });
    setSelected(b.id);
  };
  const sel = seq.blocks.find((b) => b.id === selected) ?? null;
  const selAsset = sel ? ASSET_BY_ID[sel.assetId] : null;
  const move = (dir: -1 | 1) => update((s) => {
    const i = s.blocks.findIndex((b) => b.id === selected), j = i + dir;
    if (i < 0 || j < 0 || j >= s.blocks.length) return s;
    const blocks = s.blocks.slice(); [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    return { ...s, blocks };
  });
  const remove = () => { update((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== selected) })); setSelected(null); };
  const duplicate = () => {
    if (!sel) return;
    const copy = { ...sel, id: newBlock(sel.assetId).id };
    update((s) => { const i = s.blocks.findIndex((b) => b.id === selected); const blocks = s.blocks.slice(); blocks.splice(i + 1, 0, copy); return { ...s, blocks }; });
    setSelected(copy.id);
  };
  // pointer-based block editing: drag body = move (drop away from the strip = delete), drag edges = trim/extend
  const [drag, setDrag] = useState<null | { id: string; dx: number; dy: number }>(null);
  const startBlockDrag = (e: React.PointerEvent, idx: number, mode: 'move' | 'l' | 'r') => {
    e.stopPropagation();
    e.preventDefault();
    const b = seq.blocks[idx], a = ASSET_BY_ID[b.assetId];
    setPreview(null);
    setSelected(b.id);
    const x0 = e.clientX, y0 = e.clientY, sec0 = b.seconds;
    let moved = false;
    const calc = (ev: PointerEvent) => ({ dx: ev.clientX - x0, dy: ev.clientY - y0 });
    const move = (ev: PointerEvent) => {
      const { dx, dy } = calc(ev);
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (mode === 'move') { setDrag({ id: b.id, dx, dy }); return; }
      const sec = Math.min(a.max * 1.5, Math.max(0.2, sec0 + (mode === 'r' ? dx : -dx) / PX));
      update((q) => ({ ...q, blocks: q.blocks.map((x) => (x.id === b.id ? { ...x, seconds: Math.round(sec * 10) / 10 } : x)) }));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const { dx, dy } = calc(ev);
      setDrag(null);
      if (mode !== 'move') return;
      if (!moved) { tRef.current = starts[idx]; setTime(starts[idx]); return; }
      if (Math.abs(dy) > 70) { update((q) => ({ ...q, blocks: q.blocks.filter((x) => x.id !== b.id) })); setSelected(null); return; }
      const center = offsets[idx] + widths[idx] / 2 + dx;
      const others = seq.blocks.map((x, k) => ({ x, c: offsets[k] + widths[k] / 2 })).filter((o) => o.x.id !== b.id);
      const to = others.filter((o) => o.c < center).length;
      update((q) => {
        const rest = q.blocks.filter((x) => x.id !== b.id);
        rest.splice(to, 0, b);
        return { ...q, blocks: rest.map((x) => q.blocks.find((y) => y.id === x.id) ?? x) };
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;
      if (e.key === 'Escape') setPreview(null);
      if (e.key === ' ') { e.preventDefault(); setPreview(null); setPlaying((p) => !p); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); remove(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const doExport = async () => {
    setExportErr(null);
    if (!mp4Supported()) { setExportErr('이 브라우저는 MP4 내보내기를 지원하지 않습니다. 최신 Chrome / Edge / Safari 를 사용하세요.'); return; }
    const [w, h] = res.split('x').map(Number);
    cancel.current = { cancelled: false };
    setExportState({ p: 0 });
    try {
      const blob = await exportMp4(projectRef.current, { width: w, height: h, fps: 30, bg: seq.bg }, (p) => setExportState({ p }), cancel.current);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'robot-eyes.mp4'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { if ((e as Error).message !== '취소됨') setExportErr((e as Error).message); }
    setExportState(null);
  };

  // drag an asset chip from the library onto the strip to insert it where it's dropped
  const insertIndexAt = (clientX: number) => {
    const x = clientX - (stripRef.current?.getBoundingClientRect().left ?? 0);
    return seq.blocks.filter((_, k) => offsets[k] + widths[k] / 2 < x).length;
  };
  const onLibDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('text/asset')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropIdx(insertIndexAt(e.clientX));
  };
  const onLibDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData('text/asset');
    setDropIdx(null);
    if (!ASSET_BY_ID[id]) return;
    e.preventDefault();
    const at = insertIndexAt(e.clientX);
    const b = newBlock(id);
    update((q) => { const blocks = q.blocks.slice(); blocks.splice(at, 0, b); return { ...q, blocks }; });
    setSelected(b.id);
    setPreview(null);
  };

  const groups: Asset['group'][] = ['감정', '동작', '시선', '이모지'];
  const total = totalMs(seq);
  const shapeOn = (sh: 'round' | 'long') => !(seq.useCustom && seq.mode === 'matrix') && seq.shape === sh;
  const empty = seq.blocks.length === 0;

  return (
    <div className="app">
      <header>
        <div className="brand"><span className="logo"><i /><i /></span><b>로봇 눈 모션 제작소</b></div>
        <div className="hgroup">
          <div className="seg" title="표시 방식">
            <button className={seq.mode === 'matrix' ? 'on' : ''} title="LED 매트릭스" onClick={() => update((s) => ({ ...s, mode: 'matrix' }))}><Icon name="grid" size={16} /><span className="lbl">LED 매트릭스</span></button>
            <button className={seq.mode === 'freeform' ? 'on' : ''} title="자유형 눈" onClick={() => update((s) => ({ ...s, mode: 'freeform' }))}><Icon name="blob" size={16} /><span className="lbl">자유형 눈</span></button>
          </div>
          <div className="seg alt" title="눈 모양">
            <button className={shapeOn('round') ? 'on' : ''} title="동그란 눈" onClick={() => update((s) => ({ ...s, shape: 'round', useCustom: false }))}><Icon name="eyeRound" size={20} /><span className="lbl">동그란 눈</span></button>
            <button className={shapeOn('long') ? 'on' : ''} title="긴 눈" onClick={() => update((s) => ({ ...s, shape: 'long', useCustom: false }))}><Icon name="eyeLong" size={20} /><span className="lbl">긴 눈</span></button>
            {seq.mode === 'matrix' && (
              <button className={seq.useCustom ? 'on' : ''} title="내 눈 — LED 눈을 직접 그리기"
                onClick={() => { update((s) => ({ ...s, useCustom: true, custom: s.custom ?? presetEyePattern(s.shape) })); setEditEye(true); }}><Icon name="pen" size={16} /><span className="lbl">내 눈</span></button>
            )}
          </div>
          <label className="swatch" title="눈 색상"><input type="color" value={seq.eyeColor} onChange={(e) => update((s) => ({ ...s, eyeColor: e.target.value }))} /><span>눈</span></label>
          <label className="swatch" title="배경 색상"><input type="color" value={seq.bg} onChange={(e) => update((s) => ({ ...s, bg: e.target.value }))} /><span>배경</span></label>
        </div>
        <span className="grow" />
        <select value={res} onChange={(e) => setRes(e.target.value)} title="영상 크기">
          <option value="1280x720">1280×720</option><option value="1920x1080">1920×1080</option><option value="1080x1080">1080×1080</option><option value="800x480">800×480</option>
        </select>
        <button className="primary" onClick={doExport} disabled={!!exportState || empty}><Icon name="export" size={15} /> MP4 내보내기</button>
      </header>

      <aside>
        <div className="tabs" role="tablist">
          {groups.map((g) => (
            <button key={g} role="tab" aria-selected={tab === g} title={TAB_INFO[g].hint} className={`${tab === g ? 'on ' : ''}${g}`} onClick={() => setTab(g)}>
              <span className="ticon">{TAB_INFO[g].icon}</span>
              <span className="tname">{g}<small>{ASSETS.filter((a) => a.group === g).length}</small></span>
            </button>
          ))}
        </div>
        <p className="tip"><b>{TAB_INFO[tab].hint}</b> · 눌러서 미리보기, 끌어서 추가</p>
        <div className="assets" key={tab}>
          {ASSETS.filter((a) => a.group === tab).map((a) => (
            <div key={a.id} role="button" tabIndex={0} className={`asset ${a.group}${preview?.id === a.id ? ' active' : ''}`} onClick={() => setPreview(a)}
              draggable onDragStart={(e) => { e.dataTransfer.setData('text/asset', a.id); e.dataTransfer.effectAllowed = 'copy'; }} onDragEnd={() => setDropIdx(null)}
              onKeyDown={(e) => { if (e.key === 'Enter') setPreview(a); }} title={`${a.label} — 눌러서 미리보기`}>
              <Thumb asset={a} base={seq} aspect={aspect} />
              <span className="name">{a.label}</span><small>{a.seconds.toFixed(1)}s</small>
              <button className="addbtn" title="타임라인에 추가" onClick={(e) => { e.stopPropagation(); add(a); }}><Icon name="plus" size={14} /></button>
            </div>
          ))}
        </div>
      </aside>

      <main>
        <div className={`stage${preview ? ` previewing ${preview.group}` : ''}`} ref={wrapRef}>
          <canvas ref={canvasRef} />
          {preview && (
            <div className="pvbar">
              <span className="badge">미리보기</span><b>{preview.label}</b>
              <button className="pill" onClick={() => { add(preview); setPreview(null); }}><Icon name="plus" size={14} /> 타임라인에 추가</button>
              <button className="iconbtn x" onClick={() => setPreview(null)} title="닫기 (Esc)"><Icon name="close" size={15} /></button>
            </div>
          )}
        </div>
        <div className="transport">
          <button className="iconbtn" onClick={() => { tRef.current = 0; setTime(0); }} title="처음으로"><Icon name="rewind" size={15} /></button>
          <button className="playbtn" onClick={() => { setPreview(null); setPlaying(!playing); }} title={playing ? '정지 (Space)' : '재생 (Space)'}><Icon name={playing && !preview ? 'pause' : 'play'} size={18} /></button>
          <span className="time">{preview ? '미리보기 중' : `${fmt(time)} / ${fmt(total)}`}</span>
          <span className="grow" />
          <label className="slider">눈 간격
            <input type="range" min={30} max={250} step={5} value={seq.spacing} onChange={(e) => update((s) => ({ ...s, spacing: Number(e.target.value) }))} />
            <span className="val">{seq.spacing}%</span>
          </label>
          <label className="slider" title="블록이 이어질 때 감정이 섞이는 시간">연결 부드러움
            <input type="range" min={0} max={1000} step={25} value={seq.blend} onChange={(e) => update((s) => ({ ...s, blend: Number(e.target.value) }))} />
            <span className="val">{seq.blend}ms</span>
          </label>
        </div>
      </main>

      <footer>
        <div className="strip" onDragOver={onLibDragOver} onDragLeave={(e) => { if (e.currentTarget === e.target) setDropIdx(null); }} onDrop={onLibDrop}>
          {empty && <div className="empty"><b>타임라인이 비어 있어요</b><span>왼쪽에서 눈 모션을 골라 ＋ 를 눌러 블록을 이어 붙이세요</span></div>}
          <div className="blocks" ref={stripRef} style={{ width: offsets.length ? offsets[offsets.length - 1] + widths[widths.length - 1] : 0 }}>
            <div className="ruler" onPointerDown={scrub}>
              {!empty && Array.from({ length: Math.floor(total / 1000) + 1 }, (_, n) => {
                const t = n * 1000;
                let i = 0; for (let k = seq.blocks.length - 1; k >= 0; k--) if (t >= starts[k]) { i = k; break; }
                const x = offsets[i] + Math.min(1, (t - starts[i]) / (seq.blocks[i].seconds * 1000)) * widths[i];
                return <span key={n} style={{ left: x }}>{n}s</span>;
              })}
            </div>
            {seq.blocks.map((b, i) => {
              const a = ASSET_BY_ID[b.assetId];
              return (
                <div key={b.id} className={`block ${a.group}${b.id === selected ? ' sel' : ''}${drag?.id === b.id ? (Math.abs(drag.dy) > 70 ? ' dragging erase' : ' dragging') : ''}`}
                  style={{ left: offsets[i], width: widths[i] - 3, transform: drag?.id === b.id ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined }}
                  onPointerDown={(e) => startBlockDrag(e, i, 'move')}>
                  <i className="grip l" onPointerDown={(e) => startBlockDrag(e, i, 'l')} />
                  <span className="bname">{a.label}</span><small>{b.seconds.toFixed(1)}s</small>
                  <i className="grip r" onPointerDown={(e) => startBlockDrag(e, i, 'r')} />
                </div>
              );
            })}
            {dropIdx !== null && <div className="dropline" style={{ left: dropIdx < offsets.length ? offsets[dropIdx] - 2 : (offsets.length ? offsets[offsets.length - 1] + widths[widths.length - 1] : 0) }} />}
            <div className="playhead" style={{ left: playheadX }} onPointerDown={scrub}><i /></div>
          </div>
        </div>
        <div className="inspector">
          {sel && selAsset ? (
            <>
              <span className={`dot ${selAsset.group}`} /><b>{selAsset.label}</b>
              <label className="slider">길이
                <input type="range" min={selAsset.min} max={selAsset.max} step={0.1} value={sel.seconds} onChange={(e) => update((s) => ({ ...s, blocks: s.blocks.map((b) => (b.id === sel.id ? { ...b, seconds: Number(e.target.value) } : b)) }))} />
                <span className="val">{sel.seconds.toFixed(1)}s</span>
              </label>
              <button className="iconbtn" onClick={() => move(-1)} title="앞으로"><Icon name="left" /></button>
              <button className="iconbtn" onClick={() => move(1)} title="뒤로"><Icon name="right" /></button>
              <button className="pill" onClick={duplicate}><Icon name="copy" size={14} /> 복제</button>
              <button className="pill danger" onClick={remove}><Icon name="trash" size={14} /> 삭제</button>
            </>
          ) : <span className="hint">블록 드래그 = 이동 · 양쪽 끝 = 길이 · 위/아래로 멀리 놓기 = 삭제 · Space = 재생/정지</span>}
          <span className="grow" />
          {!empty && <button className="ghost" onClick={() => { if (confirm('모든 블록을 지울까요?')) { update((s) => ({ ...s, blocks: [] })); setSelected(null); } }}>전체 지우기</button>}
          <button className="ghost" onClick={() => { update((s) => ({ ...defaultSequence(), eyeColor: s.eyeColor, bg: s.bg, mode: s.mode, shape: s.shape, custom: s.custom, useCustom: s.useCustom })); setSelected(null); }}>예시 불러오기</button>
        </div>
      </footer>

      {editEye && seq.custom && (
        <EyeEditor value={seq.custom} onChange={(v) => update((s) => ({ ...s, custom: v, useCustom: true }))} onClose={() => setEditEye(false)} />
      )}
      {(exportState || exportErr) && (
        <div className="overlay">
          <div className="dialog">
            {exportState ? (
              <>
                <b>MP4 만드는 중… {Math.round(exportState.p * 100)}%</b>
                <div className="bar"><i style={{ width: `${exportState.p * 100}%` }} /></div>
                <button onClick={() => { cancel.current.cancelled = true; }}>취소</button>
              </>
            ) : (
              <>
                <b>내보내기 실패</b><p>{exportErr}</p><button onClick={() => setExportErr(null)}>닫기</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
