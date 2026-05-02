// ============================================================
// PULSAR ORG TOOLS — Cert Confirmation Button Handler
// Handles the [Award all] / [Skip] buttons posted by
// autoCloseEvent for events with a course_code set.
// ============================================================

import { db } from './db.js';
import { awardCertsToAttendees } from './eventHelpers.js';

const OFFICER_ROLES = ['Worg', 'Lycan'];

function isOfficer(interaction) {
  return interaction.member?.roles?.cache?.some(r => OFFICER_ROLES.includes(r.name));
}

export async function handleCertButton(interaction) {
  if (!isOfficer(interaction)) {
    return interaction.reply({ content: 'Officer role required to confirm cert awards.', ephemeral: true });
  }

  const id = interaction.customId;
  // Format: cert-approve-<eventId> | cert-skip-<eventId>
  const isApprove = id.startsWith('cert-approve-');
  const isSkip    = id.startsWith('cert-skip-');
  if (!isApprove && !isSkip) return;

  const eventId = id.replace(/^cert-(approve|skip)-/, '');

  await interaction.deferReply();

  // Lookup event
  const { data: evt } = await db
    .from('events').select('id, title, course_code').eq('id', eventId).maybeSingle();
  if (!evt) return interaction.editReply('Event not found in DB.');
  if (!evt.course_code) return interaction.editReply('Event has no course_code set — nothing to award.');

  // Disable both buttons on the original prompt regardless of outcome
  await disableMessageButtons(interaction);

  if (isSkip) {
    return interaction.editReply(`Skipped cert awards for **${evt.title}**.`);
  }

  // Approve flow — award to all attendees
  const { data: attRows } = await db
    .from('attendance').select('member_id').eq('event_id', eventId).eq('attended', true);
  const memberIds = (attRows ?? []).map(r => r.member_id);

  if (memberIds.length === 0) {
    return interaction.editReply(`No attendees found for **${evt.title}** — no certs awarded.`);
  }

  const result = await awardCertsToAttendees({
    eventId,
    courseCode: evt.course_code,
    memberIds,
    awardedBy: interaction.user.id,
    notes: `Auto-awarded from ${evt.title}`,
  });

  let reply = `**${evt.course_code}** for **${evt.title}**\n`;
  if (result.awarded.length) {
    reply += `✅ Awarded to ${result.awarded.length}: ${result.awarded.join(', ')}\n`;
  }
  if (result.skipped.length) {
    reply += `⚠️ Skipped ${result.skipped.length}:\n` +
      result.skipped.map(s => `  • ${s.name} — ${s.reason}`).join('\n');
  }
  if (!result.awarded.length && !result.skipped.length) {
    reply += '*(no action taken)*';
  }

  return interaction.editReply(reply);
}

async function disableMessageButtons(interaction) {
  try {
    const msg = interaction.message;
    const components = msg.components.map(row => {
      const newRow = { type: row.type, components: row.components.map(btn => ({ ...btn.toJSON(), disabled: true })) };
      return newRow;
    });
    await msg.edit({ components }).catch(() => {});
  } catch { /* best effort */ }
}
