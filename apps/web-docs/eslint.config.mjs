import base from "@salanor/config/eslint/base";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  { ignores: ["next-env.d.ts", ".next/**"] },
  ...base,
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];
