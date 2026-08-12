import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { searchForWorkspaceRoot } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

// `npm run wasm` materializes each of these as a symlink to the exact
// flake-pinned Nix output. Vite resolves the symlink before enforcing its
// serving boundary, so every one of those immutable outputs has to be allowed by
// name — miss one and its `.wasm` is served as a 403, which surfaces in the
// browser as the thoroughly unhelpful "Failed to execute 'compile' on
// 'WebAssembly': HTTP status code is not ok".
const wasmRoots = ["rynk-wasm", "moergo-config-wasm"].map((pkg) =>
  realpathSync(new URL(`./src/vendor/${pkg}`, import.meta.url)),
);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
  },
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(projectRoot), ...wasmRoots],
    },
  },
});
