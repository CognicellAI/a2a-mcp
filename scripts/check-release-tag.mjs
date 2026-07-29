import { readFile } from "node:fs/promises";

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "";
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const version = packageJson.version;
const expectedTag = `v${version}`;
const semverTagPattern =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

if (!semverTagPattern.test(tag)) {
  throw new Error(`Release tag must be a SemVer tag like v0.1.0. Received: ${tag || "<empty>"}`);
}

if (tag !== expectedTag) {
  throw new Error(`Release tag ${tag} does not match package.json version ${version}. Expected ${expectedTag}.`);
}

process.stdout.write(`Release tag ${tag} matches package.json version ${version}.\n`);
