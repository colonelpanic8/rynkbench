import { describe, expect, it } from "vitest";
import { classifyError, SessionError, UnsupportedError } from "./errors";
import { isUnsupportedError, unsupported } from "./unsupported";

const rejected = (message: string) => Object.assign(new Error(message), { name: "Rejected" });

describe("classifyError", () => {
  it("reads typed errors by their code", () => {
    expect(classifyError(new UnsupportedError("lighting rules"))).toBe("unsupported");
    expect(classifyError(new SessionError("timeout", "no answer"))).toBe("timeout");
    expect(classifyError(new SessionError("busy", "queue full"))).toBe("busy");
  });

  it("recognizes the firmware's own wording at the boundary", () => {
    expect(classifyError(rejected("UnknownCmd"))).toBe("unsupported");
    expect(classifyError(new Error("command Unimplemented"))).toBe("unsupported");
    expect(classifyError(new Error("this firmware does not support x"))).toBe("unsupported");
    expect(classifyError(rejected("Busy"))).toBe("busy");
    expect(classifyError("UnknownCmd")).toBe("unsupported");
  });

  it("only treats a Rejected error as the firmware's Busy", () => {
    expect(classifyError(new Error("Busy"))).toBeUndefined();
    expect(classifyError(rejected("InvalidArgument"))).toBeUndefined();
  });

  it("leaves an ordinary failure unclassified", () => {
    expect(classifyError(new Error("port closed"))).toBeUndefined();
    expect(classifyError(undefined)).toBeUndefined();
  });

  it("does not mistake a typed failure of another kind for a missing feature", () => {
    expect(classifyError(new SessionError("timeout", "no answer to Unsupported probe"))).toBe("timeout");
  });
});

describe("unsupported", () => {
  it("builds a typed error that isUnsupportedError recognizes, with the usual wording", () => {
    const error = unsupported("lighting rules");
    expect(error).toBeInstanceOf(UnsupportedError);
    expect(error.message).toBe("this firmware does not support lighting rules");
    expect(isUnsupportedError(error)).toBe(true);
    expect(isUnsupportedError(new Error("port closed"))).toBe(false);
  });
});
