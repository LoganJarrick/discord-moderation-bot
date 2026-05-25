import "dotenv/config";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials
} from "discord.js";
import { commands } from "./commands.js";
import { handleModmailDm } from "./modmail.js";

const commandMap = new Map(commands.map((command) => [command.data.name, command]));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commandMap.get(interaction.commandName);

  if (!command) {
    await interaction.reply({
      content: "I do not recognize that command yet.",
      ephemeral: true
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);

    const reply = {
      content: "Something went wrong while running that command.",
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.content.trim()) {
    return;
  }

  if (message.channel.type === ChannelType.DM) {
    await handleModmailDm(message);
    return;
  }
});

if (!process.env.DISCORD_TOKEN) {
  throw new Error("Missing DISCORD_TOKEN in your .env file.");
}

await client.login(process.env.DISCORD_TOKEN);
