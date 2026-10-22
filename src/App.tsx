import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ASSETS, ASSET_BY_ID, buildProject, defaultSequence, newBlock, totalMs, type Asset, type Sequence } from './studio/assets';
import { drawAt } from './studio/draw';
import { exportMp4, mp4Supported } from './studio/exportMp4';

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
      return { blocks, blend: Number.isFinite(o.blend) ? Math.min(1200, Math.max(0, o.blend)) : 450, eyeColor: o.bg === undefined ? '#FFFFFF' : hex(o.eyeColor, '#FFFFFF'), bg: hex(o.bg, '#000000'), mode: o.mode === 'freeform' ? 'freeform' : 'matrix' };
    }
  } catch { /* fall through */ }
  return defaultSequence();
}

const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function App() {
  const [seq, setSeq] = useState<Sequence>(load);
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [exportState, setExportState] = useState<null | { p: number }>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [res, setRes] = useState('1280x720');
  const [dragId, setDragId] = useState<string | null>(null);

  const project = useMemo(() => buildProject(seq), [seq]);
  const projectRef = useRef(project);
  projectRef.current = project;
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
    const W = w.clientWidth, H = w.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawAt(ctx, W, H, projectRef.current, tRef.current, bgRef.current);
  }, []);

  // single rAF loop
  useEffect(() => {
    let raf = 0, last = performance.now(), lastUi = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(64, now - last); last = now;
      if (playRef.current) {
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
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    update((s) => {
      const from = s.blocks.findIndex((b) => b.id === dragId), to = s.blocks.findIndex((b) => b.id === targetId);
      const blocks = s.blocks.slice(); const [m] = blocks.splice(from, 1); blocks.splice(to, 0, m);
      return { ...s, blocks };
    });
    setDragId(null);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
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

  const groups: Asset['group'][] = ['감정', '동작', '시선'];
  const total = totalMs(seq);

  return (
    <div className="app">
      <header>
        <b>로봇 눈 모션 제작소</b>
        <div className="seg">
          <button className={seq.mode === 'matrix' ? 'on' : ''} onClick={() => update((s) => ({ ...s, mode: 'matrix' }))}>LED 매트릭스</button>
          <button className={seq.mode === 'freeform' ? 'on' : ''} onClick={() => update((s) => ({ ...s, mode: 'freeform' }))}>자유형 눈</button>
        </div>
        <label className="color" title="눈 색상">눈<input type="color" value={seq.eyeColor} onChange={(e) => update((s) => ({ ...s, eyeColor: e.target.value }))} /></label>
        <label className="color" title="배경 색상">배경<input type="color" value={seq.bg} onChange={(e) => update((s) => ({ ...s, bg: e.target.value }))} /></label>
        <span className="grow" />
        <select value={res} onChange={(e) => setRes(e.target.value)} title="영상 크기">
          <option value="1280x720">1280×720</option><option value="1920x1080">1920×1080</option><option value="1080x1080">1080×1080</option><option value="800x480">800×480</option>
        </select>
        <button className="primary" onClick={doExport} disabled={!!exportState || !seq.blocks.length}>MP4 내보내기</button>
      </header>

      <aside>
        {groups.map((g) => (
          <section key={g}>
            <h3>{g}</h3>
            <div className="assets">
              {ASSETS.filter((a) => a.group === g).map((a) => (
                <button key={a.id} className={`asset ${g}`} onClick={() => add(a)} title={`${a.label} 추가`}>{a.label}<small>{a.seconds.toFixed(1)}s</small></button>
              ))}
            </div>
          </section>
        ))}
      </aside>

      <main>
        <div className="stage" ref={wrapRef}><canvas ref={canvasRef} /></div>
        <div className="transport">
          <button onClick={() => setPlaying(!playing)}>{playing ? '❚❚ 정지' : '▶ 재생'}</button>
          <button onClick={() => { tRef.current = 0; setTime(0); }}>⏮</button>
          <span className="time">{fmt(time)} / {fmt(total)}</span>
          <span className="grow" />
          <label>연결 부드러움
            <input type="range" min={0} max={1000} step={25} value={seq.blend} onChange={(e) => update((s) => ({ ...s, blend: Number(e.target.value) }))} />
            <span className="time">{seq.blend}ms</span>
          </label>
        </div>
      </main>

      <footer>
        <div className="strip">
          {seq.blocks.length === 0 && <div className="empty">왼쪽에서 눈 모션을 눌러 블록을 추가하세요</div>}
          <div className="blocks" style={{ width: offsets.length ? offsets[offsets.length - 1] + widths[widths.length - 1] : 0 }}>
            {seq.blocks.map((b, i) => {
              const a = ASSET_BY_ID[b.assetId];
              return (
                <div key={b.id} className={`block ${a.group}${b.id === selected ? ' sel' : ''}`} style={{ left: offsets[i], width: widths[i] - 3 }}
                  draggable onDragStart={() => setDragId(b.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(b.id)}
                  onClick={() => { setSelected(b.id); tRef.current = starts[i]; setTime(starts[i]); }}>
                  <span>{a.label}</span><small>{b.seconds.toFixed(1)}s</small>
                </div>
              );
            })}
            <div className="playhead" style={{ left: playheadX }} />
          </div>
        </div>
        <div className="inspector">
          {sel && selAsset ? (
            <>
              <b>{selAsset.label}</b>
              <label>길이 <input type="range" min={selAsset.min} max={selAsset.max} step={0.1} value={sel.seconds} onChange={(e) => update((s) => ({ ...s, blocks: s.blocks.map((b) => (b.id === sel.id ? { ...b, seconds: Number(e.target.value) } : b)) }))} /> {sel.seconds.toFixed(1)}s</label>
              <button onClick={() => move(-1)}>◀</button><button onClick={() => move(1)}>▶</button>
              <button onClick={duplicate}>복제</button><button className="danger" onClick={remove}>삭제</button>
            </>
          ) : <span className="hint">블록을 눌러 길이를 바꾸거나 드래그해서 순서를 바꾸세요 · 스페이스: 재생/정지</span>}
          <span className="grow" />
          {seq.blocks.length > 0 && <button className="ghost" onClick={() => { if (confirm('모든 블록을 지울까요?')) { update((s) => ({ ...s, blocks: [] })); setSelected(null); } }}>전체 지우기</button>}
          <button className="ghost" onClick={() => { update(() => defaultSequence()); setSelected(null); }}>예시로 초기화</button>
        </div>
      </footer>

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
