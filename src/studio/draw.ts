import type { Project } from '../engine/types';
import { evaluateEye } from '../engine/controller';
import { generateMatrixFrame, drawMatrix } from '../render/matrixRenderer';
import { buildEye, drawFreeform } from '../render/freeformRenderer';

export const BG = '#0b0d10';

/** Render one frame of the project at time t (ms) into a canvas context of CSS size W×H. */
export function drawAt(ctx: CanvasRenderingContext2D, W: number, H: number, project: Project, t: number, bg = BG) {
  const f = evaluateEye(project, t, project.mode);
  if (project.mode === 'matrix') {
    const mf = generateMatrixFrame(f, project.matrix.geometry);
    drawMatrix(ctx, W, H, mf, project.matrix.physical, { zoom: 1.1, panX: 0, panY: 0, bg, grid: true });
  } else {
    const g = project.freeform.geometry;
    drawFreeform(ctx, W, H, [buildEye('L', f, g), buildEye('R', f, g)], g,
      { zoom: 1.25, panX: 0, panY: 0, bg, grid: false, showOutline: false, showPoints: false });
  }
}
