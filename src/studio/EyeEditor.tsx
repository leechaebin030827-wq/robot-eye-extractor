import { useRef, useState } from 'react';
import { presetEyePattern } from './assets';
import { setPixel } from '../engine/patterns';

type Pair = { left: string[]; right: string[] };

function Grid({ pattern, onPaint, label }: { pattern: string[]; onPaint: (r: number, c: number, on: boolean) => void; label: string }) {
  const mode = useRef<boolean | null>(null);
  const cell = (e: React.PointerEvent): [number, number] | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    return el && el.dataset.r !== undefined ? [Number(el.dataset.r), Number(el.dataset.c)] : null;
  };
  return (
    <div className="eg-wrap">
      <div className="eg"
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const t = cell(e); if (!t) return; mode.current = pattern[t[0]][t[1]] !== '1'; onPaint(t[0], t[1], mode.current); }}
        onPointerMove={(e) => { if (mode.current === null) return; const t = cell(e); if (t) onPaint(t[0], t[1], mode.current); }}
        onPointerUp={() => { mode.current = null; }} onPointerCancel={() => { mode.current = null; }}>
        {pattern.map((row, r) => row.split('').map((ch, c) => <div key={`${r}${c}`} data-r={r} data-c={c} className={ch === '1' ? 'on' : ''} />))}
      </div>
      <span>{label}</span>
    </div>
  );
}

/** 8×8 editor for the user's own default eye (left + right module). */
export function EyeEditor({ value, onChange, onClose }: { value: Pair; onChange: (v: Pair) => void; onClose: () => void }) {
  const [mirror, setMirror] = useState(true);
  const paint = (side: 'left' | 'right') => (r: number, c: number, on: boolean) => {
    const next = { ...value, [side]: setPixel(value[side], r, c, on) };
    if (mirror) { const other = side === 'left' ? 'right' : 'left'; next[other] = setPixel(value[other], r, 7 - c, on); }
    onChange(next);
  };
  const cnt = (p: string[]) => p.join('').split('1').length - 1;
  return (
    <div className="overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog wide">
        <b>내 눈 만들기 (LED 매트릭스 기본 눈)</b>
        <p className="muted">칸을 눌러 켜고 끄세요 (드래그로 한 번에). 만든 눈이 기본 눈이 되고, 감정에 따라 눈꺼풀이 올라가고 내려옵니다.</p>
        <div className="egs">
          <Grid pattern={value.left} onPaint={paint('left')} label={`왼쪽 · ${cnt(value.left)} LED`} />
          <Grid pattern={value.right} onPaint={paint('right')} label={`오른쪽 · ${cnt(value.right)} LED`} />
        </div>
        <label className="row"><input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> 좌우 대칭으로 같이 그리기</label>
        <div className="row">
          <button onClick={() => onChange(presetEyePattern('round'))}>동그란 눈 불러오기</button>
          <button onClick={() => onChange(presetEyePattern('long'))}>긴 눈 불러오기</button>
          <button onClick={() => onChange({ left: Array(8).fill('00000000'), right: Array(8).fill('00000000') })}>지우기</button>
          <button onClick={() => onChange({ left: value.left, right: value.left.map((r) => r.split('').reverse().join('')) })}>왼쪽 → 오른쪽 복사</button>
          <span className="grow" />
          <button className="primary" onClick={onClose}>완료</button>
        </div>
      </div>
    </div>
  );
}
