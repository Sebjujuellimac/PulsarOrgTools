/**
 * /verify — Request verified status to add items to the KHD inventory.
 *
 * Posts an approval embed to VERIFY_CHANNEL_ID with Approve / Deny buttons.
 * An officer clicks one; verifyButtons.js handles the outcome.
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { db } from '../../db.js';

const VERIFY_CHANNEL = process.env.VERIFY_CHANNEL_ID;

export default {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Request verified access to add items to the KHD inventory.'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.user.id;

    // Must be registered first
    const { data: member } = await db
      .from('members')
      .select('id, display_name, can_add_items, verify_requested_at, rsi_handle, rsi_verified')
      .eq('id', userId)
      .maybeSingle();

    if (!member) {
      return interaction.editReply(
        'You need to `/register` before requesting inventory access.'
      );
    }

    if (member.can_add_items) {
      return interaction.editReply(
        '✅ You already have verified inventory access. Head to the dashboard to get started.'
      );
    }

    if (member.verify_requested_at) {
      return interaction.editReply(
        'You already have a pending verification request. An officer will review it shortly.'
      );
    }

    if (!VERIFY_CHANNEL) {
      return interaction.editReply(
        'Verification channel is not configured. Contact an admin to set `VERIFY_CHANNEL_ID` in the bot config.'
      );
    }

    let channel;
    try {
      channel = await interaction.client.channels.fetch(VERIFY_CHANNEL);
    } catch {
      return interaction.editReply(
        'Could not find the verification channel. Contact an admin.'
      );
    }

    const rsiLine = member.rsi_verified && member.rsi_handle
      ? member.rsi_handle
      : '*(not linked)*';

    const embed = new EmbedBuilder()
      .setTitle('Inventory Verification Request')
      .setColor(0xc47a2a)
      .setDescription(`<@${userId}> is requesting inventory add access.`)
      .addFields(
        { name: 'KHD Name',   value: member.display_name,                      inline: true },
        { name: 'Discord',    value: `${interaction.user.tag}`,                inline: true },
        { name: 'RSI Handle', value: rsiLine,                                  inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `User ID: ${userId}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`verify-approve-${userId}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`verify-deny-${userId}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger),
    );

    await channel.send({ embeds: [embed], components: [row] });

    // Mark as pending so they can't spam requests
    await db
      .from('members')
      .update({ verify_requested_at: new Date().toISOString() })
      .eq('id', userId);

    return interaction.editReply(
      '✅ Your verification request has been submitted.\n' +
      'An officer will review it shortly — you\'ll receive a DM when it\'s resolved.'
    );
  },
};
