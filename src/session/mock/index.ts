// The mock backend: fully in-memory RynkSession implementations for demos
// and tests. Two deliberately different simulated boards prove the UI
// renders purely from what a session reports.

import type { SessionProvider } from "../types";
import { mockProvider } from "./board";
import { glove80Board } from "./glove80";
import { ortho60Board } from "./ortho60";

export const mockProviders: SessionProvider[] = [
  mockProvider(glove80Board),
  mockProvider(ortho60Board),
];
