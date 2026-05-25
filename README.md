# Moderation Discord Bot

Small moderation bot using `discord.js`. It includes these slash commands:

- `/ping`
- `/ban`
- `/kick`
- `/warn`
- `/warnings`
- `/clearwarnings`
- `/closemodmail`
- `/reply`
- `/say`
- `/training`

## Setup

1. Install Node.js 20 or newer.
2. Create a Discord app in the Discord Developer Portal.
3. Add a bot user to the app.
4. Copy `.env.example` to `.env`.
5. Fill in:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_GUILD_ID`
   - `MOD_LOG_CHANNEL_ID`
   - `TRAINING_ANNOUNCEMENTS_CHANNEL_ID`
   - `MODMAIL_CATEGORY_ID`
   - `MODMAIL_LOG_CHANNEL_ID`
   - `MODMAIL_STAFF_ROLE_NAME`

## Install

```bash
npm install
```

## Register Slash Commands

```bash
npm run register
```

## Run The Bot

```bash
npm start
```

For development with automatic restarts:

```bash
npm run dev
```

## Invite URL

In the Discord Developer Portal, open your application, go to OAuth2, then URL Generator.

Select these scopes:

- `bot`
- `applications.commands`

Give the bot these permissions:

- Ban Members
- Kick Members
- Moderate Members
- Manage Messages
- Manage Channels
- Send Messages
- View Channels

Make sure the bot's role is above the roles it needs to moderate.

## Moderation Behavior

- `/warn` says `<username> has been warned` in chat.
- `/warn` sends the user a DM with their warning count.
- At 3 warnings, the bot kicks the member.
- `/kick` and `/ban` try to DM the user before removing them.
- `/ban`, `/kick`, `/warn`, `/clearwarnings`, and `/say` send an entry to your mod log channel.

## Modmail

- When someone DMs the bot, it creates a private modmail channel.
- The `Department Administration` role can see and reply in modmail channels.
- Staff use `/reply message` in the modmail channel to DM the user.
- `/closemodmail reason` closes and deletes the current modmail channel.
- Set `MODMAIL_CATEGORY_ID` to the category where modmail channels should appear.
- Set `MODMAIL_LOG_CHANNEL_ID` if you want modmail open/close logs.
- Enable Message Content Intent in the Discord Developer Portal.

## Training Announcements

- `/training type: Basic Training` posts the basic academy training message.
- `/training type: Sergeant Training` posts the sergeant academy training message.
- Training announcements are sent to `TRAINING_ANNOUNCEMENTS_CHANNEL_ID`.
- The bot looks for server roles by name and mentions them in the announcement.
