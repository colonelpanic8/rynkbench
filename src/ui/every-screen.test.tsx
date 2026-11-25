// Every screen on every simulated board, as a keyboard and as a file: the
// whole workbench is drawn with each section open in turn, and every Layout
// properties tab (with RGB Lighting's Advanced parts) the board offers. A board
// that lacks a surface (no RGB, no Bluetooth, no encoders) must still draw
// every screen it has; the safety net for moving code out of `ui/`.

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { firmwareFactsOf, resolveCapabilities } from "../capabilities";
import type { ConnectedBundle } from "../model/workbench-state";
import { memorySession, mockProvider, type BoardSpec } from "../session/mock/board";
import { glove80Board } from "../session/mock/glove80";
import { mockProviders } from "../session/mock";
import { ortho60Board } from "../session/mock/ortho60";
import { plain36Board } from "../session/mock/plain36";
import { stub48Board } from "../session/mock/stub48";
import type { RynkSession, SessionKind } from "../session/types";
import { renderInWorkbench } from "../test/workbench";
import { ALL_SECTIONS, areaOfSection, areasFor, sectionTerm, type SectionId } from "./areas";
import { openBundle } from "./bundle";
import { ConditionalRulesPanel } from "./lighting/ConditionalRulesPanel";
import { FirmwareRulesPanel } from "./lighting/FirmwareRulesPanel";
import { StatusPresetsPanel } from "./lighting/StatusPresetsPanel";
import { DetailsSection } from "./properties/DetailsSection";
import { EffectsSection } from "./properties/EffectsSection";
import { FirmwareOptions } from "./properties/FirmwareOptions";
import { LayerLightingSettings } from "./properties/LayerLightingSettings";
import { LightingSection } from "./properties/LightingSection";
import { initialWorkbenchState } from "../workbench";
import { getWording, termFor } from "./terms";
import { Workbench } from "./Workbench";

// The workbench opens on the keymap; the section to open instead is set here
// before each drawing. Nothing else about the starting state changes.
const opened = vi.hoisted(() => ({ section: "keymap" as SectionId }));
vi.mock("../workbench", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../workbench")>();
  return {
    ...actual,
    initialWorkbenchState: (bundle: ConnectedBundle) => ({
      ...actual.initialWorkbenchState(bundle),
      mode: opened.section,
    }),
  };
});

const BOARDS: Array<[string, BoardSpec]> = [
  ["Glove80", glove80Board],
  ["Ortho 60", ortho60Board],
  ["Dev stub 48", stub48Board],
  ["Plain 36", plain36Board],
];

const KINDS: Array<[string, SessionKind]> = [
  ["a keyboard", "mock"],
  ["a file", "offline"],
];

it("covers every simulated board", () => {
  expect(BOARDS.map(([, spec]) => mockProvider(spec).title)).toEqual(mockProviders.map((provider) => provider.title));
});

/** The areas the workbench offers for this bundle (as `Workbench` asks for them). */
function areasOf(bundle: ConnectedBundle) {
  return areasFor({
    connected: bundle.session.kind !== "offline",
    combos: bundle.caps.max_combos > 0,
    morse: bundle.caps.max_morses > 0,
    macros: bundle.caps.macro_space_size > 0,
    forks: bundle.caps.max_forks > 0,
    tapProfiles: bundle.morseProfileCapacity > 0,
  });
}

function drawWorkbench(bundle: ConnectedBundle, section: SectionId): string {
  opened.section = section;
  return renderToStaticMarkup(<Workbench bundle={bundle} onClose={() => {}} onUnexpectedDisconnect={() => {}} />);
}

/** The name on the section tab that is selected, or null without section tabs. */
function selectedSection(html: string): string | null {
  const tabs = html.indexOf('aria-label="Sections"');
  if (tabs < 0) return null;
  return /aria-selected="true"[^>]*>([^<]*)</.exec(html.slice(tabs))?.[1] ?? null;
}

describe.each(BOARDS)("%s", (_board, spec) => {
  describe.each(KINDS)("as %s", (_kind, kind) => {
    let session: RynkSession;
    let bundle: ConnectedBundle;
    beforeAll(async () => {
      session = memorySession(spec, kind);
      bundle = await openBundle(session);
    });
    afterAll(async () => {
      await session.close();
    });

    it.each(ALL_SECTIONS)("opens %s, or the keymap where the board has no such section", (section) => {
      const areas = areasOf(bundle);
      const area = areaOfSection(areas, section);
      const shownArea = area ?? areas[0];
      const shown = area ? section : "keymap";
      const html = drawWorkbench(bundle, section);
      const wording = getWording();
      // The top bar has no Keymap or Behaviors button: the keymap is home, the Behavior Library opens Behaviors.
      const inTopBar = shownArea.id !== "layout" && shownArea.id !== "behaviors";
      expect(html.includes(`aria-current="page" title="${termFor(shownArea.term, wording)}"`)).toBe(inTopBar);
      expect(html.includes(`title="${termFor("area.layout", wording)}"`)).toBe(false);
      expect(selectedSection(html)).toBe(shown !== "keymap" && shownArea.sections.length > 1 ? termFor(sectionTerm(shown), wording) : null);
    });

    it("offers the lights on the keymap only where the board has them", () => {
      const html = drawWorkbench(bundle, "keymap");
      expect(html.includes('aria-label="Lights"')).toBe(spec.capabilities.lighting_enabled);
    });

    it("draws every Layout properties tab it offers", () => {
      const capabilities = resolveCapabilities(firmwareFactsOf(bundle));
      const parts = { bundle, state: initialWorkbenchState(bundle) };
      const transfer = { workspaceName: "my-layout", migrationTarget: null };
      const draw = (node: ReactNode) => renderInWorkbench(node, parts, transfer);

      expect(draw(<DetailsSection />)).toContain('value="my-layout"');
      expect(draw(<FirmwareOptions />)).not.toBe("");
      const lit = capabilities.has("lighting.state");
      expect(lit).toBe(spec.capabilities.lighting_enabled);
      if (lit) expect(draw(<LightingSection />)).toContain('role="switch"');
      if (capabilities.has("lighting.extension")) expect(draw(<EffectsSection />)).toContain('role="switch"');
      // RGB Lighting's Advanced parts, which open closed.
      if (capabilities.has("lighting.scenes")) expect(draw(<LayerLightingSettings />)).toContain("lit keys stored");
      if (capabilities.has("lighting.rules")) {
        draw(<StatusPresetsPanel />);
        draw(<ConditionalRulesPanel />);
      }
      if (capabilities.has("lighting.compiled")) draw(<FirmwareRulesPanel />);
    });
  });
});
