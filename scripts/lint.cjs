/** Dependency-free repository checks using the project's TypeScript parser. */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
let failed = false,
  count = 0;
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? walk(path.join(dir, e.name))
        : /\.(tsx?|jsx?)$/.test(e.name)
          ? [path.join(dir, e.name)]
          : [],
    );
for (const file of [
  "app",
  "lib",
  "components",
  "constants",
  "supabase/functions",
].flatMap(walk)) {
  const source = fs.readFileSync(file, "utf8");
  count++;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  for (const diagnostic of ast.parseDiagnostics) {
    failed = true;
    console.error(
      `${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
    );
  }
  if (/^(<<<<<<<|=======|>>>>>>>)/m.test(source)) {
    failed = true;
    console.error(`${file}: unresolved merge conflict`);
  }
  if (
    file === path.join("lib", "store.ts") &&
    /await supabase\.from\([^\n]+\)\.(insert|update|delete)\([^\n]*;/.test(
      source.replace(/const \{[^}]+\} = await supabase/g, "checkedSupabase"),
    )
  ) {
    failed = true;
    console.error(`${file}: database mutation does not inspect its result`);
  }
}
console.log(
  `${count} source files checked for syntax, conflict markers, and unchecked store mutations.`,
);
process.exitCode = failed ? 1 : 0;
