// The card at the foot of the right column: what stands on the cell under the pointer. The line has a fixed height, so
// the column does not move when the pointer enters or leaves the board.
import { h } from "./dom";

export class BoardCard {
  readonly el: HTMLElement;
  private readonly cell = h("b", {});

  constructor() {
    this.el = h(
      "section",
      { class: "boardcard" },
      h("div", { class: "cell-info", "aria-live": "off" }, h("span", { class: "muted" }, "Cell"), this.cell),
    );
    this.setCell(undefined);
  }

  /** "(2,5) · queen", or nothing while the pointer is off the board. */
  setCell(text: string | undefined): void {
    this.cell.textContent = text ?? "–";
    this.cell.classList.toggle("muted", text === undefined);
  }
}
