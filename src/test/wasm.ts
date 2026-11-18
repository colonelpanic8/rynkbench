// Loads both wasm modules from disk before a test file runs. The app loads
// them in openBundle (ui/bundle.ts) before any workbench opens; Node cannot
// fetch them the way the browser does, so tests compile them here instead,
// and the app's loader then finds them ready.

import { readFileSync } from "node:fs";
import { initSync as initConfig } from "../vendor/moergo-config-wasm/moergo_config_wasm";
import { initSync as initRynk } from "../vendor/rynk-wasm/rynk_wasm";

initConfig({ module: readFileSync("src/vendor/moergo-config-wasm/moergo_config_wasm_bg.wasm") });
initRynk({ module: readFileSync("src/vendor/rynk-wasm/rynk_wasm_bg.wasm") });
