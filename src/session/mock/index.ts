// The mock backend: fully in-memory RynkSession implementations for demos
// and tests. Deliberately different simulated boards prove the UI renders
// purely from what a session reports — including one that advertises none of
// the optional lighting, pointing or split surfaces.

import type { SessionProvider } from "../types";
import { mockProvider } from "./board";
import { glove80Board } from "./glove80";
import { ortho60Board } from "./ortho60";
import { stub48Board } from "./stub48";

export const mockProviders: SessionProvider[] = [
  mockProvider(glove80Board),
  mockProvider(ortho60Board),
  mockProvider(stub48Board),
];
