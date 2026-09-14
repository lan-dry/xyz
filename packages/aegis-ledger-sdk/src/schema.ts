import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { ApsEvent } from "./types.js";

const schemaDir = join(dirname(fileURLToPath(import.meta.url)), "../../../spec/aps");
const apsSchema = JSON.parse(readFileSync(join(schemaDir, "v0.1.json"), "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateAps = ajv.compile(apsSchema);

export class ApsValidationError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "ApsValidationError";
  }
}

export function validateEvent(event: unknown): ApsEvent {
  if (!validateAps(event)) {
    const details =
      validateAps.errors?.map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`) ?? [];
    throw new ApsValidationError("APS event failed schema validation", details);
  }
  return event as ApsEvent;
}
