// Steps through the boards a run produced, under the board. A switch picks what to look at: Results (what the solver
// returned, with chips for a reference board or a missing solution when there is one) or Snapshots (the Debug run).
// Inside a list: first, previous, a slider, next, last, and Go to. The arrow keys, Page Up and Down, Home and End work
// too, unless the user is typing.
import { h } from "./dom";
import { icon } from "./icons";
import {
  DEFAULT_PLAY_SPEED,
  PLAY_SPEEDS,
  isEditable,
  navigationKey,
  playDelayMs,
  playNext,
  playStart,
} from "./navigation";
import { initialMode, sourcesOf, type BrowseMode, type BrowserItem, type BrowserSource } from "./sources";

const num = (n: number): string => n.toLocaleString("en-US");

const NO_RESULT_HINT = "The solver returned no boards to browse";
const NO_SNAPSHOT_HINT = "Turn on Debug run to record snapshots";

export class BoardBrowser {
  readonly el: HTMLElement;
  private readonly tabResults = h("button", { type: "button", role: "tab", id: "tab-results" }, "Results");
  private readonly tabSnapshots = h("button", { type: "button", role: "tab", id: "tab-snapshots" }, "Snapshots");
  private readonly chips = h("div", { class: "chips", role: "group", "aria-label": "Boards of the result" });
  private readonly first = h("button", { type: "button", class: "icon-btn", "aria-label": "First" }, icon("first"));
  private readonly prev = h("button", { type: "button", class: "icon-btn", "aria-label": "Previous" }, icon("prev"));
  private readonly next = h("button", { type: "button", class: "icon-btn", "aria-label": "Next" }, icon("next"));
  private readonly last = h("button", { type: "button", class: "icon-btn", "aria-label": "Last" }, icon("last"));
  private readonly play = h("button", { type: "button", class: "icon-btn play", "aria-label": "Play", "aria-pressed": "false" }, icon("play"));
  private readonly speed = h("select", { class: "speed", "aria-label": "Playback speed" });
  private readonly slider = h("input", { type: "range", class: "slider", min: "1", max: "1", value: "1", "aria-label": "Board number" });
  private readonly label = h("b", { class: "browser-label" });
  private readonly gotoIn = h("input", { type: "number", min: "1", step: "1", "aria-label": "Number", class: "goto-input" });
  private readonly gotoBtn = h("button", { type: "button" }, "Go to");
  private readonly note = h("p", { class: "navnote" });
  private readonly panel: HTMLElement;
  private sources: BrowserSource[] = [];
  private key: unknown;
  private mode: BrowseMode = "results";
  private activeId: string | undefined;
  private index = 0;
  private item: BrowserItem | null = null;
  /** While a Debug run goes on: the snapshot that is on the board. The lists are not browsable until it ends. */
  private live: string | undefined;
  /** The timer of playback, while the snapshots play. */
  private timer: number | undefined;

  constructor(private readonly onShow: (item: BrowserItem | null) => void) {
    const tablist = h("div", { class: "seg", role: "tablist", "aria-label": "What to show" }, this.tabResults, this.tabSnapshots);
    for (const v of PLAY_SPEEDS) this.speed.append(h("option", { value: String(v) }, `${v}/s`));
    this.speed.value = String(DEFAULT_PLAY_SPEED);
    const navrow = h("div", { class: "navrow" }, this.first, this.prev, this.play, this.slider, this.next, this.last);
    const info = h(
      "div",
      { class: "navinfo" },
      this.label,
      h("span", { class: "goto" }, this.speed, this.gotoIn, this.gotoBtn),
    );
    this.panel = h("div", { class: "navpanel", role: "tabpanel" }, navrow, info, this.note);
    this.el = h("div", { class: "browser" }, h("div", { class: "browser-top" }, tablist, this.chips), this.panel);

    this.tabResults.addEventListener("click", () => this.setMode("results"));
    this.tabSnapshots.addEventListener("click", () => this.setMode("snapshots"));
    tablist.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const to = this.mode === "results" ? this.tabSnapshots : this.tabResults;
      if (to.disabled) return;
      e.preventDefault();
      to.focus();
      to.click();
    });
    this.first.addEventListener("click", () => this.go(0));
    this.prev.addEventListener("click", () => this.go(this.index - 1));
    this.next.addEventListener("click", () => this.go(this.index + 1));
    this.last.addEventListener("click", () => this.go(this.source()!.count - 1));
    this.slider.addEventListener("input", () => this.go(Number(this.slider.value) - 1));
    this.play.addEventListener("click", () => this.togglePlay());
    this.speed.addEventListener("change", () => {
      if (this.timer !== undefined) this.startTimer();
    });
    const jump = (): void => {
      const k = Number(this.gotoIn.value);
      const s = this.source();
      if (s && Number.isInteger(k) && k >= 1 && k <= s.count) this.go(k - 1);
    };
    this.gotoBtn.addEventListener("click", jump);
    this.gotoIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") jump();
    });
    document.addEventListener("keydown", (e) => this.onKey(e));
    this.show(false); // nobody is listening yet
  }

  /** The board being shown, or null when there is nothing to browse. */
  get current(): BrowserItem | null {
    return this.item;
  }

  /**
   * Replaces the lists. With a new `key` the switch opens on its first mode and the list at its first item (or the one
   * it names). With the same key the user's place is kept, so a list that is only refreshed does not jump back.
   */
  setSources(sources: BrowserSource[], key: unknown): void {
    if (sources === this.sources && key === this.key) return;
    this.stopPlay();
    const same = key === this.key;
    const keepId = same ? this.activeId : undefined;
    const keepMode = same ? this.mode : undefined;
    this.sources = sources;
    this.key = key;
    this.mode = keepMode && sourcesOf(sources, keepMode).length > 0 ? keepMode : initialMode(sources);
    const list = sourcesOf(sources, this.mode);
    const kept = keepId ? list.find((s) => s.id === keepId) : undefined;
    const s = kept ?? list[0];
    this.activeId = s?.id;
    this.index = s ? (kept ? Math.min(this.index, s.count - 1) : (s.initial ?? 0)) : 0;
    this.show();
  }

  /** While a Debug run goes on the board follows the latest snapshot: say which one, and freeze the controls. */
  setLive(text: string | undefined): void {
    if (text === this.live) return;
    this.stopPlay();
    this.live = text;
    this.show();
  }

  private source(): BrowserSource | undefined {
    return sourcesOf(this.sources, this.mode).find((s) => s.id === this.activeId);
  }

  private setMode(mode: BrowseMode): void {
    const first = sourcesOf(this.sources, mode)[0];
    if (!first || mode === this.mode) return;
    this.stopPlay();
    this.mode = mode;
    this.activeId = first.id;
    this.index = first.initial ?? 0;
    this.show();
  }

  private pick(s: BrowserSource): void {
    this.stopPlay();
    this.activeId = s.id;
    this.index = s.initial ?? 0;
    this.show();
  }

  /** The user moves to another board: playing stops. */
  private go(i: number): void {
    this.stopPlay();
    this.moveTo(i);
  }

  private moveTo(i: number): void {
    const s = this.source();
    if (!s) return;
    this.index = Math.max(0, Math.min(s.count - 1, i));
    this.show();
  }

  private togglePlay(): void {
    if (this.timer !== undefined) {
      this.stopPlay();
      this.show();
      return;
    }
    const s = this.source();
    if (!s || s.count < 2) return;
    this.index = playStart(this.index, s.count);
    this.startTimer();
    this.show();
  }

  private startTimer(): void {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      const s = this.source();
      const to = s ? playNext(this.index, s.count) : null;
      if (to === null) {
        this.stopPlay();
        this.show();
        return;
      }
      this.moveTo(to);
    }, playDelayMs(Number(this.speed.value)));
  }

  private stopPlay(): void {
    if (this.timer === undefined) return;
    window.clearInterval(this.timer);
    this.timer = undefined;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || this.live !== undefined) return;
    if (isEditable(e.target as HTMLElement | null) || (e.target as HTMLElement | null)?.closest?.('[role="tablist"]')) return;
    const s = this.source();
    if (!s) return;
    const to = navigationKey(e.key, this.index, s.count);
    if (to === undefined) return;
    e.preventDefault();
    this.go(to);
  }

  private renderChips(): void {
    const list = sourcesOf(this.sources, this.mode);
    this.chips.hidden = list.length < 2;
    this.chips.replaceChildren(
      ...list.map((s) => {
        const b = h("button", { type: "button", "aria-pressed": String(s.id === this.activeId) }, s.chip);
        b.addEventListener("click", () => this.pick(s));
        return b;
      }),
    );
  }

  private show(notify = true): void {
    const hasResults = sourcesOf(this.sources, "results").length > 0;
    const hasSnapshots = sourcesOf(this.sources, "snapshots").length > 0;
    const frozen = this.live !== undefined;
    const shown = frozen ? "snapshots" : this.mode;
    for (const [tab, mode, has, hint] of [
      [this.tabResults, "results", hasResults, NO_RESULT_HINT],
      [this.tabSnapshots, "snapshots", hasSnapshots, NO_SNAPSHOT_HINT],
    ] as const) {
      tab.setAttribute("aria-selected", String(mode === shown));
      tab.tabIndex = mode === shown ? 0 : -1;
      tab.disabled = frozen || !has;
      tab.title = !frozen && !has ? hint : "";
    }
    this.panel.setAttribute("aria-labelledby", shown === "results" ? "tab-results" : "tab-snapshots");
    this.renderChips();
    const playing = this.timer !== undefined;
    const canPlay = !frozen && shown === "snapshots" && (this.source()?.count ?? 0) > 1;
    this.play.hidden = this.speed.hidden = shown !== "snapshots";
    this.play.disabled = !canPlay;
    this.play.setAttribute("aria-pressed", String(playing));
    this.play.setAttribute("aria-label", playing ? "Pause" : "Play");
    this.play.replaceChildren(icon(playing ? "pause" : "play"));

    const s = frozen ? undefined : this.source();
    if (frozen || !s || s.count === 0) {
      this.item = null;
      this.label.textContent = frozen ? this.live! : this.sources.length === 0 ? "No boards yet" : "Nothing to browse";
      this.setNav(0, 0);
      this.note.textContent = "";
      this.note.classList.remove("warn");
      if (notify) this.onShow(null);
      return;
    }
    this.item = s.at(this.index);
    this.label.textContent = this.item.label;
    this.setNav(this.index, s.count);
    this.note.textContent = this.item.note ?? "";
    this.note.classList.toggle("warn", Boolean(this.item.note));
    if (notify) this.onShow(this.item);
  }

  /** The controls for place `index` of `count`; with fewer than two boards there is nowhere to go. */
  private setNav(index: number, count: number): void {
    const many = count > 1;
    this.first.disabled = this.prev.disabled = !many || index === 0;
    this.next.disabled = this.last.disabled = !many || index >= count - 1;
    this.slider.disabled = !many;
    this.slider.max = String(Math.max(1, count));
    this.slider.value = String(index + 1);
    this.slider.style.setProperty("--pos", count > 1 ? `${(index / (count - 1)) * 100}%` : "0%");
    this.gotoIn.disabled = this.gotoBtn.disabled = !many;
    this.gotoIn.max = String(Math.max(1, count));
    this.gotoIn.placeholder = many ? `1-${num(count)}` : "";
  }
}
