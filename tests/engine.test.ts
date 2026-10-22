import { evaluateEye } from '../src/engine/controller';
import { generateMatrixFrame } from '../src/render/matrixRenderer';
import { buildEye } from '../src/render/freeformRenderer';
import { ASSETS, buildProject, defaultSequence, newBlock, totalMs } from '../src/studio/assets';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

const seq = defaultSequence();
const p = buildProject(seq);
ok(p.timeline.duration === totalMs(seq), 'timeline length equals the sum of blocks');
ok(JSON.stringify(evaluateEye(p, 4321, 'matrix')) === JSON.stringify(evaluateEye(p, 4321, 'matrix')), 'deterministic frames (same time → same eye)');

// every asset compiles and renders finite frames in both modes
for (const a of ASSETS) {
  const s = { ...defaultSequence(), blocks: [newBlock('mood-default'), newBlock(a.id), newBlock('mood-default')] };
  const proj = buildProject(s);
  let bad = false;
  for (let t = 0; t < proj.timeline.duration; t += 50) {
    const fm = evaluateEye(proj, t, 'matrix'), ff = evaluateEye(proj, t, 'freeform');
    if (generateMatrixFrame(fm, proj.matrix.geometry).ledCount > 128) bad = true;
    if (!buildEye('L', ff, proj.freeform.geometry).outline.every((q) => Number.isFinite(q[0] + q[1]))) bad = true;
  }
  ok(!bad, `asset "${a.label}" renders cleanly`);
}

// mood crossfade between blocks is continuous (no jump larger than a small step per 20ms)
const s2 = { ...defaultSequence(), blocks: [newBlock('mood-angry'), newBlock('mood-happy')], blend: 400 };
const p2 = buildProject(s2);
let maxJump = 0, prev = evaluateEye(p2, 0, 'freeform').mood.sl;
for (let t = 20; t < p2.timeline.duration; t += 20) { const v = evaluateEye(p2, t, 'freeform').mood.sl; maxJump = Math.max(maxJump, Math.abs(v - prev)); prev = v; }
ok(maxJump < 0.1, `mood transition is smooth (max step ${maxJump.toFixed(3)})`);
if (fails) throw new Error('tests failed');
console.log('all passed');
