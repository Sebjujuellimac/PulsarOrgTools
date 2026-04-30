import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildScheduledEvents,
  ],
});

// Load all slash command files
client.commands = new Collection();

const commandFolders = readdirSync(join(__dirname, 'commands'));
for (const folder of commandFolders) {
  const commandFiles = readdirSync(join(__dirname, 'commands', folder))
    .filter(f => f.endsWith('.js'));
  for (const file of commandFiles) {
    const { default: command } = await import(pathToFileURL(join(__dirname, 'commands', folder, file)).href);
    if (command?.data?.name) {
      client.commands.set(command.data.name, command);
      console.log(`Loaded command: ${command.data.name}`);
    }
  }
}

// Handle slash command interactions
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const msg = { content: 'Something went wrong running that command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

// Auto-close events: when a Discord Scheduled Event ends, close it in DB + award DKP
client.on(Events.GuildScheduledEventUpdate, async (oldEvent, newEvent) => {
  // Status 4 = COMPLETED (event ended)
  if (newEvent.status === 4 && oldEvent.status !== 4) {
    const { autoCloseEvent } = await import('./eventHelpers.js');
    await autoCloseEvent(newEvent).catch(err =>
      console.error('autoCloseEvent error:', err)
    );
  }
});

client.once(Events.ClientReady, c => {
  console.log(`Pulsar Org Tools ready — logged in as ${c.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
