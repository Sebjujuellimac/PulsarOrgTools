# Pulsar Org Tools

KHD org management platform — Discord bot + web dashboard.

## Project structure

```
PulsarOrgTools/
├── bot/                    Discord.js v14 bot
│   ├── commands/
│   │   ├── admin/          /register
│   │   ├── dkp/            /dkp balance|award|top|history
│   │   ├── event/          /event create|link|close|attend|list
│   │   └── quest/          /quest list|post|complete|close
│   ├── db.js               Supabase client
│   ├── eventHelpers.js     DKP award logic, auto-close on Discord event end
│   ├── index.js            Bot entry point
│   ├── deploy-commands.js  Register slash commands with Discord
│   ├── package.json
│   ├── .env.example        Copy to .env and fill in secrets
│   └── .gitignore
├── schema_bot.sql          Supabase schema for bot tables
└── README.md               This file
```

Web dashboard lives in `StarSuppliesBot/` (separate project).

---

## Setup

### 1. Install Node.js
Download LTS from [nodejs.org](https://nodejs.org). Run the installer with all defaults. Restart your terminal after.

### 2. Run the schema
In your Supabase SQL Editor: paste and run `schema_bot.sql` (or run it after `schema.sql` from StarSuppliesBot — both are safe to run together).

### 3. Configure secrets
```
cd bot
copy .env.example .env
```
Open `.env` and fill in:
- `DISCORD_TOKEN` — Bot > Token in the Developer Portal
- `CLIENT_ID` — General Information > Application ID
- `GUILD_ID` — already set to your test server (`322416451191570434`)
- `SUPABASE_KEY` — your Supabase anon/public key

### 4. Install dependencies
```
cd bot
npm install
```

### 5. Deploy slash commands
```
npm run deploy
```
This registers all slash commands to your test server. Only needs to run once (or when commands change).

### 6. Start the bot
```
npm start
```

---

## Slash commands

### /register
Register yourself as a member. Creates your DKP account.

### /dkp balance [member]
Check your (or another member's) DKP balance.

### /dkp award <member> <amount> <reason>
*(Officer only)* Award or deduct DKP. Amount can be negative.

### /dkp top [limit]
DKP leaderboard (default top 10).

### /dkp history [member] [limit]
Recent DKP transactions.

### /event create <title> <dkp> [discord_event_id]
*(Officer only)* Create an event. Optionally link to a Discord Scheduled Event.

### /event link <event_id> <discord_event_id>
*(Officer only)* Link a bot event to a Discord Scheduled Event after creation.

### /event attend <event_id>
Mark yourself as attended for an event.

### /event close <event_id>
*(Officer only)* Manually close event and award DKP to all attendees.

### /event list
Show all open events with their IDs.

### /quest list
Show all open quests.

### /quest post <title> <description> <dkp>
*(Officer only)* Post a new quest to the board.

### /quest complete <quest_id> <member> [notes]
*(Officer only)* Mark quest done, award DKP to the contributing member.

### /quest close <quest_id>
*(Officer only)* Cancel a quest (no DKP awarded).

---

## Auto-close via Discord Scheduled Events

When a Discord Scheduled Event ends (status COMPLETED), the bot automatically:
1. Finds the matching event in the database by `discord_event_id`
2. Marks it closed
3. Awards the event's DKP reward to all attendees who used `/event attend`

To use this: create the Discord Scheduled Event in your server normally, then use `/event create` and either paste the Discord event ID in that command, or link it later with `/event link`.

---

## Officer roles

The bot checks for roles named `Worg` or `Lycan`. Any member with one of these roles can use officer-only commands. Change the list in `commands/dkp/balance.js`, `commands/event/event.js`, and `commands/quest/quest.js` if your role names change.
