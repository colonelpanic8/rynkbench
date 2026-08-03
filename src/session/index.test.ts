import { describe, expect, it } from "vitest";
import { sessionProviders } from "./index";

describe("default session providers", () => {
  it("registers hardware backends only", () => {
    expect(sessionProviders().map((provider) => provider.kind)).toEqual([
      "native",
      "webhid",
      "webserial",
    ]);
  });
});
