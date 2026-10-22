import type { MoodId, Mode, Project, Timeline } from '../engine/types';
import { defaultProject, emptyTimeline } from '../engine/params';
import { MOTION_BY_ID, makeMotionEvent } from '../engine/motions';
import { uid } from '../engine/util';

/** An "emotion asset": a mood to hold and/or a motion to play. Blocks are placed back to back. */
export interface Asset {
  id: string;
  label: string;
  group: '감정' | '동작' | '시선';
  mood?: MoodId;
  strength?: number;
  motion?: string;
  seconds: number; // default length
  min: number;
  max: number;
}

const mood = (id: MoodId, label: string, s = 100): Asset => ({ id: `mood-${id}`, label, group: '감정', mood: id, strength: s, seconds: 3, min: 0.8, max: 12 });
const move = (id: string, label: string, group: Asset['group'] = '동작', m?: MoodId): Asset => {
  const d = MOTION_BY_ID[id].defaults.duration / 1000;
  return { id: `mo-${id}`, label, group, motion: id, mood: m, strength: 100, seconds: d, min: Math.max(0.2, d * 0.5), max: d * 3 };
};

export const ASSETS: Asset[] = [
  mood('default', '기본'), mood('happy', '행복'), mood('calm', '차분'), mood('curious', '호기심'), mood('attentive', '집중'),
  mood('reassuring', '안심'), mood('tired', '피곤'), mood('sleepy', '졸림'), mood('angry', '화남'),
  move('gentleGreeting', '인사', '동작', 'happy'), move('laugh', '웃음', '동작', 'happy'), move('confused', '혼란'),
  move('wakeUp', '깨어나기'), move('sleep', '잠들기', '동작', 'sleepy'), move('attentiveListening', '경청', '동작', 'attentive'),
  move('curiousInspection', '살펴보기', '동작', 'curious'), move('calmBreathing', '숨쉬기', '동작', 'calm'),
  move('reassuringBlink', '안심 깜빡임', '동작', 'reassuring'), move('passengerAttention', '승객 주목', '동작', 'attentive'),
  move('blink', '깜빡임'), move('doubleBlink', '두 번 깜빡'), move('winkLeft', '윙크 ◀'), move('winkRight', '윙크 ▶'),
  move('lookLeft', '왼쪽 보기', '시선'), move('lookRight', '오른쪽 보기', '시선'), move('lookUp', '위 보기', '시선'),
  move('lookDown', '아래 보기', '시선'), move('lookAround', '두리번', '시선'), move('lookForwardReturn', '정면 보기', '시선'),
];
export const ASSET_BY_ID = Object.fromEntries(ASSETS.map((a) => [a.id, a]));

export interface Block { id: string; assetId: string; seconds: number }
export interface Sequence { blocks: Block[]; blend: number; eyeColor: string; bg: string; mode: Mode }

export const newBlock = (assetId: string): Block => ({ id: uid('b'), assetId, seconds: ASSET_BY_ID[assetId]?.seconds ?? 2 });

export const defaultSequence = (): Sequence => ({
  blocks: ['mo-wakeUp', 'mo-gentleGreeting', 'mood-calm', 'mo-curiousInspection', 'mo-passengerAttention', 'mo-reassuringBlink', 'mood-default'].map(newBlock),
  blend: 450, eyeColor: '#FFFFFF', bg: '#000000', mode: 'matrix',
});

export const totalMs = (s: Sequence) => Math.max(500, Math.round(s.blocks.reduce((a, b) => a + b.seconds * 1000, 0)));

/**
 * Compile blocks into a timeline. Moods cross-fade across block boundaries (keys sit `blend` ms inside each block),
 * motions fade in/out with the same blend, gaze returns to where it was (motion curves start/end at the live gaze),
 * and seeded idle drift + auto-blink keep running underneath so the cuts feel continuous.
 */
export function compile(seq: Sequence): Timeline {
  const tl = emptyTimeline(totalMs(seq));
  tl.loop = true;
  let t = 0;
  let current: { mood: MoodId; strength: number } = { mood: 'default', strength: 100 };
  for (const b of seq.blocks) {
    const a = ASSET_BY_ID[b.assetId];
    if (!a) continue;
    const d = b.seconds * 1000;
    if (a.mood) current = { mood: a.mood, strength: a.strength ?? 100 };
    const T = Math.min(seq.blend, d / 2);
    const ease = { type: 'easeInOut' as const };
    tl.tracks.mood.push(
      { id: uid('k'), t: Math.round(t + T), mood: current.mood, strength: current.strength, ease },
      { id: uid('k'), t: Math.round(t + d - T), mood: current.mood, strength: current.strength, ease },
    );
    if (a.motion) {
      tl.tracks.motions.push(makeMotionEvent(a.motion, Math.round(t), {
        duration: Math.round(d), speed: 1, loop: false, transition: Math.round(Math.min(seq.blend, d / 3)),
      }));
    }
    t += d;
  }
  tl.tracks.mood.sort((x, y) => x.t - y.t);
  return tl;
}

export function buildProject(seq: Sequence): Project {
  const p = defaultProject();
  p.mode = seq.mode;
  p.timeline = compile(seq);
  p.matrix.physical.ledColor = seq.eyeColor;
  p.matrix.physical.dimensions = false;
  p.matrix.physical.gridVisible = true;
  p.freeform.geometry.eyeColor = seq.eyeColor;
  p.shared.autoBlink = true;
  p.shared.idle = true;
  return p;
}
