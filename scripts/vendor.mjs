#!/usr/bin/env node
/**
 * Copies intentbar's source into a project instead of installing it.
 *
 * intentbar is not published to npm: it is zero-dependency TypeScript, and the
 * palette is meant to be edited anyway, so it is distributed the way shadcn
 * distributes components — the code lands in your repo and is yours.
 *
 *   node scripts/vendor.mjs ../my-app/src/lib/intentbar \
 *     --palette ../my-app/src/components/command-palette.tsx \
 *     --alias @/lib/intentbar
 *
 * The copy is mechanical and repeatable: run it again on a newer checkout to
 * take updates, and your version control shows exactly what changed.
 */
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const [target, ...rest] = argv;
  const options = { target, palette: null, alias: null };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag === "--palette") options.palette = value;
    else if (flag === "--alias") options.alias = value;
    else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}

/** The commit the copy came from, so a vendored file can say what it is. */
function sourceRevision() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Rewrites the package's own import style for a project's bundler.
 *
 * The sources use explicit `.js` specifiers because they are written as ESM;
 * inside an app, Next/Vite/webpack resolve extensionless paths to `.ts`, and a
 * `.js` specifier with no `.js` file next to it fails to resolve.
 */
function rewrite(source, { header }) {
  const body = source.replace(/(from\s+"\.{1,2}\/[^"]+)\.js"/g, '$1"');
  return body.startsWith('"use client"')
    ? body.replace('"use client";\n', `"use client";\n\n${header}\n`)
    : `${header}\n${body}`;
}

async function* walk(dir) {
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry);
    if ((await stat(path)).isDirectory()) yield* walk(path);
    else if (path.endsWith(".ts") || path.endsWith(".tsx")) yield path;
  }
}

async function main() {
  const { target, palette, alias } = parseArgs(process.argv.slice(2));
  if (!target) throw new Error("Usage: node scripts/vendor.mjs <target-dir> [--palette <file>] [--alias <alias>]");
  if (palette && !alias) throw new Error("--palette needs --alias, so the copied palette can import the copied hook");

  const revision = sourceRevision();
  const header =
    `/* Vendored from intentbar (${revision}). Edit freely — re-running\n` +
    `   scripts/vendor.mjs on a newer checkout overwrites this file. */`;

  const targetDir = resolve(target);
  let copied = 0;
  for await (const path of walk(join(ROOT, "src"))) {
    const destination = join(targetDir, relative(join(ROOT, "src"), path));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, rewrite(await readFile(path, "utf8"), { header }));
    copied += 1;
  }

  if (palette) {
    const destination = resolve(palette);
    const source = await readFile(join(ROOT, "templates", "command-palette.tsx"), "utf8");
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, rewrite(source.replace('from "intentbar/react"', `from "${alias}/react"`), { header }));
    copied += 1;
  }

  console.log(`Vendored ${copied} files from intentbar ${revision} into ${targetDir}`);
  console.log(
    palette
      ? `The palette imports the hook from ${alias}/react — check that alias resolves, and that your shadcn "command" and "dialog" components exist.`
      : "Import it as `<alias>` (core), `<alias>/server` (handler) and `<alias>/react` (hook).",
  );
}

await main();
