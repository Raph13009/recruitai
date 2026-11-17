import "server-only";
import path from "node:path";

/**
 * Folder holding the local demo database and the generated session secret (web/.data by default).
 *
 * The path is built at runtime and hidden from the bundler on purpose: a traced path would make
 * every database write recompile and reload the open page in development (cutting the interview in
 * progress), and a dynamic one would make the build trace the whole project into the server bundle.
 */
export function dataFile(name: string): string {
  const dir = process.env.RECRUITAI_DATA_DIR || [".", "data"].join("");
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), dir, name);
}
