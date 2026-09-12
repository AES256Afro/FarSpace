// The same complete career text that the Record tab exports.
import type { Game } from "../game";
import { chronicleText } from "../world";
import * as wire from "../core/wire";
import { ReaderScene } from "./reader";

export class ChronicleScene extends ReaderScene {
  constructor() { super("THE CHRONICLE", []); }
  enter(g?: Game): void {
    if (g) {
      this.sections.length = 0;
      let section: [string, string[]] = ["VOYAGE RECORD", ["X ON THE RECORD TAB SAVES THIS AS A TEXT FILE."]];
      this.sections.push(section);
      for (const line of chronicleText(g.world, wire.getCallsign()).split("\n")) {
        if (line && !line.startsWith(" ") && line.endsWith(":")) {
          section = [line.toUpperCase(), []]; this.sections.push(section);
        } else section[1].push(line.toUpperCase());
      }
    }
    super.enter(g);
  }
}
