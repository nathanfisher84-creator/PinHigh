import { registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
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
  // A bare directory is not a module: `@/lib/db` must resolve to its
  // index.ts, which is what the bundler does.
  return candidates.find((c) => {
    if (!existsSync(c)) return false;
    try {
      return !statSync(c).isDirectory();
    } catch {
      return false;
    }
  });
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

    // `./columns` -> `./columns.ts`. Only extensionless specifiers: a relative
    // import that already names a file (sharp requiring `../package.json`, for
    // instance) must be left for Node to resolve normally.
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL &&
      path.extname(specifier) === ""
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const found = resolveFile(path.resolve(parentDir, specifier));
      if (found) return nextResolve(pathToFileURL(found).href, context);
    }

    return nextResolve(specifier, context);
  },
});
