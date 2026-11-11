// Board renderer (Canvas 2D). It draws a RenderState and keeps no state of the game of its own.
//
// The canvas holds the board with rounded corners and a shadow, and the numbers of the rows and columns in a gutter
// above and to the left of it, so that no piece ever covers one.
import { COLORS, NO_HIGHLIGHT, type Highlight } from "./highlight";
import { drawHole, drawPiece } from "./pieces";

export interface QueenCell {
  row: number;
  col: number;
  preplaced: boolean;
}

export interface BlockedCell {
  row: number;
  col: number;
  kind: "hole" | "wall";
}

export interface RenderState {
  n: number;
  queens: ReadonlyArray<QueenCell>;
  blocked?: ReadonlyArray<BlockedCell>;
  highlight: Highlight; // x = row, y = column (the project's convention)
  /** The cell under the pointer: lit on the board, and its row and column numbers light up in the gutter. */
  hover?: { row: number; col: number };
}

export interface Palette {
  light: string;
  dark: string;
  valid: string;
  conflict: string;
  outline: string;
  hover: string;
  /** Row and column numbers, and the ones of the hovered cell. They follow the page's theme. */
  coord: string;
  coordHi: string;
}

export const DEFAULT_PALETTE: Palette = {
  light: COLORS.light,
  dark: COLORS.dark,
  valid: COLORS.valid,
  conflict: COLORS.conflict,
  outline: "#1a1a1a",
  hover: "rgba(246, 246, 105, 0.55)",
  coord: "#8c8a84",
  coordHi: "#f1efec",
};

/** The palette with the colours of the page's theme (--coord and --coord-hi), read from its style. */
export function paletteFromCss(base: Palette = DEFAULT_PALETTE): Palette {
  const css = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
  return { ...base, coord: pick("--coord", base.coord), coordHi: pick("--coord-hi", base.coordHi) };
}

export interface Layout {
  side: number; // side of the canvas, CSS px (an integer)
  gutter: number; // room for the numbers, above and to the left of the board
  pad: number; // room for the shadow, below and to the right of it
  cell: number; // side of one cell, CSS px
}

/** Pure, testable in Node. */
export function computeLayout(availableWidth: number, availableHeight: number, n: number): Layout {
  const w = Math.max(0, availableWidth);
  const h = availableHeight > 0 ? availableHeight : w; // a parent without a height follows the width
  const side = Math.floor(Math.min(w, h));
  if (n <= 0 || side <= 0) return { side, gutter: 0, pad: 0, cell: 0 };
  const gutter = Math.max(16, Math.round(side * 0.04));
  const pad = Math.max(4, Math.round(gutter * 0.3));
  return { side, gutter, pad, cell: Math.max(0, side - gutter - pad) / n };
}

/**
 * Pure: the cell (row, column) under the point (x, y), in CSS pixels from the top left of the canvas, or null outside
 * the board. The gutter and the padding are not part of the board.
 */
export function cellFromPoint(
  x: number,
  y: number,
  side: number,
  n: number,
  gutter = 0,
  pad = 0,
): { row: number; col: number } | null {
  const board = side - gutter - pad;
  if (n <= 0 || board <= 0) return null;
  const bx = x - gutter;
  const by = y - gutter;
  if (bx < 0 || by < 0 || bx >= board || by >= board) return null;
  return { row: Math.floor((by / board) * n), col: Math.floor((bx / board) * n) };
}

export interface DrawStats {
  draws: number;
  totalMs: number;
  maxMs: number;
}

export class BoardRenderer {
  readonly stats: DrawStats = { draws: 0, totalMs: 0, maxMs: 0 };
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private palette: Palette;
  private state: RenderState = { n: 0, queens: [], highlight: NO_HIGHLIGHT };
  private layout: Layout = { side: 0, gutter: 0, pad: 0, cell: 0 };
  private dpr = 1;
  private rafId = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, palette: Palette = DEFAULT_PALETTE) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is not available");
    const host = canvas.parentElement;
    if (!host) throw new Error("The canvas must already be inside its parent element");
    this.canvas = canvas;
    this.ctx = ctx;
    this.palette = palette;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  /** Safe to call often: the drawing is merged into one per frame. */
  setState(state: RenderState): void {
    this.state = state;
    this.scheduleDraw();
  }

  /** The cell under a point of the screen (clientX, clientY), or null. */
  cellAt(clientX: number, clientY: number): { row: number; col: number } | null {
    const box = this.canvas.getBoundingClientRect();
    const { side, gutter, pad } = this.layout;
    return cellFromPoint(clientX - box.left, clientY - box.top, side, this.state.n, gutter, pad);
  }

  setPalette(palette: Palette): void {
    this.palette = palette;
    this.scheduleDraw();
  }

  /** Draws again, for example once a font the numbers use has been loaded. */
  invalidate(): void {
    this.scheduleDraw();
  }

  resetStats(): void {
    this.stats.draws = 0;
    this.stats.totalMs = 0;
    this.stats.maxMs = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.observer.disconnect();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private resize(): void {
    if (this.disposed) return;
    const host = this.canvas.parentElement!;
    this.dpr = window.devicePixelRatio || 1;
    this.layout = computeLayout(host.clientWidth, host.clientHeight, this.state.n);
    const { side } = this.layout;
    this.canvas.style.width = `${side}px`;
    this.canvas.style.height = `${side}px`;
    this.canvas.width = Math.max(1, Math.round(side * this.dpr));
    this.canvas.height = Math.max(1, Math.round(side * this.dpr));
    this.scheduleDraw();
  }

  private scheduleDraw(): void {
    if (this.disposed || this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      const t0 = performance.now();
      if (!this.paint()) return;
      const ms = performance.now() - t0;
      this.stats.draws++;
      this.stats.totalMs += ms;
      if (ms > this.stats.maxMs) this.stats.maxMs = ms;
    });
  }

  /** Returns false when it only triggered a resize (nothing was drawn). */
  private paint(): boolean {
    if (this.disposed) return false;
    const { n, queens, highlight, hover } = this.state;
    const host = this.canvas.parentElement!;
    const fresh = computeLayout(host.clientWidth, host.clientHeight, n);
    if (fresh.side !== this.layout.side) {
      this.resize();
      return false;
    }
    this.layout = fresh;

    const { ctx, palette } = this;
    const { side, gutter, pad, cell } = fresh;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, side, side);
    if (n <= 0 || cell <= 0) return true;
    const sz = Math.ceil(cell);
    const size = n * cell;
    const radius = Math.min(12, cell * 0.14);

    // The shadow of the board, cast by its own shape.
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = pad * this.dpr;
    ctx.shadowOffsetY = pad * 0.3 * this.dpr;
    ctx.fillStyle = palette.dark;
    ctx.beginPath();
    ctx.roundRect(gutter, gutter, size, size, radius);
    ctx.fill();
    ctx.restore();

    // The squares, the holes, the lit cell and the conflicts, cut to the rounded corners.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(gutter, gutter, size, size, radius);
    ctx.clip();
    ctx.translate(gutter, gutter);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? palette.light : palette.dark;
        ctx.fillRect(c * cell, r * cell, sz, sz);
      }
    }
    if (hover && hover.row >= 0 && hover.row < n && hover.col >= 0 && hover.col < n) {
      ctx.fillStyle = palette.hover;
      ctx.fillRect(hover.col * cell, hover.row * cell, sz, sz);
    }
    for (const b of this.state.blocked ?? []) if (b.kind === "hole") drawHole(ctx, b.col * cell, b.row * cell, cell);

    // Highlight: x = row, y = column. Fill first, outline after.
    const lw = Math.max(2, cell * 0.08);
    for (const h of highlight.cells) {
      if (h.x < 0 || h.x >= n || h.y < 0 || h.y >= n) continue;
      if (h.fill) {
        ctx.fillStyle = h.fill === "valid" ? palette.valid : palette.conflict;
        ctx.fillRect(h.y * cell, h.x * cell, sz, sz);
      }
    }
    for (const h of highlight.cells) {
      if (!h.outline || h.x < 0 || h.x >= n || h.y < 0 || h.y >= n) continue;
      ctx.strokeStyle = palette.outline;
      ctx.lineWidth = lw;
      ctx.strokeRect(h.y * cell + lw / 2, h.x * cell + lw / 2, cell - lw, cell - lw);
    }
    ctx.restore();

    // The pieces are not cut, so their shadows can reach over the edge of the board.
    ctx.save();
    ctx.translate(gutter, gutter);
    for (const b of this.state.blocked ?? [])
      if (b.kind === "wall") drawPiece(ctx, "pawn", "wood", b.col * cell, b.row * cell, cell);
    for (const q of queens) {
      if (q.row < 0 || q.row >= n || q.col < 0 || q.col >= n) continue;
      drawPiece(ctx, "queen", q.preplaced ? "blue" : "ebony", q.col * cell, q.row * cell, cell, { locked: q.preplaced });
    }
    ctx.restore();

    this.drawCoordinates(n, cell, gutter, hover);
    return true;
  }

  /** The numbers of the columns above the board and of the rows to its left. Skipped when the cells are tiny. */
  private drawCoordinates(n: number, cell: number, gutter: number, hover: RenderState["hover"]): void {
    if (cell < 18) return;
    const { ctx, palette } = this;
    ctx.save();
    ctx.font = `700 ${Math.max(11, Math.min(17, Math.round(cell * 0.2)))}px Montserrat, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = hover?.col === i ? palette.coordHi : palette.coord;
      ctx.fillText(String(i), gutter + (i + 0.5) * cell, gutter / 2);
      ctx.fillStyle = hover?.row === i ? palette.coordHi : palette.coord;
      ctx.fillText(String(i), gutter / 2, gutter + (i + 0.5) * cell);
    }
    ctx.restore();
  }
}
