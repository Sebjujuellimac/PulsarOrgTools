/**
 * verifyButtons.js — handles verify-approve-<userId> and verify-deny-<userId> button interactions.
 * Called from index.js when interaction.customId starts with 'verify-'.
 */

import { EmbedBuilder } from 'discord.js';
import { db } from './db.js';

const OFFICER_ROLES = new Set(['Worg', 'Lycan']);

export async function handleVerifyButton(interaction) {
  // customId format: verify-approve-<userId> or verify-deny-<userId>
  const parts = interaction.customId.split('-');
  const action = parts[1];           // 'approve' | 'deny'
  const targetUserId = parts[2];     // Discord user ID

  // Only officers/admins can act on these
  const isOfficer = interaction.member?.roles?.cache?.some(r => OFFICER_ROLES.has(r.name)) ?? false;
  const isAdmin   = interaction.member?.permissions?.has('Administrator') ?? false;

  if (!isOfficer && !isAdmin) {
    return interaction.reply({
      content: 'Only officers can approve or deny verification requests.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const { data: member } = await db
    .from('members')
    .select('id, display_name, can_add_items')
    .eq('id', targetUserId)
    .maybeSingle();

  if (!member) {
    return interaction.editReply('Member not found in the database.');
  }

  if (member.can_add_items) {
    return interaction.editReply(`**${member.display_name}** is already verified.`);
  }

  if (action === 'approve') {
    await db
      .from('members')
      .update({ can_add_items: true, verify_requested_at: null })
      .eq('id', targetUserId);

    // Update the embed to show approved state
    try {
      const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0x5a9e3f)
        .setFooter({ text: `Approved by ${interaction.user.tag}` });
      await interaction.message.edit({ embeds: [approvedEmbed], components: [] });
    } catch { /* message may have been deleted */ }

    // DM the user
    try {
      const user = await interaction.client.users.fetch(targetUserId);
      await user.send(
        `✅ Your KHD inventory verification has been **approved** by ${interaction.user.username}.\n` +
        `You can now log into the dashboard and add items to the org inventory.`
      );
    } catch { /* DMs may be disabled — not a hard failure */ }

    return interaction.editReply(`✅ **${member.display_name}** has been approved for inventory access.`);
  }

  if (action === 'deny') {
    await db
      .from('members')
      .update({ verify_requested_at: null })
      .eq('id', targetUserId);

    // Update the embed to show denied state
    try {
      const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0xbe4141)
        .setFooter({ text: `Denied by ${interaction.user.tag}` });
      await interaction.message.edit({ embeds: [deniedEmbed], components: [] });
    } catch { /* message may have been deleted */ }

    // DM the user
    try {
      const user = await interaction.client.users.fetch(targetUserId);
      await user.send(
        `❌ Your KHD inventory verification has been **denied** by ${interaction.user.username}.\n` +
        `Contact an officer if you believe this is an error.`
      );
    } catch { /* DMs may be disabled */ }

    return interaction.editReply(`**${member.display_name}**'s verification request has been denied.`);
  }

  return interaction.editReply('Unknown action.');
}
