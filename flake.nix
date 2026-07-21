{
  description = "Rynkbench — a browser configurator for RMK/Rynk keyboards (keymaps + lighting over WebHID)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    # Follow the fork's composed master; flake.lock pins the exact protocol
    # revision used by firmware and the generated browser client.
    rmk = {
      url = "github:colonelpanic8/rmk/master";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, flake-utils, fenix, rmk }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        rmkRev = rmk.rev or "unknown";
        rustToolchain = fenix.packages.${system}.combine [
          fenix.packages.${system}.stable.rustc
          fenix.packages.${system}.stable.cargo
          fenix.packages.${system}.targets.wasm32-unknown-unknown.stable.rust-std
        ];
        rustPlatform = pkgs.makeRustPlatform {
          cargo = rustToolchain;
          rustc = rustToolchain;
        };

        rynk-wasm = rustPlatform.buildRustPackage {
          pname = "rynk-wasm";
          version = "0.0.0-${builtins.substring 0 8 rmkRev}";
          src = rmk;
          cargoRoot = "rynk";
          buildAndTestSubdir = "rynk";

          cargoLock = {
            lockFile = ./nix/rynk-wasm-Cargo.lock;
            outputHashes = {
              "trouble-host-0.7.0" = "sha256-OpuLHCdML9llLAEvYR1ZUvl2WnBekO3Cglunync5iZU=";
            };
          };
          nativeBuildInputs = [
            pkgs.binaryen
            pkgs.wasm-bindgen-cli_0_2_126
            pkgs.wasm-pack
          ];

          postPatch = ''
            cp ${./nix/rynk-wasm-Cargo.lock} rynk/Cargo.lock
          '';

          buildPhase = ''
            runHook preBuild
            export HOME="$TMPDIR/home"
            mkdir -p "$HOME"
            pushd rynk
            wasm-pack build --release --target web --mode no-install \
              --out-dir pkg rynk-wasm
            popd
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p "$out"
            cp -r rynk/rynk-wasm/pkg/. "$out/"
            runHook postInstall
          '';

          doCheck = false;
        };

        rynkbench = pkgs.buildNpmPackage {
          pname = "rynkbench";
          version = "0.0.0";
          src = self;
          npmDepsHash = "sha256-RFEkBVhRRTnM6hDVL+wQz65EnPz8YOhzLmLBf92aKfQ=";

          preBuild = ''
            rm -rf src/vendor/rynk-wasm
            mkdir -p src/vendor/rynk-wasm
            cp -r ${rynk-wasm}/. src/vendor/rynk-wasm/
          '';

          buildPhase = ''
            runHook preBuild
            npm exec tsc -b
            npm exec vite build
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            cp -r dist "$out"
            runHook postInstall
          '';
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.just
            pkgs.nodejs_22
          ];
        };

        packages.default = rynkbench;
        packages.rynkbench = rynkbench;
        packages.rynk-wasm = rynk-wasm;

        checks.default = rynkbench;

        formatter = pkgs.nixpkgs-fmt;
      });
}
