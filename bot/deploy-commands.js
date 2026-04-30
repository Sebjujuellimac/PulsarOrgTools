// Run this script once to register slash commands with Discord:
//   node deploy-commands.js
//
// Re-run any time you add, rename, or remove a command.

import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const commands = [];
const commandFolders = readdirSync(join(__dirname, 'commands'));

for (const folder of commandFolders) {
  const files = readdirSync(join(__dirname, 'commands', folder))
    .filter(f => f.endsWith('.js'));
  for (const file of files) {
    const { default: cmd } = await import(pathToFileURL(join(__dirname, 'commands', folder, file)).href);
    if (cmd?.data) commands.push(cmd.data.toJSON());
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

console.log(`Deploying ${commands.length} command(s) to guild ${process.env.GUILD_ID}...`);

try {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('All commands deployed successfully.');
} catch (err) {
  console.error('Deploy failed:', err);
}
