import { SlashCommandBuilder } from 'discord.js';
import { db } from '../../db.js';
import { COURSES, TRACK_ORDER, TRACK_EMOJI, checkPrereqs } from '../../courseData.js';

const COURSE_CHOICES = Object.entries(COURSES).map(([code, c]) => ({
  name: `${code} — ${c.title}`,
  value: code,
}));

export default {
  data: new SlashCommandBuilder()
    .setName('cert')
    .setDescription('Certification commands')

    .addSubcommand(sub =>
      sub.setName('award')
        .setDescription('[Officer] Award a certification to a member.')
        .addUserOption(opt =>
          opt.setName('member').setDescription('Member to certify').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('course').setDescription('Course code').setRequired(true)
            .addChoices(...COURSE_CHOICES)
        )
        .addStringOption(opt =>
          opt.setName('notes').setDescription('Optional notes (override reason, special circumstance)').setRequired(false)
        )
    )

    .addSubcommand(sub =>
      sub.setName('revoke')
        .setDescription('[Officer] Revoke a certification from a member.')
        .addUserOption(opt =>
          opt.setName('member').setDescription('Member').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('course').setDescription('Course code').setRequired(true)
            .addChoices(...COURSE_CHOICES)
        )
    )

    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List certifications held by a member.')
        .addUserOption(opt =>
          opt.setName('member').setDescription('Member to check (defaults to you)').setRequired(false)
        )
    )

    .addSubcommand(sub =>
      sub.setName('eligible')
        .setDescription('Show which courses a member is eligible to take next.')
        .addUserOption(opt =>
          opt.setName('member').setDescription('Member to check (defaults to you)').setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'award')    return handleAward(interaction);
    if (sub === 'revoke')   return handleRevoke(interaction);
    if (sub === 'list')     return handleList(interaction);
    if (sub === 'eligible') return handleEligible(interaction);
  },
};

function isOfficer(interaction) {
  return interaction.member?.roles?.cache?.some(r => ['Worg', 'Lycan'].includes(r.name));
}

// ──────────────────────────────────────────────
// /cert award
// ──────────────────────────────────────────────
async function handleAward(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!isOfficer(interaction)) return interaction.editReply('Officer role required.');

  const target = interaction.options.getUser('member');
  const courseCode = interaction.options.getString('course');
  const notes = interaction.options.getString('notes') ?? null;
  const course = COURSES[courseCode];

  // Member must be registered
  const { data: member } = await db
    .from('members').select('id, display_name').eq('id', target.id).maybeSingle();
  if (!member) return interaction.editReply(`${target.username} hasn't registered yet — they need to use \`/register\` first.`);

  // Check for duplicate
  const { data: existing } = await db
    .from('certifications').select('id').eq('member_id', target.id).eq('course_code', courseCode).maybeSingle();
  if (existing) return interaction.editReply(`**${member.display_name}** already holds **${courseCode}**.`);

  // Check prereqs
  const { data: heldRows } = await db
    .from('certifications').select('course_code').eq('member_id', target.id);
  const held = (heldRows ?? []).map(r => r.course_code);
  const { ok, missing } = checkPrereqs(courseCode, held);

  if (!ok) {
    return interaction.editReply(
      `**${member.display_name}** doesn't meet the prerequisites for **${courseCode} — ${course.title}**.\n` +
      `Missing: ${missing.map(m => `\`${m}\``).join(', ')}\n\n` +
      `Use \`notes\` option to override if this was a course-independent certification.`
    );
  }

  // Award it
  const { error } = await db.from('certifications').insert({
    member_id: target.id,
    course_code: courseCode,
    awarded_by: interaction.user.id,
    notes,
  });

  if (error) return interaction.editReply(`Database error: ${error.message}`);

  return interaction.editReply(
    `✅ **${courseCode} — ${course.title}** awarded to **${member.display_name}**.` +
    (notes ? `\nNotes: ${notes}` : '')
  );
}

// ──────────────────────────────────────────────
// /cert revoke
// ──────────────────────────────────────────────
async function handleRevoke(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!isOfficer(interaction)) return interaction.editReply('Officer role required.');

  const target = interaction.options.getUser('member');
  const courseCode = interaction.options.getString('course');

  const { data: member } = await db
    .from('members').select('display_name').eq('id', target.id).maybeSingle();
  if (!member) return interaction.editReply(`${target.username} isn't registered.`);

  const { error } = await db
    .from('certifications')
    .delete()
    .eq('member_id', target.id)
    .eq('course_code', courseCode);

  if (error) return interaction.editReply(`Database error: ${error.message}`);

  return interaction.editReply(`**${courseCode}** revoked from **${member.display_name}**.`);
}

// ──────────────────────────────────────────────
// /cert list
// ──────────────────────────────────────────────
async function handleList(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('member') ?? interaction.user;

  const { data: member } = await db
    .from('members').select('display_name').eq('id', target.id).maybeSingle();
  if (!member) return interaction.editReply(`${target.username} isn't registered yet.`);

  const { data: certs } = await db
    .from('certifications').select('course_code, awarded_at').eq('member_id', target.id);

  if (!certs?.length) {
    return interaction.editReply(`**${member.display_name}** holds no certifications yet.`);
  }

  const held = new Set(certs.map(c => c.course_code));
  const lines = [];

  for (const track of TRACK_ORDER) {
    const trackCerts = Object.entries(COURSES)
      .filter(([, c]) => c.track === track && held.has(Object.keys(COURSES).find(k => COURSES[k] === c)))
      .map(([code]) => code)
      .filter(code => held.has(code));

    if (trackCerts.length) {
      lines.push(`${TRACK_EMOJI[track]} **${track}:** ${trackCerts.join(', ')}`);
    }
  }

  return interaction.editReply(
    `**${member.display_name}'s Certifications** (${certs.length})\n\n${lines.join('\n')}`
  );
}

// ──────────────────────────────────────────────
// /cert eligible
// ──────────────────────────────────────────────
async function handleEligible(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('member') ?? interaction.user;

  const { data: member } = await db
    .from('members').select('display_name').eq('id', target.id).maybeSingle();
  if (!member) return interaction.editReply(`${target.username} isn't registered yet.`);

  const { data: certs } = await db
    .from('certifications').select('course_code').eq('member_id', target.id);

  const held = (certs ?? []).map(r => r.course_code);
  const heldSet = new Set(held);

  const eligible = Object.entries(COURSES)
    .filter(([code]) => !heldSet.has(code))
    .filter(([code]) => checkPrereqs(code, held).ok)
    .map(([code, c]) => `\`${code}\` — ${c.title} *(${c.track})*`);

  if (!eligible.length) {
    return interaction.editReply(
      heldSet.size === 0
        ? `**${member.display_name}** can start with: \`BFS-01\`, \`GFC-01\`, \`COM-01\`, or \`MNG-01\` — no prerequisites required.`
        : `**${member.display_name}** has completed all currently available courses!`
    );
  }

  return interaction.editReply(
    `**${member.display_name}** is eligible for:\n\n${eligible.join('\n')}`
  );
}
