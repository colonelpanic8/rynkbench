import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, searchForWorkspaceRoot } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const wasmRoot = realpathSync(new URL("./src/vendor/rynk-wasm", import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      // `npm run wasm` materializes this directory as a symlink to the exact
      // flake-pinned Nix output. Vite resolves the symlink before enforcing
      // its serving boundary, so explicitly allow that one immutable output.
      allow: [searchForWorkspaceRoot(projectRoot), wasmRoot],
    },
  },
});
