import {
  ChannelType,
  PermissionFlagsBits
} from "discord.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const modmailFilePath = join(__dirname, "..", "data", "modmail.json");

async function readModmail() {
  try {
    const file = await readFile(modmailFilePath, "utf8");
    return JSON.parse(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { threads: {} };
    }

    throw error;
  }
}

async function writeModmail(modmail) {
  await mkdir(dirname(modmailFilePath), { recursive: true });
  await writeFile(modmailFilePath, JSON.stringify(modmail, null, 2));
}

function cleanChannelName(username) {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function getGuild(client) {
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!guildId) {
    return null;
  }

  return client.guilds.fetch(guildId).catch(() => null);
}

function getDepartmentAdministrationRole(guild) {
  const roleName = process.env.MODMAIL_STAFF_ROLE_NAME ?? "Department Administration";
  return guild.roles.cache.find((role) => role.name === roleName);
}

async function getTextChannel(client, channelId) {
  if (!channelId) {
    return null;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);

  if (!channel?.isTextBased()) {
    return null;
  }

  return channel;
}

async function sendModmailLog(client, message) {
  const channel = await getTextChannel(client, process.env.MODMAIL_LOG_CHANNEL_ID);

  if (!channel) {
    return false;
  }

  await channel.send(message);
  return true;
}

function getAttachmentFiles(attachments) {
  return attachments.map((attachment) => ({
    attachment: attachment.url,
    name: attachment.name ?? undefined
  }));
}

async function recoverModmailThread(interaction, modmail) {
  const existingThread = modmail.threads[interaction.channelId];

  if (existingThread?.status === "open") {
    return existingThread;
  }

  const topicMatch = interaction.channel?.topic?.match(/modmail-user:(\d+)/);
  let userId = topicMatch?.[1];

  if (!userId && interaction.channel?.messages) {
    const messages = await interaction.channel.messages.fetch({ limit: 100 }).catch(() => null);
    const openingMessage = messages?.find((message) =>
      message.author.id === interaction.client.user.id &&
      message.content.includes("New modmail thread from")
    );
    userId = openingMessage?.content.match(/\((\d{17,20})\)/)?.[1];
  }

  if (!userId) {
    return null;
  }

  const thread = {
    userId,
    channelId: interaction.channelId,
    status: "open",
    createdAt: new Date().toISOString(),
    recoveredAt: new Date().toISOString()
  };

  modmail.threads[interaction.channelId] = thread;
  await writeModmail(modmail);

  return thread;
}

export async function handleModmailDm(message) {
  const guild = await getGuild(message.client);

  if (!guild) {
    await message.author.send("I could not find the server for modmail. Please contact staff directly.");
    return;
  }

  await guild.members.fetchMe();
  await guild.roles.fetch();

  const staffRole = getDepartmentAdministrationRole(guild);

  if (!staffRole) {
    await message.author.send("I could not find the Department Administration role for modmail.");
    return;
  }

  const modmail = await readModmail();
  let thread = Object.values(modmail.threads).find(
    (item) => item.userId === message.author.id && item.status === "open"
  );
  let channel = thread
    ? await guild.channels.fetch(thread.channelId).catch(() => null)
    : null;

  if (!channel) {
    channel = await guild.channels.create({
      name: `modmail-${cleanChannelName(message.author.username) || message.author.id}`,
      type: ChannelType.GuildText,
      topic: `modmail-user:${message.author.id}`,
      parent: process.env.MODMAIL_CATEGORY_ID || undefined,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: staffRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ]
    });

    thread = {
      userId: message.author.id,
      channelId: channel.id,
      status: "open",
      createdAt: new Date().toISOString()
    };

    modmail.threads[channel.id] = thread;
    await writeModmail(modmail);

    await channel.send(
      `New modmail thread from ${message.author.tag} (${message.author.id}). Use /reply to DM the user. Use /closemodmail to close it.`
    );
    await message.author.send("Thanks, your message was sent to staff. They will reply as soon as they can.");
    await sendModmailLog(
      message.client,
      `Modmail opened by ${message.author.tag} (${message.author.id}) in ${channel}.`
    );
  }

  const files = getAttachmentFiles(message.attachments);
  const content = message.content.trim()
    ? `From ${message.author.tag}: ${message.content}`
    : `From ${message.author.tag}:`;

  await channel.send({ content, files });
}

export async function replyToModmailThread(interaction, replyMessage, attachment) {
  const modmail = await readModmail();
  const thread = await recoverModmailThread(interaction, modmail);

  if (!thread || thread.status !== "open") {
    return { sent: false, message: "This is not an open modmail channel." };
  }

  const user = await interaction.client.users.fetch(thread.userId).catch(() => null);

  if (!user) {
    return { sent: false, message: "I could not find the user for this modmail thread." };
  }

  const payload = {
    content: `Staff: ${replyMessage}`
  };

  if (attachment) {
    payload.files = [
      {
        attachment: attachment.url,
        name: attachment.name ?? undefined
      }
    ];
  }

  await user.send(payload);
  await interaction.reply(`Reply sent to <@${thread.userId}>.`);
  return { sent: true };
}

export async function reopenModmailThread(interaction, user) {
  const modmail = await readModmail();
  const thread = {
    userId: user.id,
    channelId: interaction.channelId,
    status: "open",
    createdAt: new Date().toISOString(),
    reopenedAt: new Date().toISOString(),
    reopenedBy: interaction.user.id
  };

  modmail.threads[interaction.channelId] = thread;
  await writeModmail(modmail);

  if (interaction.channel?.setTopic) {
    await interaction.channel
      .setTopic(`modmail-user:${user.id}`, `Modmail reopened by ${interaction.user.tag}`)
      .catch(() => {});
  }

  await sendModmailLog(
    interaction.client,
    `Modmail reopened by ${interaction.user.tag} for ${user.tag} (${user.id}) in ${interaction.channel}.`
  );

  await interaction.reply(`This channel is now reopened as a modmail thread for ${user}.`);
}

export async function closeModmailThread(interaction, reason) {
  const modmail = await readModmail();
  const thread = await recoverModmailThread(interaction, modmail);

  if (!thread || thread.status !== "open") {
    return { closed: false, message: "This is not an open modmail channel." };
  }

  thread.status = "closed";
  thread.closedAt = new Date().toISOString();
  thread.closedBy = interaction.user.id;
  thread.closeReason = reason;

  await writeModmail(modmail);

  const user = await interaction.client.users.fetch(thread.userId).catch(() => null);

  if (user) {
    await user.send(`Your modmail thread has been closed. Reason: ${reason}`);
  }

  await sendModmailLog(
    interaction.client,
    `Modmail closed by ${interaction.user.tag} for <@${thread.userId}>. Reason: ${reason}`
  );

  await interaction.reply("Modmail thread closed. This channel will be deleted in 5 seconds.");
  setTimeout(() => {
    interaction.channel.delete(`Modmail closed by ${interaction.user.tag}: ${reason}`).catch(() => {});
  }, 5000);

  return { closed: true };
}


           
