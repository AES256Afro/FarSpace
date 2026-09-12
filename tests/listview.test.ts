import { describe, expect, it } from "vitest";
import { ListView } from "../src/core/listview";

describe("list selection and viewport", () => {
  it("keeps the same item visible across insertions, removals and reorder", () => {
    const view = new ListView<string>(3); view.sync(["a", "b", "c", "d", "e"]); view.select(3);
    expect(view.selected).toBe("d"); expect(view.offset).toBe(1);
    view.sync(["new", "a", "b", "c", "d", "e"]); expect(view.selected).toBe("d"); expect(view.index).toBe(4); expect(view.offset).toBe(2);
    view.sync(["d", "a", "e"]); expect(view.selected).toBe("d"); expect(view.offset).toBe(0);
  });
  it("falls forward at a removed index and back when the last item disappears", () => {
    const view = new ListView<string>(2); view.sync(["a", "b", "c"]); view.select(1);
    view.sync(["a", "c"]); expect(view.selected).toBe("c");
    view.sync(["a"]); expect(view.selected).toBe("a");
    view.sync([]); view.page(1); expect(view.selected).toBeUndefined(); expect(view.offset).toBe(0); expect(view.end).toBe(0);
    view.sync(["z"]); expect(view.selected).toBe("z");
  });
  it("pages without skipping rows and reaches the exact end", () => {
    const view = new ListView<number>(7); view.sync(Array.from({ length: 23 }, (_, i) => i));
    view.page(1); expect(view.selected).toBe(7); expect(view.offset).toBe(7);
    view.page(1); expect(view.selected).toBe(14); expect(view.offset).toBe(14);
    view.select(99); expect(view.selected).toBe(22); expect(view.end).toBe(23); expect(view.offset).toBe(16);
    view.move(-99); expect(view.selected).toBe(0); expect(view.offset).toBe(0);
  });
  it("maps only visible row rectangles and leaves headers, margins and empty rows inert", () => {
    const view = new ListView<number>(3), rect = { x: 10, y: 30, width: 100, rowHeight: 20 };
    view.sync([0, 1, 2, 3, 4]); view.select(4);
    expect(view.hit(10, 30, rect)).toBe(2); expect(view.hit(109, 89, rect)).toBe(4);
    for (const [x, y] of [[9, 31], [110, 31], [50, 29], [50, 90]]) expect(view.hit(x, y, rect)).toBeUndefined();
    view.sync([0]); expect(view.hit(20, 51, rect)).toBeUndefined();
  });
});
