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
    # The MoErgo configuration model. Its `dependencies/rmk` submodule is not
    # part of what GitHub serves for a revision, so the package below grafts
    # this flake's own `rmk` pin into that slot — which is also what keeps the
    # two wasm packages agreeing about the protocol types they both generate.
    moergo-rmk = {
      url = "github:colonelpanic8/moergo-rmk";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, flake-utils, fenix, rmk, moergo-rmk }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        rmkRev = rmk.rev or "unknown";
        moergoRmkRev = moergo-rmk.rev or "unknown";
        rustToolchain = fenix.packages.${system}.combine [
          fenix.packages.${system}.stable.rustc
          fenix.packages.${system}.stable.cargo
          fenix.packages.${system}.stable.clippy
          fenix.packages.${system}.stable.rustfmt
          fenix.packages.${system}.targets.wasm32-unknown-unknown.stable.rust-std
        ];

        # The Android shell adds the NDK's target std libraries. Kept separate
        # from `rustToolchain` so a plain `nix develop` does not pull them in.
        androidRustToolchain = fenix.packages.${system}.combine [
          fenix.packages.${system}.stable.rustc
          fenix.packages.${system}.stable.cargo
          fenix.packages.${system}.stable.clippy
          fenix.packages.${system}.stable.rust-src
          fenix.packages.${system}.targets.wasm32-unknown-unknown.stable.rust-std
          fenix.packages.${system}.targets.aarch64-linux-android.stable.rust-std
          fenix.packages.${system}.targets.armv7-linux-androideabi.stable.rust-std
          fenix.packages.${system}.targets.x86_64-linux-android.stable.rust-std
          fenix.packages.${system}.targets.i686-linux-android.stable.rust-std
        ];

        # The SDK is unfree and its licences must be accepted to unpack it, so
        # this is a second nixpkgs instance rather than a config on the shared
        # one: nothing but the Android shell should need either.
        androidPkgs = import nixpkgs {
          inherit system;
          config = {
            allowUnfree = true;
            android_sdk.accept_license = true;
          };
        };

        androidComposition = androidPkgs.androidenv.composeAndroidPackages {
          # Matches `compileSdk`/`targetSdk` and the AGP version in the
          # generated gradle project under src-tauri/gen/android.
          platformVersions = [ "36" ];
          # 36 matches the gradle project's compileSdk; R8 asks for 35 on top
          # of that and cannot install it itself — the store is read-only.
          buildToolsVersions = [ "35.0.0" "36.0.0" ];
          includeNDK = true;
          ndkVersions = [ "27.0.12077973" ];
          includeEmulator = false;
          includeSystemImages = false;
        };

        androidSdk = androidComposition.androidsdk;
        androidSdkRoot = "${androidSdk}/libexec/android-sdk";
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

          # RMK patches crates.io with git revisions (Embassy, TrouBLE, bluest).
          cargoLock = {
            lockFile = ./nix/rynk-wasm-Cargo.lock;
            allowBuiltinFetchGit = true;
          };
          nativeBuildInputs = [
            pkgs.binaryen
            pkgs.wasm-bindgen-cli_0_2_126
            pkgs.wasm-pack
          ];

          postPatch = ''
            cp ${./nix/rynk-wasm-Cargo.lock} rynk/Cargo.lock
            # Store copies are read-only; leaving it so turns "this lock is
            # stale for the pinned rmk" into an unreadable permission error.
            chmod u+w rynk/Cargo.lock
            # The vendor dir holds only locked packages, so cargo cannot load
            # the git patches this workspace leaves unused while offline.
            for crate in $(awk '/^\[\[patch\.unused\]\]/ { getline; gsub(/name = |"/, ""); print }' rynk/Cargo.lock); do
              sed -i "/^$crate *= *{ git/d" rynk/Cargo.toml
            done
          '';

          buildPhase = ''
            runHook preBuild
            export HOME="$TMPDIR/home"
            # rustc reports this requirement when compiling the generated
            # client's proc-macro dependency graph.
            export RUST_MIN_STACK=67108864
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
            # wasm-pack writes the crate's own semver, which never moves on the
            # fork. Record the pin instead: it is the only thing that identifies
            # which protocol encoding this client speaks.
            echo '{"input":"rmk","rev":"${rmkRev}"}' > "$out/build-rev.json"
            runHook postInstall
          '';

          doCheck = false;
        };

        # The `glove80.toml` / MoErgo JSON round-trip, compiled to wasm. The
        # browser and the `moergo-control` CLI run the same parser, validator
        # and renderer, so a file cannot mean one thing here and another there.
        moergo-config-wasm = rustPlatform.buildRustPackage {
          pname = "moergo-config-wasm";
          version = "0.0.0-${builtins.substring 0 8 moergoRmkRev}";

          src = pkgs.runCommand "moergo-rmk-with-rmk" { } ''
            cp -r ${moergo-rmk} "$out"
            chmod -R u+w "$out"
            rm -rf "$out/dependencies/rmk"
            mkdir -p "$out/dependencies"
            cp -r ${rmk} "$out/dependencies/rmk"
          '';

          cargoLock = {
            lockFile = "${moergo-rmk}/Cargo.lock";
            allowBuiltinFetchGit = true;
          };
          nativeBuildInputs = [
            pkgs.binaryen
            pkgs.wasm-bindgen-cli_0_2_126
            pkgs.wasm-pack
          ];

          buildPhase = ''
            runHook preBuild
            export HOME="$TMPDIR/home"
            export RUST_MIN_STACK=67108864
            mkdir -p "$HOME"
            wasm-pack build --release --target web --mode no-install \
              --out-dir pkg crates/moergo-config-wasm
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p "$out"
            cp -r crates/moergo-config-wasm/pkg/. "$out/"
            echo '{"input":"moergo-rmk","rev":"${moergoRmkRev}"}' > "$out/build-rev.json"
            runHook postInstall
          '';

          # The crate is wasm32-gated, so a host-target check would compile an
          # empty library; the model's own tests live in moergo-config.
          doCheck = false;
        };

        rynkbench = pkgs.buildNpmPackage {
          pname = "rynkbench";
          version = "0.0.0";
          src = self;
          npmDepsHash = "sha256-RFEkBVhRRTnM6hDVL+wQz65EnPz8YOhzLmLBf92aKfQ=";

          preBuild = ''
            rm -rf src/vendor/rynk-wasm src/vendor/moergo-config-wasm
            mkdir -p src/vendor/rynk-wasm src/vendor/moergo-config-wasm
            cp -r ${rynk-wasm}/. src/vendor/rynk-wasm/
            cp -r ${moergo-config-wasm}/. src/vendor/moergo-config-wasm/
          '';

          buildPhase = ''
            runHook preBuild
            npm exec -- tsc -b
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
            # The crate is also a cdylib so the Android build can load it as a
            # JNI library; on desktop that artifact is dead weight.
            rm -rf $out/lib

            mv $out/bin/rynkbench-app $out/bin/rynkbench

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

        # Everything `cargo tauri android` needs: the SDK/NDK, a JDK, gradle,
        # and a Rust toolchain carrying the four Android target std libraries.
        devShells.android = pkgs.mkShell {
          packages = [
            androidRustToolchain
            androidSdk
            pkgs.cargo-ndk
            pkgs.cargo-tauri
            pkgs.jdk17
            pkgs.just
            pkgs.nodejs_22
            pkgs.pkg-config
          ];

          ANDROID_HOME = androidSdkRoot;
          ANDROID_SDK_ROOT = androidSdkRoot;
          NDK_HOME = "${androidSdkRoot}/ndk/27.0.12077973";
          JAVA_HOME = "${pkgs.jdk17}";

          shellHook = ''
            # The generated gradle project resolves aapt2 from the maven
            # artifact, which ships a prebuilt binary the Nix store cannot run.
            export GRADLE_OPTS="-Dorg.gradle.project.android.aapt2FromMavenOverride=${androidSdkRoot}/build-tools/36.0.0/aapt2"
          '';
        };

        packages.default = rynkbench;
        packages.rynkbench = rynkbench;
        packages.rynkbench-tauri = rynkbench-tauri;
        packages.rynk-wasm = rynk-wasm;
        packages.moergo-config-wasm = moergo-config-wasm;

        checks.default = rynkbench;
        checks.tauri = rynkbench-tauri;

        formatter = pkgs.nixpkgs-fmt;
      });
}
