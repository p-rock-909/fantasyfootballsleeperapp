// The markdown rulesets that govern each feature's advice.
//
// Three of them now (start/sit, waivers, trades), each the system prompt for one route,
// each editable without a code change. They are read from disk per request, so they are
// cached for the life of a warm lambda the same way lib/defaultRankings.ts caches its CSV
// — a 26 KB read is cheap, but doing it on every POST for no reason is noise.

import { readFile } from "node:fs/promises";
import path from "node:path";

/** Thrown so a missing ruleset is distinguishable from a Sleeper failure in a Promise.all. */
export class MissingRulesError extends Error {}

const TTL_MS = 6 * 3600 * 1000;
const cache = new Map<string, { at: number; text: string }>();

/**
 * Load `content/<file>`, or throw `MissingRulesError` naming it.
 *
 * A missing ruleset is a deployment problem, not a user problem, so the message says
 * which file is absent rather than surfacing a bare ENOENT.
 */
export async function loadRules(file: string, what: string): Promise<string> {
  const hit = cache.get(file);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.text;
  try {
    const text = await readFile(path.join(process.cwd(), "content", file), "utf8");
    cache.set(file, { at: Date.now(), text });
    return text;
  } catch {
    throw new MissingRulesError(`content/${file} is missing from the deployment; ${what} cannot be loaded.`);
  }
}
