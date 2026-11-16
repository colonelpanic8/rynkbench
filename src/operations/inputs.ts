// Checking an operation's input against its fields, so a caller that is not
// TypeScript (a Flow, an assistant) gets a plain message, not a crash. Pure.

import type { InputField } from "./types";

function fits(field: InputField, value: unknown): boolean {
  switch (field.kind) {
    case "integer":
      return Number.isInteger(value) && (field.min === undefined || (value as number) >= field.min);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "choice":
      return typeof value === "string" && (field.values ?? []).includes(value);
    case "value":
      return value !== undefined;
  }
}

const expected = (field: InputField): string =>
  field.kind === "choice" ? `one of ${(field.values ?? []).join(", ")}` : field.kind === "integer" && field.min !== undefined ? `an integer from ${field.min}` : `a ${field.kind}`;

/** What is wrong with the input, or null when it fits every field. */
export function checkInput(fields: readonly InputField[], input: unknown): string | null {
  if (typeof input !== "object" || input === null) return "the input must be an object";
  const record = input as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field.name];
    if (value === undefined) {
      if (field.optional) continue;
      return `${field.name} is missing`;
    }
    if (field.list) {
      if (!Array.isArray(value)) return `${field.name} must be a list`;
      const index = value.findIndex((item) => !fits(field, item));
      if (index >= 0) return `${field.name}[${index}] must be ${expected(field)}`;
    } else if (!fits(field, value)) {
      return `${field.name} must be ${expected(field)}`;
    }
  }
  return null;
}
