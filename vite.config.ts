import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// The version on the title screen comes from package.json, so a release bump is one edit.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
