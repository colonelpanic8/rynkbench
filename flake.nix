{
  description = "Rynkbench — a browser configurator for RMK/Rynk keyboards (keymaps + lighting over WebHID)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    # Follow the fork's fork-fold assembled branch; flake.lock pins the exact
    # protocol revision used by firmware and the generated browser client.
    rmk = {
      url = "github:colonelpanic8/rmk/assembled";
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
              "trouble-host-0.7.0" = "sha256-QBaTrDmBCLNN+lbJBBcvJbD2hq0Bx1fuFC4p7onSiRw=";
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
            export RUST_MIN_STACK=16777216
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

        # Desktop shell: the built web UI in a Tauri window, with a native
        # hidapi transport replacing WebHID (which WebKitGTK never shipped).
        rynkbench-tauri = rustPlatform.buildRustPackage {
          pname = "rynkbench-tauri";
          version = "0.1.0";
          src = self;
          cargoRoot = "src-tauri";
          buildAndTestSubdir = "src-tauri";

          cargoLock.lockFile = ./src-tauri/Cargo.lock;

          nativeBuildInputs = [
            pkgs.desktop-file-utils
            pkgs.pkg-config
            pkgs.wrapGAppsHook3
          ];
          buildInputs = [
            pkgs.gtk3
            pkgs.libsoup_3
            pkgs.udev
            pkgs.webkitgtk_4_1
          ];

          # tauri_build embeds frontendDist (../dist relative to src-tauri)
          # into the binary at compile time.
          postPatch = ''
            cp -r ${rynkbench} dist
          '';

          # WebKitGTK's DMA-BUF renderer renders a blank window on GPU/driver
          # combinations common outside NixOS-matched Mesa; the shared-memory
          # fallback always works. Wrapper default only — the env still wins.
          preFixup = ''
            gappsWrapperArgs+=(--set-default WEBKIT_DISABLE_DMABUF_RENDERER 1)
          '';

          # rustc links the GTK/WebKit stack via pkg-config but leaves the
          # binary's RUNPATH empty; pin the runtime search path explicitly.
          postFixup = ''
            patchelf --set-rpath ${pkgs.lib.makeLibraryPath [
              pkgs.cairo
              pkgs.dbus
              pkgs.gdk-pixbuf
              pkgs.glib
              pkgs.gtk3
              pkgs.libsoup_3
              pkgs.udev
              pkgs.webkitgtk_4_1
            ]} $out/bin/.rynkbench-wrapped
          '';

          # The launcher entry. Exec is absolute so the entry works without
          # the package on PATH; StartupWMClass is the window's real
          # WM_CLASS res_class, which is what lets the shell associate the
          # running window with this entry instead of showing it unnamed.
          postInstall = ''
            mv $out/bin/rynkbench-desktop $out/bin/rynkbench

            install -Dm444 ${./src-tauri/icons/icon.png} \
              $out/share/icons/hicolor/128x128/apps/rynkbench.png

            mkdir -p $out/share/applications
            cat > $out/share/applications/rynkbench.desktop <<EOF
            [Desktop Entry]
            Type=Application
            Name=Rynkbench
            GenericName=Keyboard Configurator
            Comment=Configure RMK/Rynk keyboard keymaps and lighting over USB
            Exec=$out/bin/rynkbench
            Icon=rynkbench
            Terminal=false
            Categories=Utility;Settings;HardwareSettings;
            Keywords=keyboard;keymap;rmk;rynk;glove80;lighting;
            StartupWMClass=Rynkbench
            EOF

            desktop-file-validate $out/share/applications/rynkbench.desktop
          '';

          doCheck = false;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.just
            pkgs.nodejs_22
            pkgs.pkg-config
            rustToolchain
          ];
          buildInputs = [
            pkgs.gtk3
            pkgs.libsoup_3
            pkgs.udev
            pkgs.webkitgtk_4_1
          ];
        };

        packages.default = rynkbench;
        packages.rynkbench = rynkbench;
        packages.rynkbench-tauri = rynkbench-tauri;
        packages.rynk-wasm = rynk-wasm;

        checks.default = rynkbench;

        formatter = pkgs.nixpkgs-fmt;
      });
}
