/**
 * /opstart — snapshot a voice channel and create a dashboard op session.
 *
 * Creates an entry in op_sessions_store pre-populated with everyone
 * currently in the chosen VC who is a registered member. The session
 * is immediately editable from the Operations tab in the dashboard.
 *
 * Usage:
 *   /opstart channel:#mining-ops
 *   /opstart channel:#fleet-ops name:Pyro Mining Run
 */

import { SlashCommandBuilder, ChannelType, EmbedBuilder } from 'discord.js';
import { db } from '../../db.js';

const OFFICER_ROLES = new Set(['Worg', 'Lycan']);

export default {
  data: new SlashCommandBuilder()
    .setName('opstart')
    .setDescription('[Officer] Snapshot a VC and create an operation session in the dashboard.')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Voice channel to pull members from')
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('name')
        .setDescription('Session name (default: "Op MM/DD")')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Officer gate
    const isOfficer = interaction.member?.roles?.cache?.some(r => OFFICER_ROLES.has(r.name));
    if (!isOfficer) {
      return interaction.editReply('Only officers can start operation sessions.');
    }

    // Resolve the voice channel and its current members
    const channelOption  = interaction.options.getChannel('channel');
    const voiceChannel   = await interaction.guild.channels.fetch(channelOption.id).catch(() => null);
    if (!voiceChannel?.members) {
      return interaction.editReply('Could not read that voice channel. Make sure the bot has access.');
    }

    const vcMembers = [...voiceChannel.members.values()].filter(m => !m.user.bot);
    if (!vcMembers.length) {
      return interaction.editReply(`No members are currently in <#${channelOption.id}>.`);
    }

    // Match VC members against the registered members table
    const vcIds = vcMembers.map(m => m.id);
    const { data: dbMembers, error } = await db
      .from('members')
      .select('id, display_name, username')
      .in('id', vcIds);

    if (error) return interaction.editReply(`Database error: ${error.message}`);
    if (!dbMembers?.length) {
      return interaction.editReply('None of the members in that channel are registered in the org.');
    }

    // Build the session — commander (whoever ran /opstart) is owner if registered
    const commanderId = interaction.user.id;
    const commander   = dbMembers.find(m => m.id === commanderId);
    const sessionName = interaction.options.getString('name')?.trim()
      || `Op ${new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}`;

    // Sort so the owner (if present) is first, others alphabetically
    const sorted = [...dbMembers].sort((a, b) => {
      if (a.id === commanderId) return -1;
      if (b.id === commanderId) return  1;
      return (a.display_name || a.username).localeCompare(b.display_name || b.username);
    });

    let crewCounter = 1;
    const crew = sorted.map(m => ({
      id:        crewCounter++,
      name:      m.display_name || m.username || m.id,
      share:     100,
      pt:        'share',
      rate:      0,
      isOwner:   m.id === commanderId,
      elapsedMs: 0,
    }));

    const sessionId = Date.now(); // unique enough; dashboard recalcs counters on load
    const session = {
      id:       sessionId,
      name:     sessionName,
      owner:    commander ? (commander.display_name || commander.username || '') : '',
      crew,
      jobs:     [],
      date:     new Date().toLocaleDateString(),
      fee:      5,
      guildPct: 0,
    };

    // Insert to Supabase and write back the db_id so the dashboard can upsert later
    const { data: row, error: insertErr } = await db
      .from('op_sessions_store')
      .insert({ data: session })
      .select('id')
      .single();

    if (insertErr) return interaction.editReply(`Failed to create session: ${insertErr.message}`);

    session.db_id = row.id;
    await db.from('op_sessions_store').update({ data: session }).eq('id', row.id);

    // Identify unregistered VC members so the officer knows who was skipped
    const registeredIds  = new Set(dbMembers.map(m => m.id));
    const unregistered   = vcMembers.filter(m => !registeredIds.has(m.id));

    // Build the reply embed
    const crewLines = crew
      .map(c => `${c.isOwner ? '👑' : '•'} ${c.name}`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xa89cf7)
      .setTitle(`✅ Session created: ${sessionName}`)
      .addFields(
        { name: `Crew (${crew.length})`, value: crewLines },
      )
      .setFooter({ text: 'Open the Operations tab in the dashboard to add jobs and run the session.' });

    if (unregistered.length) {
      embed.addFields({
        name: '⚠️ Not registered (skipped)',
        value: unregistered.map(m => m.displayName || m.user.username).join(', '),
      });
    }

    return interaction.editReply({ embeds: [embed] });
  },
};
