import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const warningFilePath = join(__dirname, "..", "data", "warnings.json");

async function readWarnings() {
  try {
    const file = await readFile(warningFilePath, "utf8");
    return JSON.parse(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeWarnings(warnings) {
  await mkdir(dirname(warningFilePath), { recursive: true });
  await writeFile(warningFilePath, JSON.stringify(warnings, null, 2));
}

export async function addWarning({ guildId, userId, moderatorId, reason }) {
  const warnings = await readWarnings();
  warnings[guildId] ??= {};
  warnings[guildId][userId] ??= [];

  const warning = {
    id: warnings[guildId][userId].length + 1,
    moderatorId,
    reason,
    createdAt: new Date().toISOString()
  };

  warnings[guildId][userId].push(warning);
  await writeWarnings(warnings);

  return {
    warning,
    count: warnings[guildId][userId].length
  };
}

export async function getWarnings(guildId, userId) {
  const warnings = await readWarnings();
  return warnings[guildId]?.[userId] ?? [];
}

export async function clearWarnings(guildId, userId) {
  const warnings = await readWarnings();
  const existingWarnings = warnings[guildId]?.[userId] ?? [];

  if (warnings[guildId]?.[userId]) {
    delete warnings[guildId][userId];
    await writeWarnings(warnings);
  }

  return existingWarnings.length;
}
