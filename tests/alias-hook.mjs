import { registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Makes the application's module specifiers resolvable under plain Node.
 *
 * The app resolves two things the bundler handles for it: the `@/*` path alias
 * from tsconfig, and extensionless relative imports. Rather than add a test
 * runner and a transpiler just for this, the built-in synchronous resolve hook
 * fills in both and lets Node's own type-stripping handle the TypeScript.
 */
const srcRoot = path.resolve(import.meta.dirname, "..", "src");

/** Try the shapes a TypeScript specifier can actually take on disk. */
function resolveFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
  return candidates.find((c) => existsSync(c) && !c.endsWith(path.sep));
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // `server-only` throws by design outside a React Server Component build.
    // Under test it is a no-op marker, so it resolves to an empty module.
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export{}", shortCircuit: true };
    }

    // `@/lib/...` -> `<root>/src/lib/...`
    if (specifier.startsWith("@/")) {
      const found = resolveFile(path.join(srcRoot, specifier.slice(2)));
      if (found) return nextResolve(pathToFileURL(found).href, context);
    }

    // `./columns` -> `./columns.ts`
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const found = resolveFile(path.resolve(parentDir, specifier));
      if (found) return nextResolve(pathToFileURL(found).href, context);
    }

    return nextResolve(specifier, context);
  },
});
