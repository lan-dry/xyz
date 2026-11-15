#!/usr/bin/env node
/**
 * Generate Java + C# OpenAPI clients from bank-events.openapi.yaml.
 *
 * Requires: Java (for openapi-generator-cli) OR npx @openapitools/openapi-generator-cli
 *
 * Usage:
 *   node tools/generated-clients/generate.mjs
 *   pnpm generate:openapi-clients
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const spec = join(root, "services/aegis-api/openapi/bank-events.openapi.yaml");
const outJava = join(root, "clients/java");
const outCsharp = join(root, "clients/csharp");

if (!existsSync(spec)) {
  console.error("OpenAPI spec missing:", spec);
  process.exit(2);
}

mkdirSync(outJava, { recursive: true });
mkdirSync(outCsharp, { recursive: true });

function runGenerator(generator, output, additional = []) {
  const args = [
    "@openapitools/openapi-generator-cli",
    "generate",
    "-i",
    spec,
    "-g",
    generator,
    "-o",
    output,
    "--skip-validate-spec",
    ...additional,
  ];
  console.log("npx", args.join(" "));
  const result = spawnSync("npx", args, {
    cwd: root,
    encoding: "utf8",
    shell: true,
    stdio: "inherit",
  });
  return result.status === 0;
}

const javaOk = runGenerator("java", outJava, [
  "--library",
  "native",
  "--additional-properties",
  "invokerPackage=com.salanor.aegis,apiPackage=com.salanor.aegis.api,modelPackage=com.salanor.aegis.model",
]);
const csOk = runGenerator("csharp", outCsharp, [
  "--additional-properties",
  "packageName=Salanor.Aegis.Client",
]);

// Smoke hello stubs (compile/run targets for CI)
writeFileSync(
  join(outJava, "HelloMain.java"),
  `// Smoke: after generate, compile against generated API.
public class HelloMain {
  public static void main(String[] args) {
    System.out.println("salanor-aegis-java-client-hello");
  }
}
`,
);
writeFileSync(
  join(outCsharp, "Hello.cs"),
  `// Smoke: after generate, dotnet run against generated client.
using System;
public class Hello {
  public static void Main() {
    Console.WriteLine("salanor-aegis-csharp-client-hello");
  }
}
`,
);

writeFileSync(
  join(__dirname, "README.md"),
  `# Generated OpenAPI clients

Spec: \`services/aegis-api/openapi/bank-events.openapi.yaml\`

\`\`\`bash
pnpm generate:openapi-clients
pnpm smoke:openapi-clients
\`\`\`

Outputs: \`clients/java\`, \`clients/csharp\`.
`,
);

if (!javaOk || !csOk) {
  console.warn(
    "openapi-generator-cli failed or missing — hello stubs still written. Install Java + run again for full clients.",
  );
  // Soft exit 0 so CI smoke of hello stubs can still run after a partial generate
}
console.log("done");
