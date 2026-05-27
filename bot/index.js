import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { db } from './db.js';
import { startDecayScheduler } from './decay.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildVoiceStates,   // for voice-channel auto-attendance
    GatewayIntentBits.GuildMembers,       // needed to resolve voice members
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

// Handle slash commands AND button interactions (cert confirmation)
client.on(Events.InteractionCreate, async interaction => {
  // ── Slash commands ─────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
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
    return;
  }

  // ── Autocomplete (e.g. course code dropdowns) ─────────────────────────────
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try { await command.autocomplete(interaction); }
      catch (err) { console.error(`autocomplete error in /${interaction.commandName}:`, err); }
    }
    return;
  }

  // ── Cert confirmation buttons (cert-approve-<eventId> / cert-skip-<eventId>) ──
  if (interaction.isButton() && interaction.customId.startsWith('cert-')) {
    const { handleCertButton } = await import('./certButtons.js');
    await handleCertButton(interaction).catch(err => {
      console.error('handleCertButton error:', err);
      if (!interaction.replied) interaction.reply({ content: 'Button handler errored.', ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Inventory verify buttons (verify-approve-<userId> / verify-deny-<userId>) ──
  if (interaction.isButton() && interaction.customId.startsWith('verify-')) {
    const { handleVerifyButton } = await import('./verifyButtons.js');
    await handleVerifyButton(interaction).catch(err => {
      console.error('handleVerifyButton error:', err);
      if (!interaction.replied) interaction.reply({ content: 'Button handler errored.', ephemeral: true }).catch(() => {});
    });
    return;
  }
});

// Auto-close events: when a Discord Scheduled Event ends, close it in DB + award DKP
// Also sweep voice channel when event goes ACTIVE to catch early arrivals.
client.on(Events.GuildScheduledEventUpdate, async (oldEvent, newEvent) => {
  // Status 4 = COMPLETED (event ended)
  if (newEvent.status === 4 && oldEvent.status !== 4) {
    const { autoCloseEvent } = await import('./eventHelpers.js');
    await autoCloseEvent(newEvent, client).catch(err =>
      console.error('autoCloseEvent error:', err)
    );
  }

  // Status 2 = ACTIVE (event just started)
  // Sweep the linked voice channel so anyone already present gets clocked in.
  if (newEvent.status === 2 && oldEvent.status !== 2) {
    const { sweepVoiceChannelOnStart } = await import('./voiceTracker.js');
    await sweepVoiceChannelOnStart(newEvent).catch(err =>
      console.error('sweepVoiceChannelOnStart error:', err)
    );
  }
});

// Voice channel auto-attendance — mark members attended when they join
// a voice channel linked to an open event within its attendance window.
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const { handleVoiceStateUpdate } = await import('./voiceTracker.js');
  await handleVoiceStateUpdate(oldState, newState).catch(err =>
    console.error('voiceTracker error:', err)
  );
});

// Sync officer status whenever a member's roles change.
// Requires GuildMembers privileged intent (already enabled).
const OFFICER_ROLES = new Set(['Worg', 'Lycan']);

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const hadOfficer = oldMember.roles.cache.some(r => OFFICER_ROLES.has(r.name));
  const hasOfficer = newMember.roles.cache.some(r => OFFICER_ROLES.has(r.name));
  if (hadOfficer === hasOfficer) return; // no relevant change

  // Only update members who have registered
  const { error } = await db
    .from('members')
    .update({ is_officer: hasOfficer })
    .eq('id', newMember.id);

  if (error) {
    console.error(`Failed to sync officer status for ${newMember.user.tag}:`, error.message);
  } else {
    console.log(`Officer status for ${newMember.user.tag} → ${hasOfficer}`);
  }
});

// Sweep all registered members on startup and correct their officer flag.
// Handles members who already had Worg/Lycan before the bot came online,
// and catches any drift that occurred while the bot was offline.
async function syncOfficerRolesOnStartup(client) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const members = await guild.members.fetch(); // requires GuildMembers intent

    const officerIds    = members.filter(m =>  m.roles.cache.some(r => OFFICER_ROLES.has(r.name))).map(m => m.id);
    const nonOfficerIds = members.filter(m => !m.roles.cache.some(r => OFFICER_ROLES.has(r.name))).map(m => m.id);

    // Two bulk updates — only affects rows that already exist in members table
    const [r1, r2] = await Promise.all([
      officerIds.length    ? db.from('members').update({ is_officer: true  }).in('id', officerIds)    : Promise.resolve({}),
      nonOfficerIds.length ? db.from('members').update({ is_officer: false }).in('id', nonOfficerIds) : Promise.resolve({}),
    ]);

    if (r1.error) console.error('Officer sync (true) error:',  r1.error.message);
    if (r2.error) console.error('Officer sync (false) error:', r2.error.message);

    console.log(`Startup officer sync complete — ${officerIds.length} officer(s), ${nonOfficerIds.length} non-officer(s) checked.`);
  } catch (err) {
    console.error('Startup officer sync failed:', err);
  }
}

client.once(Events.ClientReady, async c => {
  console.log(`Pulsar Org Tools ready — logged in as ${c.user.tag}`);
  await syncOfficerRolesOnStartup(c);
  startDecayScheduler(c);
});

client.login(process.env.DISCORD_TOKEN);
