import { SlashCommandBuilder } from 'discord.js';
import { db } from '../../db.js';
import { ensureMember } from '../../eventHelpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Register yourself as a Kelz Hounds member.'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const member = await ensureMember(interaction.user);

    if (!member) {
      return interaction.editReply('Failed to register — database error. Contact an admin.');
    }

    // Sync officer status (Worg / Lycan) and avatar to DB for web dashboard
    const isOfficer = interaction.member?.roles?.cache?.some(r =>
      ['Worg', 'Lycan'].includes(r.name)
    ) ?? false;

    const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });

    await db.from('members').update({
      is_officer:     isOfficer,
      discord_avatar: avatarUrl,
    }).eq('id', interaction.user.id);

    const officerLine = isOfficer ? '\nOfficer status: **Active** 🐺' : '';

    return interaction.editReply(
      `You're registered as **${member.display_name}**.\n` +
      `Current DKP balance: **${member.dkp_balance}**` +
      officerLine
    );
  },
};
