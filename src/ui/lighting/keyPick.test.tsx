// Picking keys on the board for a status setup: who steps aside, what the
// canvas says and collects, and what ends the pick.

import { afterEach, describe, expect, it } from "vitest";
import type { KeyPick } from "../../model/lighting/key-pick";
import type { Selection } from "../../model/workbench-state";
import { mockProvider } from "../../session/mock/board";
import { glove80Board } from "../../session/mock/glove80";
import { renderInWorkbench } from "../../test/workbench";
import { initialWorkbenchState } from "../../workbench";
import { openBundle } from "../bundle";
import { KeyEditor } from "../keymap/KeyEditor";
import { KeymapCenter } from "../keymap/KeymapCenter";
import { PickBanner } from "../keymap/PickBanner";
import { openProperties, closeProperties } from "../properties/store";
import { keyPick } from "./keyPick";

const bar: KeyPick = { kind: "battery", layer: 2, node: 0, order: "auto", style: "bands" };
const usb: KeyPick = { kind: "connection", layer: 2, connection: { type: "usb" } };

afterEach(() => {
  keyPick.stop();
  closeProperties();
});

describe("a pick of keys on the board", () => {
  it("lasts until it is stopped, or Layout properties is opened again", () => {
    keyPick.start(bar);
    expect(keyPick.get()).toBe(bar);
    keyPick.stop();
    expect(keyPick.get()).toBeNull();
    keyPick.start(usb);
    openProperties("lighting");
    expect(keyPick.get()).toBeNull();
  });

  const keys = [0, 1, 2].map((col) => ({ row: 0, col, ledId: col, shape: { rect: { x: col, y: 0 } } }));
  const banner = (pick: KeyPick, selection: Selection | null) =>
    renderInWorkbench(<PickBanner pick={pick} />, {
      bundle: { caps: { num_layers: 3 }, model: { keys: [...keys, { row: 1, col: 0, shape: { rect: { x: 0, y: 1 } } }] } },
      state: { layerMetadata: [{ occupied: true, name: "Base" }, { occupied: true, name: "Lower" }, { occupied: true, name: "Magic" }], selection },
    });
  const done = (html: string) => /<button[^>]*>Done<\/button>/.exec(html)![0];

  it("names what is picked and the layer, counts the keys, and holds Done back until they will do", () => {
    const two = banner(bar, { type: "key", row: 0, col: 1, more: [{ row: 0, col: 0 }] });
    expect(two).toContain("Click or drag over the keys for the battery bar on Magic");
    expect(two).toContain("2 chosen");
    expect(done(two)).toContain('title="A battery bar is 3 to 8 keys: 2 chosen"');

    const three = banner(bar, { type: "key", row: 0, col: 2, more: [{ row: 0, col: 0 }, { row: 0, col: 1 }] });
    expect(done(three)).not.toContain('aria-disabled="true"');

    const none = banner(usb, null);
    expect(none).toContain("Click the key for the USB key on Magic");
    expect(done(none)).toContain('title="Choose its key first"');
    // A key without an LED cannot carry a status light.
    expect(done(banner(usb, { type: "key", row: 1, col: 0 }))).toContain('aria-disabled="true"');
    expect(done(banner(usb, { type: "key", row: 0, col: 0 }))).not.toContain('aria-disabled="true"');
  });

  it("turns the keymap into the picker: its banner over the canvas, and no key editor", async () => {
    const session = await mockProvider(glove80Board).connect();
    try {
      const bundle = await openBundle(session);
      const [key] = bundle.model.keys;
      const parts = { bundle, state: { ...initialWorkbenchState(bundle), selection: { type: "key" as const, row: key.row, col: key.col } } };
      expect(renderInWorkbench(<KeymapCenter />, parts)).toContain("Drag to swap");
      expect(renderInWorkbench(<KeyEditor />, parts)).toContain("Pick Key");

      keyPick.start(bar);
      const canvas = renderInWorkbench(<KeymapCenter />, parts);
      expect(canvas).toContain("for the battery bar on Magic");
      expect(canvas).not.toContain("Drag to swap");
      const editor = renderInWorkbench(<KeyEditor />, parts);
      expect(editor).toContain("for the battery bar on Magic");
      expect(editor).not.toContain("Pick Key");
    } finally {
      await session.close();
    }
  });
});
