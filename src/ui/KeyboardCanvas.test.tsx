import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { KeyboardModel } from "../model/keyboard";
import { KeyboardCanvas } from "./KeyboardCanvas";

const model: KeyboardModel = {
  name: "Pointing test",
  variantIndex: 0,
  bounds: { minX: 0, minY: 0, maxX: 3, maxY: 3 },
  keys: [],
  encoders: [],
  pointingDevices: [
    { id: 0, label: "Left trackpad", x: 1.5, y: 1.5, radius: 1 },
  ],
  zones: [],
  topologyRevision: 1,
};

describe("KeyboardCanvas pointing devices", () => {
  it("renders an editable trackpad with its effective mode", () => {
    const markup = renderToStaticMarkup(
      <KeyboardCanvas
        model={model}
        decorFor={() => ({})}
        pointingDeviceDecorFor={() => ({ mode: "Scroll", selected: true })}
        onPointingDevicePointerDown={() => {}}
      />,
    );

    expect(markup).toContain('data-pointing-device-id="0"');
    expect(markup).toContain('role="button"');
    expect(markup).toContain('aria-label="Edit Left trackpad"');
    expect(markup).toContain("LEFT PAD");
    expect(markup).toContain("Scroll");
  });
});
