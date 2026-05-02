import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { db } from '../../db.js';
import { getCourses, getTrackOrder, getTrackEmoji } from '../../courseData.js';

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View a member\'s profile — DKP, certifications, and recent activity.')
    .addUserOption(opt =>
      opt.setName('member').setDescription('Member to view (defaults to you)').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser('member') ?? interaction.user;

    // Fetch member, certs, and recent DKP transactions in parallel
    const [memberRes, certsRes, txRes, eventsRes] = await Promise.all([
      db.from('members').select('*, rsi_handle, rsi_verified, rsi_citizen_number, rsi_enlisted, rsi_org_rank, rsi_avatar_url').eq('id', target.id).maybeSingle(),
      db.from('certifications').select('course_code, awarded_at').eq('member_id', target.id),
      db.from('dkp_transactions').select('amount, reason, created_at')
        .eq('member_id', target.id).order('created_at', { ascending: false }).limit(5),
      db.from('attendance').select('event_id').eq('member_id', target.id).eq('attended', true),
    ]);

    const member = memberRes.data;
    if (!member) {
      return interaction.editReply(`${target.username} hasn't registered yet — they need to use \`/register\` first.`);
    }

    const certs = certsRes.data ?? [];
    const txs = txRes.data ?? [];
    const attendedCount = eventsRes.data?.length ?? 0;
    const heldSet = new Set(certs.map(c => c.course_code));

    // ── Certifications by track ──
    const [COURSES, TRACK_ORDER, TRACK_EMOJI] = await Promise.all([
      getCourses(), getTrackOrder(), getTrackEmoji(),
    ]);
    const certLines = [];
    for (const track of TRACK_ORDER) {
      const trackCerts = Object.keys(COURSES)
        .filter(code => COURSES[code].track === track && heldSet.has(code));
      if (trackCerts.length) {
        certLines.push(`${TRACK_EMOJI[track]} **${track}:** ${trackCerts.join(', ')}`);
      }
    }

    // ── Recent DKP activity ──
    const txLines = txs.map(tx => {
      const sign = tx.amount >= 0 ? '+' : '';
      const date = new Date(tx.created_at).toLocaleDateString();
      return `${sign}${tx.amount} — ${tx.reason} *(${date})*`;
    });

    // ── Build embed ──
    // RSI profile line (if linked)
    const rsiLine = member.rsi_verified && member.rsi_handle
      ? [
          `**Handle:** [${member.rsi_handle}](https://robertsspaceindustries.com/citizens/${encodeURIComponent(member.rsi_handle)})`,
          member.rsi_citizen_number ? `**Citizen #:** ${member.rsi_citizen_number}` : null,
          member.rsi_enlisted       ? `**Enlisted:** ${member.rsi_enlisted}`         : null,
          member.rsi_org_rank       ? `**Org Rank:** ${member.rsi_org_rank}`         : null,
        ].filter(Boolean).join('\n')
      : null;

    // Prefer RSI avatar if available, otherwise Discord avatar
    const thumbnail = member.rsi_avatar_url ?? target.displayAvatarURL();

    const embed = new EmbedBuilder()
      .setTitle(`${member.display_name}`)
      .setThumbnail(thumbnail)
      .setColor(0x5865F2)
      .addFields(
        {
          name: '📊 Stats',
          value: [
            `**DKP Balance:** ${member.dkp_balance}`,
            `**Certifications:** ${certs.length}`,
            `**Events Attended:** ${attendedCount}`,
          ].join('\n'),
          inline: false,
        },
        {
          name: `🎖️ Certifications${certs.length ? ` (${certs.length})` : ''}`,
          value: certLines.length ? certLines.join('\n') : '*None yet*',
          inline: false,
        },
        {
          name: '💰 Recent DKP Activity',
          value: txLines.length ? txLines.join('\n') : '*No transactions yet*',
          inline: false,
        },
      );

    if (rsiLine) {
      embed.addFields({ name: '🌌 RSI Profile', value: rsiLine, inline: false });
    }

    embed.setFooter({ text: `Member since ${new Date(member.joined_at).toLocaleDateString()}` });

    return interaction.editReply({ embeds: [embed] });
  },
};
