{
  description = "Rynkbench — a browser configurator for RMK/Rynk keyboards (keymaps + lighting over WebHID)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    # The Rynk protocol client under src/vendor/rynk-wasm is committed wasm-pack
    # output; this pin is the source it is built from. `regen-wasm` rebuilds the
    # vendored package against it. Keep the rev in sync with provenance.json.
    rmk = {
      url = "github:colonelpanic8/rmk/228f9bcdfa012512f89a8bc1b48f2a3daa0a8d53";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, flake-utils, fenix, rmk }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        rmkRev = rmk.rev or "unknown";

        # Toolchain for regenerating the vendored wasm. wasm-pack fetches the
        # matching wasm-bindgen itself, so the network is needed on regen.
        rustToolchain = fenix.packages.${system}.combine [
          fenix.packages.${system}.stable.rustc
          fenix.packages.${system}.stable.cargo
          fenix.packages.${system}.targets.wasm32-unknown-unknown.stable.rust-std
        ];
        regenInputs = [
          rustToolchain
          pkgs.wasm-pack
          pkgs.binaryen
          pkgs.nodejs_22
          pkgs.git
        ];

        regen-wasm = pkgs.writeShellApplication {
          name = "regen-wasm";
          runtimeInputs = regenInputs;
          text = ''
            out="src/vendor/rynk-wasm"
            if [ ! -f package.json ] || ! grep -q '"rynkbench"' package.json; then
              echo "regen-wasm: run from the rynkbench repo root" >&2
              exit 1
            fi

            # Default to the flake-pinned source; RMK_SRC overrides with a local
            # checkout. Capture the rev before any copy for provenance.
            src="''${RMK_SRC:-${rmk}}"
            rev="${rmkRev}"
            if [ -n "''${RMK_SRC:-}" ] && git -C "$src" rev-parse HEAD >/dev/null 2>&1; then
              rev="$(git -C "$src" rev-parse HEAD)"
            fi

            # The Nix store copy is read-only; cargo needs a writable workspace.
            if [ ! -w "$src" ]; then
              tmp="$(mktemp -d)"
              trap 'rm -rf "$tmp"' EXIT
              cp -a "$src"/. "$tmp"/
              chmod -R u+w "$tmp"
              src="$tmp"
            fi
            CARGO_TARGET_DIR="$(mktemp -d)"
            export CARGO_TARGET_DIR

            wasm-pack build --release --target web --out-dir "$PWD/$out" "$src/rynk/rynk-wasm"

            sha="$(sha256sum "$out/rynk_wasm_bg.wasm" | cut -d' ' -f1)"
            cat > "$out/provenance.json" <<EOF
            {
              "source": "github:colonelpanic8/rmk (rynk/rynk-wasm)",
              "rmkCommit": "$rev",
              "generationCommand": "nix run .#regen-wasm",
              "wasmSha256": "$sha"
            }
            EOF
            echo "regen-wasm: wrote $out from rmk $rev (sha256 $sha)"
          '';
        };
      in
      {
        # Development: just Node. The app builds from the committed wasm.
        devShells.default = pkgs.mkShell {
          packages = [ pkgs.nodejs_22 ];
        };

        # Regenerating the vendored wasm: Rust + wasm-pack, plus `regen-wasm`.
        devShells.regen = pkgs.mkShell {
          packages = regenInputs ++ [ regen-wasm ];
          RMK_SRC = "${rmk}";
        };

        packages.regen-wasm = regen-wasm;
        apps.regen-wasm = flake-utils.lib.mkApp { drv = regen-wasm; };

        formatter = pkgs.nixpkgs-fmt;
      });
}
