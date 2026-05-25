import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands.js";

const requiredEnvVars = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_GUILD_ID"];
const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing environment variables: ${missingEnvVars.join(", ")}`);
}

const commandData = commands.map((command) => command.data.toJSON());
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

console.log("Registering slash commands...");

await rest.put(
  Routes.applicationGuildCommands(
    process.env.DISCORD_CLIENT_ID,
    process.env.DISCORD_GUILD_ID
  ),
  { body: commandData }
);

console.log("Slash commands registered.");
