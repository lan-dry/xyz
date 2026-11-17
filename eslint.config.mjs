import base from "@salanor/config/eslint/base";

/** Root workspace — project packages have their own eslint.config.mjs */
export default [
  {
    ignores: [
      // CJS build helper inside the nested n8n package (no local eslint config).
      "integrations/n8n-nodes-salanor-aegis/scripts/**",
    ],
  },
  ...base,
];
