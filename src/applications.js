import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} from "discord.js";

const defaultInterviewCategoryId = "1510490953540964492";
const interviewCategoryId =
  process.env.APPLICATION_INTERVIEW_CATEGORY_ID ?? defaultInterviewCategoryId;
const departmentAdminRoleName = process.env.MODMAIL_STAFF_ROLE_NAME ?? "Department Administration";

function cleanChannelName(username) {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function formatAnswer(answer) {
  if (!answer) {
    return "No answer provided.";
  }

  if (typeof answer === "string") {
    return answer || "No answer provided.";
  }

  const parts = [];

  if (answer.text) {
    parts.push(answer.text);
  }

  if (answer.attachments?.length) {
    parts.push(answer.attachments.map((item) => `[${item.name}](${item.url})`).join("\n"));
  }

  return parts.join("\n") || "No answer provided.";
}

function createInterviewEmbed(user, application) {
  const answers = application.answers ?? {};

  return new EmbedBuilder()
    .setAuthor({
      name: `${user.tag} submitted an Inspector Interview`,
      iconURL: user.displayAvatarURL()
    })
    .setTitle("Inspector Interview Review")
    .setDescription("Review the applicant's responses below, then use `/gradeinterview` to send a pass or fail result.")
    .setColor(0x2f80ed)
    .addFields(
      {
        name: "Applicant",
        value: `${user}\nUser ID: \`${user.id}\``,
        inline: false
      },
      {
        name: "Part One: General Information",
        value: "Identity, account security, and rank verification.",
        inline: false
      },
      {
        name: "Q1. Roblox Username",
        value: formatAnswer(answers.robloxUsername),
        inline: true
      },
      {
        name: "Q2. Discord Username",
        value: formatAnswer(answers.discordUsername),
        inline: true
      },
      {
        name: "Q3. Discord 2FA Proof",
        value: formatAnswer(answers.discord2faProof),
        inline: false
      },
      {
        name: "Q4. Roblox 2FA Proof",
        value: formatAnswer(answers.roblox2faProof),
        inline: false
      },
      {
        name: "Section Two: Resume and Experience",
        value: "Worth **25 points**.",
        inline: false
      },
      {
        name: "Q5. Resume, Cover Letter, and Experience",
        value: formatAnswer(answers.resumeAndExperience),
        inline: false
      }
    )
    .setFooter({ text: "Use /gradeinterview in this channel when review is complete." })
    .setTimestamp(new Date());
}

export function getApplicationAnswer(message) {
  const attachments = message.attachments.map((attachment) => ({
    name: attachment.name ?? "Attachment",
    url: attachment.url
  }));

  if (attachments.length === 0) {
    return message.content.trim();
  }

  return {
    text: message.content.trim(),
    attachments
  };
}

export async function createInterviewReviewChannel(message, application) {
  const guild = await message.client.guilds.fetch(process.env.DISCORD_GUILD_ID).catch(() => null);

  if (!guild) {
    await message.author.send("Your interview was completed, but I could not find the server review area.");
    return null;
  }

  await guild.members.fetchMe();
  await guild.roles.fetch();

  const staffRole = guild.roles.cache.find((role) => role.name === departmentAdminRoleName);

  if (!staffRole) {
    await message.author.send("Your interview was completed, but I could not find the review staff role.");
    return null;
  }

  const channel = await guild.channels.create({
    name: `interview-${cleanChannelName(message.author.username) || message.author.id}`,
    type: ChannelType.GuildText,
    topic: `application-user:${message.author.id}`,
    parent: interviewCategoryId,
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

  await channel.send({
    embeds: [createInterviewEmbed(message.author, application)]
  });

  return channel;
}

export async function gradeInterview(interaction, result, notes, score) {
  const userId = interaction.channel?.topic?.match(/application-user:(\d+)/)?.[1];

  if (!userId) {
    return {
      graded: false,
      message: "This channel is not connected to an interview applicant."
    };
  }

  const user = await interaction.client.users.fetch(userId).catch(() => null);

  if (!user) {
    return {
      graded: false,
      message: "I could not find the applicant for this interview channel."
    };
  }

  const title = result === "pass" ? "Inspector Interview Passed" : "Inspector Interview Failed";
  const scoreLine = score ? `\nScore: ${score}` : "";
  const notesLine = notes ? `\nNotes: ${notes}` : "";
  const resultMessage =
    result === "pass"
      ? "Congratulations, you have passed the interview! Department Administration will contact you with more information shortly. If you have any questions, DM me via modmail."
      : "Unfortunately, you have failed. There is always next time. Thank you for trying.";

  await user.send(
    `**${title}**${scoreLine}${notesLine}\n\nThank you for completing the interview process.\n\n${resultMessage}`
  );

  await interaction.reply(
    `Interview marked as **${result.toUpperCase()}** for ${user}.${scoreLine}${notesLine}`
  );

  return { graded: true };
}

export async function closeInterviewChannel(interaction, reason) {
  const userId = interaction.channel?.topic?.match(/application-user:(\d+)/)?.[1];

  if (!userId) {
    return {
      closed: false,
      message: "This channel is not connected to an interview applicant."
    };
  }

  await interaction.reply("Interview channel closed. This channel will be deleted in 5 seconds.");
  setTimeout(() => {
    interaction.channel
      .delete(`Interview closed by ${interaction.user.tag}: ${reason}`)
      .catch(() => {});
  }, 5000);

  return { closed: true };
}
