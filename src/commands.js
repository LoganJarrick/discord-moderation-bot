import {
  ChannelType,
  SlashCommandBuilder
} from "discord.js";
import {
  closeModmailThread,
  replyToModmailThread
} from "./modmail.js";
import { addWarning, clearWarnings, getWarnings } from "./warnings.js";

const maxWarningsBeforeKick = 3;
const departmentAdminRoleName = process.env.MODMAIL_STAFF_ROLE_NAME ?? "Department Administration";
const trainingRoleName = "Inspector";
const academyUrl = "https://www.roblox.com/games/75822607146189/Vancouver-Police-Academy";
const trainingTemplates = {
  basic: {
    name: "Basic Training",
    roleNames: [
      "Trainee",
      "Special Municipal Constable",
      "Constable 2nd Class",
      "Department Administration"
    ],
    body: "A Basic training is being hosted. Go to the locker room and grab your uniform then STS on the red line and wait for further instructions. Permission to Speak is activated."
  },
  sergeant: {
    name: "Sergeant Training",
    roleNames: ["Constable 1st Class"],
    body: "A Sergeant training is being hosted. Go to the locker room and grab your uniform then STS on the red line and wait for further instructions. Permission to Speak is activated."
  }
};

function isModeratorTargetValid(interaction, targetMember) {
  if (!targetMember) {
    return { valid: true };
  }

  if (targetMember.id === interaction.user.id) {
    return {
      valid: false,
      message: "You cannot use that moderation command on yourself."
    };
  }

  if (targetMember.id === interaction.guild.ownerId) {
    return {
      valid: false,
      message: "You cannot use that moderation command on the server owner."
    };
  }

  if (
    interaction.member.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0 &&
    interaction.guild.ownerId !== interaction.user.id
  ) {
    return {
      valid: false,
      message: "You cannot moderate someone with an equal or higher role."
    };
  }

  return { valid: true };
}

function botCanModerate(interaction, targetMember) {
  if (!targetMember) {
    return { valid: true };
  }

  if (targetMember.id === interaction.guild.ownerId) {
    return {
      valid: false,
      message: "I cannot moderate the server owner."
    };
  }

  if (interaction.guild.members.me.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
    return {
      valid: false,
      message: "My highest role must be above that member's highest role."
    };
  }

  return { valid: true };
}

async function replyEphemeral(interaction, content) {
  await interaction.reply({ content, ephemeral: true });
}

async function requireDepartmentAdmin(interaction) {
  const hasRole = hasAnyRole(interaction, [departmentAdminRoleName]);

  if (!hasRole) {
    await replyEphemeral(
      interaction,
      `You need the ${departmentAdminRoleName} role to use this command.`
    );
    return false;
  }

  return true;
}

function hasAnyRole(interaction, roleNames) {
  return interaction.member?.roles?.cache?.some((role) => roleNames.includes(role.name));
}

async function requireTrainingAccess(interaction) {
  const hasRole = hasAnyRole(interaction, [departmentAdminRoleName, trainingRoleName]);

  if (!hasRole) {
    await replyEphemeral(
      interaction,
      `You need the ${departmentAdminRoleName} or ${trainingRoleName} role to use this command.`
    );
    return false;
  }

  return true;
}

async function sendDm(user, message) {
  try {
    await user.send(message);
    return true;
  } catch {
    return false;
  }
}

async function sendModLog(interaction, message) {
  const channelId = process.env.MOD_LOG_CHANNEL_ID;

  if (!channelId) {
    return false;
  }

  const channel = await interaction.client.channels.fetch(channelId).catch((error) => {
    console.error("Could not fetch mod log channel:", error);
    return null;
  });

  if (!channel?.isTextBased()) {
    return false;
  }

  try {
    await channel.send(message);
    return true;
  } catch (error) {
    console.error("Could not send mod log message:", error);
    return false;
  }
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

function getRoleMentions(guild, roleNames) {
  return roleNames
    .map((roleName) => guild.roles.cache.find((role) => role.name === roleName))
    .filter(Boolean)
    .map((role) => role.toString())
    .join(" ");
}

export const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Check whether the bot is awake."),
    async execute(interaction) {
      if (!(await requireDepartmentAdmin(interaction))) {
        return;
      }

      await interaction.reply("Pong!");
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Ban a member from the server.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The member to ban.")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Why this member is being banned.")
          .setRequired(true)
          .setMaxLength(512)
      )
      .addIntegerOption((option) =>
        option
          .setName("delete_message_days")
          .setDescription("How many days of messages to delete.")
          .setMinValue(0)
          .setMaxValue(7)
      ),
    async execute(interaction) {
      if (!(await requireDepartmentAdmin(interaction))) {
        return;
      }

      const user = interaction.options.getUser("user", true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const reason = interaction.options.getString("reason", true);
      const deleteMessageSeconds =
        (interaction.options.getInteger("delete_message_days") ?? 0) * 24 * 60 * 60;

      const moderatorCheck = isModeratorTargetValid(interaction, member);
      if (!moderatorCheck.valid) {
        await replyEphemeral(interaction, moderatorCheck.message);
        return;
      }

      const botCheck = botCanModerate(interaction, member);
      if (!botCheck.valid) {
        await replyEphemeral(interaction, botCheck.message);
        return;
      }

      const dmSent = await sendDm(
        user,
        `You have been banned from ${interaction.guild.name}. Reason: ${reason}. Please make sure to follow the rules.`
      );

      await interaction.guild.members.ban(user.id, {
        reason: `${reason} | Banned by ${interaction.user.tag}`,
        deleteMessageSeconds
      });

      await sendModLog(
        interaction,
        `Ban: ${user.tag} (${user.id}) was banned by ${interaction.user.tag}. Reason: ${reason}`
      );
      await interaction.reply(`${user} has been banned. Reason: ${reason}`);

      if (!dmSent) {
        await interaction.followUp({
          content: "I could not DM that user before banning them.",
          ephemeral: true
        });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName("kick")
      .setDescription("Kick a member from the server.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The member to kick.")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Why this member is being kicked.")
          .setRequired(true)
          .setMaxLength(512)
      ),
    async execute(interaction) {
      if (!(await requireDepartmentAdmin(interaction))) {
        return;
      }

      const member = interaction.options.getMember("user");
      const reason = interaction.options.getString("reason", true);

      if (!member) {
        await replyEphemeral(interaction, "That user is not currently in this server.");
        return;
      }

      const moderatorCheck = isModeratorTargetValid(interaction, member);
      if (!moderatorCheck.valid) {
        await replyEphemeral(interaction, moderatorCheck.message);
        return;
      }

      const botCheck = botCanModerate(interaction, member);
      if (!botCheck.valid) {
        await replyEphemeral(interaction, botCheck.message);
        return;
      }

      const dmSent = await sendDm(
        member.user,
        `You have been kicked from ${interaction.guild.name}. Reason: ${reason}. Please make sure to follow the rules.`
      );

      await member.kick(`${reason} | Kicked by ${interaction.user.tag}`);
      await sendModLog(
        interaction,
        `Kick: ${member.user.tag} (${member.id}) was kicked by ${interaction.user.tag}. Reason: ${reason}`
      );
      await interaction.reply(`${member.user} has been kicked. Reason: ${reason}`);

      if (!dmSent) {
        await interaction.followUp({
          content: "I could not DM that user before kicking them.",
          ephemeral: true
        });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName("warn")
      .setDescription("Warn a member and save it locally.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The member to warn.")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Why this member is being warned.")
          .setRequired(true)
          .setMaxLength(512)
      ),
    async execute(interaction) {
      if (!(await requireDepartmentAdmin(interaction))) {
        return;
      }

      const user = interaction.options.getUser("user", true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const reason = interaction.options.getString("reason", true);

      const moderatorCheck = isModeratorTargetValid(interaction, member);
      if (!moderatorCheck.valid) {
        await replyEphemeral(interaction, moderatorCheck.message);
        return;
      }

      const botCheck = botCanModerate(interaction, member);
      if (!botCheck.valid) {
        await replyEphemeral(interaction, botCheck.message);
        return;
      }

      const { count } = await addWarning({
        guildId: interaction.guildId,
        userId: user.id,
        moderatorId: interaction.user.id,
        reason
      });

      const warningCount = Math.min(count, maxWarningsBeforeKick);
      const dmSent = await sendDm(
        user,
        `You have been warned in ${interaction.guild.name}. This is your ${warningCount}/${maxWarningsBeforeKick} of warnings. ${maxWarningsBeforeKick}/${maxWarningsBeforeKick} warnings will result in a kick. Please make sure to follow the rules. Reason: ${reason}`
      );

      let kicked = false;

      if (member && count >= maxWarningsBeforeKick) {
        await member.kick(
          `Reached ${count} warnings. Latest reason: ${reason} | Kicked by ${interaction.user.tag}`
        );
        kicked = true;
      }

      await sendModLog(
        interaction,
        `Warn: ${user.tag} (${user.id}) was warned by ${interaction.user.tag}. Warning ${count}/${maxWarningsBeforeKick}. Reason: ${reason}${kicked ? " | Kicked for reaching 3 warnings." : ""}`
      );

      await interaction.reply(
        `${user} has been warned. Reason: ${reason}${kicked ? ` They reached ${count} warnings and were kicked.` : ""}`
      );

      if (!dmSent) {
        await interaction.followUp({
          content: "I could not DM that user about their warning.",
          ephemeral: true
        });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName("warnings")
      .setDescription("View saved warnings for a member.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The member to check.")
          .setRequired(true)
      ),
    async execute(interaction) {
      if (!(await requireDepartmentAdmin(interaction))) {
        return;
      }

      const user = interaction.options.getUser("user", true);
      const warnings = await getWarnings(interaction.guildId, user.id);

      if (warnings.length === 0) {
        await replyEphemeral(interaction, `${user.tag} has no warnings.`);
        return;
      }

      const warningList = warnings
        .slice(-10)
        .map((warning) => {
          const date = new Date(warning.createdAt).toLocaleDateString();
          return `#${warning.id} on ${date}: ${warning.reason} (<@${warning.moderatorId}>)`;
        })
        .join("\n");

      await replyEphemeral(interaction, `Warnings for ${user.tag}:\n${warningList}`);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName("clearwarnings")
      .setDescription("Clear all saved warnings for a member.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The member whose warnings should be cleared.")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Why these warnings are being cleared.")
          .setMaxLength(512)
      ),
    async execute(interaction) {
      if (!(await requireDepartmentAdmin(interaction))) {
        return;
      }

      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") ?? "No reason provided.";
      const clearedCount = await clearWarnings(interaction.guildId, user.id);

      await sendModLog(
        interaction,
        `Clear Warnings: ${interaction.user.tag} cleared ${clearedCount} warning(s) for ${user.tag} (${user.id}). Reason: ${reason}`
      );

      await interaction.reply(`${user}'s warnings have been cleared. Removed ${clearedCount} warning(s). Reason: ${reason}`);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName("closemodmail")
      .setDescription("Close the current modmail thread.")
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Why this modmail thread is being closed.")
          .setRequired(true)
          .setMaxLength(512)
      ),
    async execute(interaction) {
      if (!(await requireDepartmentAdmin(interaction))) {
        return;
      }

      const reason = interaction.options.getString("reason", true);
      const result = await closeModmailThread(interaction, reason);

      if (!result.closed) {
        await replyEphemeral(interaction, result.message);
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName("reply")
      .setDescription("Reply to the user in the current modmail thread.")
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("The message to send to the user.")
          .setRequired(true)
          .setMaxLength(2000)
      ),
    async execute(interaction) {
      if (!(await requireDepartmentAdmin(interaction))) {
        return;
      }

      const message = interaction.options.getString("message", true);
      const result = await replyToModmailThread(interaction, message);

      if (!result.sent) {
        await replyEphemeral(interaction, result.message);
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName("say")
      .setDescription("Make the bot send a message.")
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("The message to send.")
          .setRequired(true)
          .setMaxLength(2000)
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Where to send the message. Defaults to this channel.")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      ),
    async execute(interaction) {
      if (!(await requireDepartmentAdmin(interaction))) {
        return;
      }

      const message = interaction.options.getString("message", true);
      const channel = interaction.options.getChannel("channel") ?? interaction.channel;

      if (!channel?.isTextBased()) {
        await replyEphemeral(interaction, "That channel cannot receive text messages.");
        return;
      }

      try {
        await channel.send(message);
      } catch (error) {
        console.error("Could not send /say message:", error);
        await replyEphemeral(
          interaction,
          "I could not send a message in that channel. Check my channel permissions."
        );
        return;
      }

      await sendModLog(
        interaction,
        `Say: ${interaction.user.tag} made me send a message in ${channel}. Message: ${message}`
      );
      await replyEphemeral(interaction, "Message sent.");
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName("training")
      .setDescription("Post a training announcement.")
      .addStringOption((option) =>
        option
          .setName("type")
          .setDescription("The training announcement to post.")
          .setRequired(true)
          .addChoices(
            { name: "Basic Training", value: "basic" },
            { name: "Sergeant Training", value: "sergeant" }
          )
      ),
    async execute(interaction) {
      if (!(await requireTrainingAccess(interaction))) {
        return;
      }

      const trainingType = interaction.options.getString("type", true);
      const template = trainingTemplates[trainingType];
      const channel = await getTextChannel(
        interaction.client,
        process.env.TRAINING_ANNOUNCEMENTS_CHANNEL_ID
      );

      if (!template) {
        await replyEphemeral(interaction, "I do not recognize that training type.");
        return;
      }

      if (!channel) {
        await replyEphemeral(
          interaction,
          "I need TRAINING_ANNOUNCEMENTS_CHANNEL_ID set to a valid text channel."
        );
        return;
      }

      const roleMentions = getRoleMentions(interaction.guild, template.roleNames);
      const message = `${roleMentions}\n\n${academyUrl}\n\n${template.body}`;

      await channel.send(message);
      await sendModLog(
        interaction,
        `Training: ${interaction.user.tag} posted ${template.name} in ${channel}.`
      );
      await replyEphemeral(interaction, `${template.name} announcement sent.`);
    }
  }
];

];
