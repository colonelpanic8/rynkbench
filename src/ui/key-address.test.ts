import { describe, expect, it } from "vitest";
import {
  keyAddressLabel,
  keyAddressWithLegend,
  keyAtPosition,
  keyPlaceName,
  keyHoverTitle,
  matrixKeyLabel,
} from "./key-address";

describe("physical key labels", () => {
  const friendly = { row: 2, col: 8, address: "RH-C1R3", label: "Y" };

  it("leads with the support-friendly address and keeps the legend secondary", () => {
    expect(keyAddressLabel(friendly)).toBe("RH-C1R3");
    expect(keyAddressWithLegend(friendly)).toBe("RH-C1R3 · Y");
  });

  it("keeps raw matrix coordinates in diagnostic and hover text", () => {
    expect(matrixKeyLabel(friendly)).toBe("r2 · c8");
    expect(keyHoverTitle(friendly)).toBe("RH-C1R3 · matrix row 2, column 8 · Y");
  });

  it("falls back to a compact matrix label on an unknown board", () => {
    const unknown = { row: 4, col: 11 };
    expect(keyAddressLabel(unknown)).toBe("r4c11");
    expect(keyAddressWithLegend({ ...unknown, label: "Enter" })).toBe("r4c11 · Enter");
    expect(keyHoverTitle(unknown)).toBe("matrix row 4, column 11");
  });

  it("resolves position-only records through the board model", () => {
    expect(keyAtPosition([friendly], { row: 2, col: 8 })).toBe(friendly);
    expect(keyAtPosition([friendly], { row: 9, col: 9 })).toEqual({
      row: 9,
      col: 9,
    });
  });
});

describe("keyPlaceName", () => {
  it("says a MoErgo key's hand, row and column, or its thumb key", () => {
    expect(keyPlaceName({ row: 2, col: 2, address: "LH-C4R3" })).toBe("Left hand · row 3, column 4");
    expect(keyPlaceName({ row: 1, col: 7, address: "RH-T2" })).toBe("Right thumb · key 2");
  });

  it("falls back to the matrix place on other keyboards", () => {
    expect(keyPlaceName({ row: 1, col: 5 })).toBe("Row 1, column 5");
  });
});
