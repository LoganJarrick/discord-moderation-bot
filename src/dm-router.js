import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createInterviewReviewChannel,
  getApplicationAnswer
} from "./applications.js";
import { handleModmailDm } from "./modmail.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dmRoutesFilePath = join(__dirname, "..", "data", "dm-routes.json");

async function readDmRoutes() {
  try {
    const file = await readFile(dmRoutesFilePath, "utf8");
    return JSON.parse(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { users: {} };
    }

    throw error;
  }
}

async function writeDmRoutes(routes) {
  await mkdir(dirname(dmRoutesFilePath), { recursive: true });
  await writeFile(dmRoutesFilePath, JSON.stringify(routes, null, 2));
}

function normalizeChoice(content) {
  return content.trim().toLowerCase();
}

function getChoice(content) {
  const normalized = normalizeChoice(content);

  if (["application", "applications", "apply", "app", "apps", "exam"].includes(normalized)) {
    return "applications";
  }

  if (["modmail", "mod mail", "support", "help", "staff"].includes(normalized)) {
    return "modmail";
  }

  if (["change", "reset", "restart", "menu"].includes(normalized)) {
    return "reset";
  }

  return null;
}

async function askDmRoute(message) {
  await message.author.send(
    "**Vancouver Police Department Bot**\n\nPlease select what you need help with.\n\n**Applications**\nReply `applications` if you are here for an interview or application.\n\n**Modmail**\nReply `modmail` if you need to contact staff.\n\nYou can type `change` at any time to return to this menu."
  );
}

function isReady(content) {
  return ["yes", "y", "ready", "start", "continue", "proceed"].includes(normalizeChoice(content));
}

async function sendApplicationIntro(message) {
  await message.author.send(
    "**Inspector Interview**\n\nWelcome to the Inspector Interview process. This interview will be completed through direct messages with the bot.\n\nPlease answer each question clearly and honestly. Your responses may be reviewed by department staff.\n\nAre you ready to move on to **Part One**?\n\nReply `yes` when you are ready."
  );
}

async function handleApplicationDm(message, routes, userRoute) {
  userRoute.application ??= {
    step: "awaiting_ready",
    answers: {},
    startedAt: new Date().toISOString()
  };

  if (userRoute.application.step === "awaiting_ready") {
    if (!isReady(message.content)) {
      await message.author.send(
        "**Inspector Interview**\n\nNo problem. When you are ready to begin **Part One**, reply `yes`."
      );
      await writeDmRoutes(routes);
      return;
    }

    userRoute.application.step = "roblox_username";
    await writeDmRoutes(routes);
    await message.author.send(
      "**Part One: Applicant Information**\n\nThis section collects your basic account information so staff can correctly identify your application.\n\n**Question 1**\nWhat is your Roblox username?"
    );
    return;
  }

  if (userRoute.application.step === "roblox_username") {
    userRoute.application.answers.robloxUsername = getApplicationAnswer(message);
    userRoute.application.step = "discord_username";
    await writeDmRoutes(routes);
    await message.author.send(
      "**Part One: Applicant Information**\n\n**Question 2**\nWhat is your Discord username?"
    );
    return;
  }

  if (userRoute.application.step === "discord_username") {
    userRoute.application.answers.discordUsername = getApplicationAnswer(message);
    userRoute.application.step = "discord_2fa_proof";
    await writeDmRoutes(routes);
    await message.author.send(
      "**Part One: General Information**\n\n**Question 3**\nPlease provide proof that Discord two-factor authentication is enabled on your account. A screenshot or link is fine."
    );
    return;
  }

  if (userRoute.application.step === "discord_2fa_proof") {
    userRoute.application.answers.discord2faProof = getApplicationAnswer(message);
    userRoute.application.step = "roblox_2fa_proof";
    await writeDmRoutes(routes);
    await message.author.send(
      "**Part One: General Information**\n\n**Question 4**\nPlease provide proof that Roblox two-factor authentication is enabled on your account. A screenshot or link is fine."
    );
    return;
  }

  if (userRoute.application.step === "roblox_2fa_proof") {
    userRoute.application.answers.roblox2faProof = getApplicationAnswer(message);
    userRoute.application.step = "part_one_complete";
    userRoute.application.completedPartOneAt = new Date().toISOString();
    await writeDmRoutes(routes);
    const reviewChannel = await createInterviewReviewChannel(message, userRoute.application);
    await message.author.send(
      `**Part One Complete**\n\nThank you. Your interview responses have been submitted for staff review.${reviewChannel ? "" : "\n\nStaff may need to review the submission manually if a review channel was not created."}`
    );
    return;
  }

  await message.author.send(
    "**Inspector Interview**\n\nYour current application section is already complete. Type `change` if you need to return to the main menu."
  );
}

export async function handleRoutedDm(message) {
  const routes = await readDmRoutes();
  const userRoute = routes.users[message.author.id];
  const choice = getChoice(message.content);

  if (choice === "reset") {
    delete routes.users[message.author.id];
    await writeDmRoutes(routes);
    await askDmRoute(message);
    return;
  }

  if (!userRoute) {
    if (!choice) {
      await askDmRoute(message);
      return;
    }

    routes.users[message.author.id] = {
      route: choice,
      selectedAt: new Date().toISOString()
    };
    await writeDmRoutes(routes);

    if (choice === "applications") {
      routes.users[message.author.id].application = {
        step: "awaiting_ready",
        answers: {},
        startedAt: new Date().toISOString()
      };
      await writeDmRoutes(routes);
      await sendApplicationIntro(message);
      return;
    }

    await message.author.send("Modmail selected. Please send your question or concern, and staff will reply when they can.");
    return;
  }

  if (userRoute.route === "applications") {
    await handleApplicationDm(message, routes, userRoute);
    return;
  }

  await handleModmailDm(message);
}
