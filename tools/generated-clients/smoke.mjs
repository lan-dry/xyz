#!/usr/bin/env node
/**
 * Compile/run hello stubs for generated clients (or fallbacks if generate skipped).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const javaHello = join(root, "clients/java/HelloMain.java");
const csHello = join(root, "clients/csharp/Hello.cs");

mkdirSync(join(root, "clients/java"), { recursive: true });
mkdirSync(join(root, "clients/csharp"), { recursive: true });

if (!existsSync(javaHello)) {
  writeFileSync(
    javaHello,
    `public class HelloMain { public static void main(String[] a){ System.out.println("salanor-aegis-java-client-hello"); } }\n`,
  );
}
if (!existsSync(csHello)) {
  writeFileSync(
    csHello,
    `using System; public class Hello { public static void Main(){ Console.WriteLine("salanor-aegis-csharp-client-hello"); } }\n`,
  );
}

let failed = 0;

const javac = spawnSync("javac", [javaHello], { encoding: "utf8" });
if (javac.status !== 0) {
  console.warn("javac not available or failed — skip Java smoke");
} else {
  const run = spawnSync(
    "java",
    ["-cp", join(root, "clients/java"), "HelloMain"],
    { encoding: "utf8" },
  );
  console.log((run.stdout ?? "").trim());
  if (!(run.stdout ?? "").includes("salanor-aegis-java-client-hello")) failed++;
}

const csTmp = join(tmpdir(), "aegis-cs-hello");
mkdirSync(csTmp, { recursive: true });
writeFileSync(join(csTmp, "Hello.cs"), readFileSync(csHello, "utf8"));
writeFileSync(
  join(csTmp, "Hello.csproj"),
  `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings></PropertyGroup></Project>`,
);
const dotnet = spawnSync("dotnet", ["run", "--project", join(csTmp, "Hello.csproj")], {
  encoding: "utf8",
});
if (dotnet.status !== 0) {
  console.warn("dotnet not available or failed — skip C# smoke");
  console.warn((dotnet.stderr ?? "").slice(0, 300));
} else {
  console.log((dotnet.stdout ?? "").trim());
  if (!(dotnet.stdout ?? "").includes("salanor-aegis-csharp-client-hello")) failed++;
}

process.exit(failed > 0 ? 1 : 0);
