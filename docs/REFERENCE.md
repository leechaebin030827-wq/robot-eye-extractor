# Reference & licensing notes

## FluxGarage RoboEyes
- Repository: https://github.com/FluxGarage/RoboEyes (v1.1.1 at time of review), **GPL-3.0**, Arduino + Adafruit GFX (OLED).
- I read the README, the public API list and the header's description. **No RoboEyes source code was copied, translated or ported.**
  LIEU Eye Motion Studio is an independent TypeScript implementation that uses RoboEyes only as a *conceptual* reference
  (feature vocabulary). If you ever copy or port RoboEyes code into this project, the combined work becomes subject to GPL-3.0
  (source disclosure of the combined work on distribution) — get a license review first.

### Concepts taken from RoboEyes (re-implemented from scratch)
| RoboEyes concept | Where it lives here |
|---|---|
| width / height / border radius / space between | Freeform: widthL/R, heightL/R, cornerRadius, spacing · Matrix: pixel width/height, corner simulation |
| moods Default / Happy / Tired / Angry | `engine/mood.ts` (lid coverage, slant, arch vectors) |
| curiosity (outer eye grows when looking aside) | `curiosity` → +1 LED row (Matrix) / taller outer eye (Freeform) |
| horizontal / vertical flicker | `flickerH/V` (deterministic alternation, not random) |
| auto blink with interval + variation | seeded pre-generated schedule (`controller.ts → blinkSchedule`) |
| idle mode (random repositioning) | seeded sum-of-sines drift + micro-saccades |
| confused / laugh one-shot animations | `confused`, `laugh` in the motion library |
| smooth state transitions | easing between keyframes, motion envelopes, Freeform gaze low-pass |

### LIEU-original (not in RoboEyes)
Dual physical 8×8 matrix model (10 mm gap, pitch/diameter/orientation), pixel editor + pixel-pattern track,
Bézier Freeform renderer with draggable control points and shape-morph track, Convert-to-Matrix,
shared EyeController with two renderers, keyframe timeline, deterministic scrubbing, 21-motion library,
3 LIEU scenarios, project/preset/JSON validation, hardware adapter layer, external time sync API.
