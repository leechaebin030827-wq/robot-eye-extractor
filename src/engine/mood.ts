import type { MoodId, MoodVec } from './types';
import { MOOD_IDS } from './types';

export const ZERO_MOOD: MoodVec = { lt: 0, lb: 0, sl: 0, ar: 0, op: 0, cur: 0 };

/**
 * Mood definitions as lid / shape modifiers at 100% strength.
 * (Default / Happy / Tired / Angry follow the mood set of FluxGarage RoboEyes conceptually;
 *  Calm, Curious, Attentive, Reassuring, Sleepy are LIEU additions.)
 */
export const MOODS: Record<MoodId, { label: string; vec: MoodVec; hint: string }> = {
  default: { label: 'DEFAULT', vec: { ...ZERO_MOOD }, hint: 'Neutral open eyes' },
  happy: { label: 'HAPPY', vec: { lt: 0, lb: 0.3, sl: 0, ar: 1, op: 0, cur: 0 }, hint: 'Cheeks raise lower lid into an arch' },
  tired: { label: 'TIRED', vec: { lt: 0.38, lb: 0, sl: -0.45, ar: 0, op: -0.05, cur: 0 }, hint: 'Heavy upper lids, outer corners droop' },
  angry: { label: 'ANGRY', vec: { lt: 0.15, lb: 0, sl: 0.85, ar: 0, op: 0, cur: 0 }, hint: 'Inner upper lids slant downward' },
  calm: { label: 'CALM', vec: { lt: 0.14, lb: 0.04, sl: 0, ar: 0.12, op: -0.06, cur: 0 }, hint: 'Relaxed, slightly lowered lids' },
  curious: { label: 'CURIOUS', vec: { lt: 0, lb: 0, sl: 0, ar: 0, op: 0.12, cur: 1 }, hint: 'Wide eyes, outer eye grows when looking aside' },
  attentive: { label: 'ATTENTIVE', vec: { lt: 0.08, lb: 0.03, sl: 0.18, ar: 0, op: 0, cur: 0.25 }, hint: 'Focused, gently narrowed' },
  reassuring: { label: 'REASSURING', vec: { lt: 0.1, lb: 0.2, sl: -0.18, ar: 0.6, op: -0.03, cur: 0 }, hint: 'Soft smile-eyes with relaxed brow' },
  sleepy: { label: 'SLEEPY', vec: { lt: 0.55, lb: 0.05, sl: -0.2, ar: 0, op: -0.15, cur: 0 }, hint: 'Nearly closed, drowsy' },
};

export const isMoodId = (v: unknown): v is MoodId => typeof v === 'string' && (MOOD_IDS as readonly string[]).includes(v);

export function moodVec(id: MoodId, strengthPct: number): MoodVec {
  const s = Math.max(0, strengthPct) / 100;
  const v = MOODS[id].vec;
  return { lt: v.lt * s, lb: v.lb * s, sl: v.sl * s, ar: v.ar * s, op: v.op * s, cur: v.cur * s };
}

export function mixMood(a: MoodVec, b: MoodVec, t: number): MoodVec {
  const m = (x: number, y: number) => x + (y - x) * t;
  return { lt: m(a.lt, b.lt), lb: m(a.lb, b.lb), sl: m(a.sl, b.sl), ar: m(a.ar, b.ar), op: m(a.op, b.op), cur: m(a.cur, b.cur) };
}
