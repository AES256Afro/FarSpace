// Selection follows a key. If it disappears, select the item at its old index,
// or the previous item when the old index is beyond the end of the list.
export class ListView<K> {
  keys: readonly K[] = [];
  index = 0;
  offset = 0;

  constructor(readonly pageSize: number) {
    if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("Invalid page size");
  }

  get selected(): K | undefined { return this.keys[this.index]; }
  get end(): number { return Math.min(this.keys.length, this.offset + this.pageSize); }

  sync(keys: readonly K[]): void {
    const selected = this.selected, top = this.keys[this.offset];
    this.keys = [...keys];
    const selectedIndex = selected === undefined ? -1 : keys.indexOf(selected);
    const topIndex = top === undefined ? -1 : keys.indexOf(top);
    if (topIndex >= 0) this.offset = topIndex;
    this.select(selectedIndex >= 0 ? selectedIndex : this.index);
  }

  select(index: number): void {
    this.index = Math.max(0, Math.min(this.keys.length - 1, Math.floor(index)));
    this.offset = Math.max(0, Math.min(this.offset, this.keys.length - this.pageSize));
    if (this.index < this.offset) this.offset = this.index;
    if (this.index >= this.offset + this.pageSize) this.offset = this.index - this.pageSize + 1;
  }

  move(rows: number): void { this.select(this.index + rows); }
  page(direction: number): void {
    this.offset = Math.max(0, Math.min(this.keys.length - this.pageSize, this.offset + direction * this.pageSize));
    this.move(direction * this.pageSize);
  }

  hit(x: number, y: number, rect: { x: number; y: number; width: number; rowHeight: number }): number | undefined {
    if (x < rect.x || x >= rect.x + rect.width || y < rect.y || y >= rect.y + this.pageSize * rect.rowHeight) return;
    const index = this.offset + Math.floor((y - rect.y) / rect.rowHeight);
    return index < this.keys.length ? index : undefined;
  }
}
