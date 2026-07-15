"use client";

import { consoleInkCtaClass } from "./console-cta";

export const OPEN_CREATE_API_KEY_EVENT = "aegis:open-create-api-key";

export function CreateApiKeyButton() {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.hash = "#create-api-key";
        window.dispatchEvent(new CustomEvent(OPEN_CREATE_API_KEY_EVENT));
      }}
      className={`inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium no-underline transition-colors duration-150 ${consoleInkCtaClass}`}
    >
      + Create API key
    </button>
  );
}
