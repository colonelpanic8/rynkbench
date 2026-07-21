# Choose a fresh ephemeral-range port. Pass a port explicitly when a stable URL
# is useful, for example: `just dev 50000`.
random_port := `od -An -N2 -tu2 /dev/urandom | awk '{ print 49152 + ($1 % 16384) }'`

# List the available project commands.
default:
    @just --list

# Install JavaScript dependencies.
setup:
    npm install

# Materialize the flake-pinned Rynk WASM package.
wasm:
    npm run wasm

# Start Vite on all interfaces using a fresh high port.
dev port=random_port:
    CHOKIDAR_USEPOLLING="${CHOKIDAR_USEPOLLING:-1}" npm run dev -- --host 0.0.0.0 --port {{port}} --strictPort

# Run lint, tests, and the production build.
check: lint test build

# Run the linter.
lint:
    npm run lint

# Run the test suite once.
test:
    npm run test

# Typecheck and build the production bundle.
build:
    npm run build

# Build and serve the production bundle on all interfaces.
preview port=random_port: build
    npm run preview -- --host 0.0.0.0 --port {{port}} --strictPort

# Build all flake checks.
nix-check:
    nix flake check
