import { chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const binPath = join(scriptDir, "..", "dist", "index.js");

await chmod(binPath, 0o755);
