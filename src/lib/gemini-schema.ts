import { z } from "zod";

// Gemini limits the state space of constrained JSON generation. Keep its schema
// structural and enforce detailed limits with the original Zod schema afterwards.
const LOCAL_ONLY_CONSTRAINTS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "pattern",
  "format",
]);

function structuralSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(structuralSchema);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !LOCAL_ONLY_CONSTRAINTS.has(key))
      .map(([key, child]) => [
        key,
        // Property names are data: a property called "maximum" is still kept.
        key === "properties" || key === "$defs"
          ? Object.fromEntries(
              Object.entries(child as Record<string, unknown>).map(
                ([name, definition]) => [name, structuralSchema(definition)],
              ),
            )
          : structuralSchema(child),
      ]),
  );
}

export function geminiJsonSchema<T>(
  schema: z.ZodType<T>,
): Record<string, unknown> {
  return structuralSchema(z.toJSONSchema(schema)) as Record<string, unknown>;
}
