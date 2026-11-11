// The pieces of the board, drawn on a canvas. Each one is a few shapes in a box of 100 x 100 units, filled with one
// gradient and outlined; a soft shadow is cast by the silhouette of the whole piece, so the parts do not shadow each
// other. The same functions draw every piece on the board.

export type PieceKind = "queen" | "pawn";
/** ebony: a queen of the solver; blue: a queen that was on the board from the start; wood: a pawn. */
export type Tone = "ebony" | "blue" | "wood";

interface ToneStyle {
  stops: ReadonlyArray<readonly [number, string]>;
  stroke: string;
  strokeWidth: number;
  /** Opacity of the highlight along the left side of a queen. */
  shine: number;
}

const TONES: Record<Tone, ToneStyle> = {
  ebony: {
    stops: [[0, "#76736e"], [0.42, "#2d2c2a"], [1, "#0d0d0c"]],
    stroke: "rgba(244, 243, 238, 0.8)",
    strokeWidth: 1.3,
    shine: 0.22,
  },
  blue: {
    stops: [[0, "#86b8ff"], [0.5, "#2f6fe0"], [1, "#193a88"]],
    stroke: "rgba(255, 255, 255, 0.9)",
    strokeWidth: 1.3,
    shine: 0.3,
  },
  wood: {
    stops: [[0, "#d9a06a"], [0.5, "#8d5427"], [1, "#4a2910"]],
    stroke: "rgba(246, 234, 217, 0.85)",
    strokeWidth: 1.2,
    shine: 0.25,
  },
};

const circle = (cx: number, cy: number, r: number): string =>
  `M${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}Z`;
const pill = (x: number, y: number, w: number, h: number): string => {
  const r = h / 2;
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
};

// A queen in the Staunton style: five points with a ball on each, a collar, a body that flares and a base.
const QUEEN_PARTS = [
  "M23 91Q23 83 32 82H68Q77 83 77 91Z",
  "M31 82C36 70 40 58 42 46H58C60 58 64 70 69 82Z",
  pill(34, 40, 32, 8),
  "M36 41C32 34 28 28 26 18L35 28L38 12L45 25L50 8L55 25L62 12L65 28L74 18C72 28 68 34 64 41Z",
  ...[[26, 16], [38, 10], [50, 6], [62, 10], [74, 16]].map(([x, y]) => circle(x!, y!, 3.8)),
];
const QUEEN_SHINE = "M41 52C41 61 38 70 35 78";
const PAWN_PARTS = [
  "M24 91Q24 83 32 82H68Q76 83 76 91Z",
  "M41 47C40 60 35 71 30 82H70C65 71 60 60 59 47Z",
  pill(37, 40, 26, 8),
  circle(50, 28, 11),
];
const LOCK_BODY = "M7.5 10H16.5A2.5 2.5 0 0 1 19 12.5V18.5A2.5 2.5 0 0 1 16.5 21H7.5A2.5 2.5 0 0 1 5 18.5V12.5A2.5 2.5 0 0 1 7.5 10Z";
const LOCK_SHACKLE = "M8 10V7.5A4 4 0 0 1 16 7.5V10";

// Path2D does not exist in Node, so the shapes are made the first time a piece is drawn.
interface Shapes {
  parts: Path2D[];
  silhouette: Path2D;
  shine?: Path2D;
}
const cache = new Map<PieceKind, Shapes>();
function shapesOf(kind: PieceKind): Shapes {
  let s = cache.get(kind);
  if (!s) {
    const parts = (kind === "queen" ? QUEEN_PARTS : PAWN_PARTS).map((d) => new Path2D(d));
    const silhouette = new Path2D();
    for (const p of parts) silhouette.addPath(p);
    s = { parts, silhouette, ...(kind === "queen" ? { shine: new Path2D(QUEEN_SHINE) } : {}) };
    cache.set(kind, s);
  }
  return s;
}

export interface PieceOptions {
  /** A small gold padlock in the corner: the queen cannot be moved. */
  locked?: boolean;
}

/** Draws a piece in the square (x, y, size, size). */
export function drawPiece(
  ctx: CanvasRenderingContext2D,
  kind: PieceKind,
  tone: Tone,
  x: number,
  y: number,
  size: number,
  opts: PieceOptions = {},
): void {
  const tone_ = TONES[tone];
  const shapes = shapesOf(kind);
  const dpr = ctx.getTransform().a || 1; // shadows are measured in device pixels, whatever the transform
  ctx.save();
  ctx.translate(x + size * 0.04, y + size * 0.02);
  ctx.scale((size * 0.92) / 100, (size * 0.92) / 100);

  const fill = ctx.createLinearGradient(28, 4, 72, 96);
  for (const [at, colour] of tone_.stops) fill.addColorStop(at, colour);
  ctx.lineJoin = "round";

  ctx.shadowColor = "rgba(0, 0, 0, 0.38)";
  ctx.shadowBlur = size * 0.045 * dpr;
  ctx.shadowOffsetY = size * 0.035 * dpr;
  ctx.fillStyle = fill;
  ctx.fill(shapes.silhouette);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = tone_.stroke;
  ctx.lineWidth = tone_.strokeWidth;
  for (const part of shapes.parts) {
    ctx.fill(part);
    ctx.stroke(part);
  }
  if (shapes.shine) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${tone_.shine})`;
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.stroke(shapes.shine);
  }
  if (opts.locked) drawLock(ctx);
  ctx.restore();
}

/** In the 100 x 100 box of a piece: the top right corner. */
function drawLock(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(58, 2);
  ctx.scale(40 / 24, 40 / 24);
  const gold = ctx.createLinearGradient(5, 10, 19, 21);
  gold.addColorStop(0, "#ffe9a3");
  gold.addColorStop(1, "#d99a1f");
  ctx.lineCap = "round";
  ctx.strokeStyle = "#e0a82e";
  ctx.lineWidth = 2.4;
  ctx.stroke(new Path2D(LOCK_SHACKLE));
  ctx.fillStyle = gold;
  ctx.strokeStyle = "#6b4a00";
  ctx.lineWidth = 1.2;
  const body = new Path2D(LOCK_BODY);
  ctx.fill(body);
  ctx.stroke(body);
  ctx.fillStyle = "#6b4a00";
  ctx.fill(new Path2D(circle(12, 15.5, 1.7)));
  ctx.restore();
}

/** A hole: a recessed cell with a cross. Attacks pass through it. */
export function drawHole(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const inset = size * 0.06;
  const w = size - 2 * inset;
  const r = size * 0.09;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.roundRect(x + inset, y + inset, w, w, r);
  ctx.fill();
  const m = size * 0.3;
  ctx.beginPath();
  ctx.moveTo(x + m, y + m);
  ctx.lineTo(x + size - m, y + size - m);
  ctx.moveTo(x + size - m, y + m);
  ctx.lineTo(x + m, y + size - m);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = Math.max(1.5, size * 0.05);
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}
