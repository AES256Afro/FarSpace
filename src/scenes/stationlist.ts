import { ListView } from "../core/listview";

// The station keeps its numeric cursor for domain code. This adapter retains
// the selected item and drawn row identity as the live list changes.
export class StationList {
  tab = -1;
  view = new ListView<string>(1);
  drawn: readonly string[] = [];
  removed = false;
  private objects = new WeakMap<object, number>();
  private nextObject = 0;

  objectKey(value: object): string {
    let id = this.objects.get(value);
    if (id === undefined) { id = this.nextObject++; this.objects.set(value, id); }
    return String(id);
  }

  sync(tab: number, keys: readonly string[], cursor: number, pageSize: number): number {
    if (tab !== this.tab) {
      this.tab = tab; this.view = new ListView<string>(pageSize);
      this.view.sync(keys); this.view.select(cursor); this.drawn = []; this.removed = false;
    } else {
      if (cursor !== this.view.index) this.view.select(cursor);
      const selected = this.view.selected;
      this.view.sync(keys);
      if (selected !== undefined && !keys.includes(selected)) this.removed = true;
    }
    return this.view.index;
  }

  takeRemoval(): boolean { const removed = this.removed; this.removed = false; return removed; }
  capture(): void { this.drawn = [...this.view.keys]; }
  drawnIndex(row: number): number { return this.drawn[row] === undefined ? -1 : this.view.keys.indexOf(this.drawn[row]); }
}
