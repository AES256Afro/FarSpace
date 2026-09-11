import { ALMANAC } from "../data/almanac";
import { ReaderScene } from "./reader";

export class AlmanacScene extends ReaderScene {
  constructor() { super("HANDBOOK", ALMANAC); }
}
