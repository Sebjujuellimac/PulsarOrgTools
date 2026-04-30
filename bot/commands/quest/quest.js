import { SlashCommandBuilder } from 'discord.js';
import { db } from '../../db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('quest')
    .setDescription('Quest board commands')

    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Show all open quests.')
    )

    .addSubcommand(sub =>
      sub.setName('submissions')
        .setDescription('[Officer] Show pending web turn-in submissions awaiting confirmation.')
    )

    .addSubcommand(sub =>
      sub.setName('post')
        .setDescription('[Officer] Post a new quest to the board.')
        .addStringOption(opt =>
          opt.setName('title').setDescription('Quest title').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('description').setDescription('What is needed').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('dkp').setDescription('DKP reward for completion').setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub.setName('complete')
        .setDescription('[Officer] Mark a quest complete and award DKP to the contributor.')
        .addStringOption(opt =>
          opt.setName('quest_id').setDescription('Quest ID (from /quest list)').setRequired(true)
        )
        .addUserOption(opt =>
          opt.setName('member').setDescription('Member who completed it').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('notes').setDescription('Optional notes on completion').setRequired(false)
        )
    )

    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('[Officer] Close a quest without awarding DKP (cancelled/expired).')
        .addStringOption(opt =>
          opt.setName('quest_id').setDescription('Quest ID').setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list')        return handleList(interaction);
    if (sub === 'post')        return handlePost(interaction);
    if (sub === 'complete')    return handleComplete(interaction);
    if (sub === 'close')       return handleClose(interaction);
    if (sub === 'submissions') return handleSubmissions(interaction);
  },
};

function isOfficer(interaction) {
  return interaction.member?.roles?.cache?.some(r =>
    ['Worg', 'Lycan'].includes(r.name)
  );
}

// ──────────────────────────────────────────────
// /quest list
// ──────────────────────────────────────────────
async function handleList(interaction) {
  await interaction.deferReply();

  const { data: quests, error } = await db
    .from('quests')
    .select('id, title, description, dkp_reward, status')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(15);

  if (error) return interaction.editReply('Database error.');
  if (!quests?.length) return interaction.editReply('No open quests right now. Check back later.');

  const lines = quests.map(q =>
    `**${q.title}** — ${q.dkp_reward} DKP\n` +
    `  ${q.description}\n` +
    `  ID: \`${q.id}\``
  );

  return interaction.editReply(`**Quest Board**\n\n${lines.join('\n\n')}`);
}

// ──────────────────────────────────────────────
// /quest post
// ──────────────────────────────────────────────
async function handlePost(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!isOfficer(interaction)) return interaction.editReply('Officer role required to post quests.');

  const title = interaction.options.getString('title');
  const description = interaction.options.getString('description');
  const dkpReward = interaction.options.getInteger('dkp');

  const { data: quest, error } = await db.from('quests').insert({
    title,
    description,
    dkp_reward: dkpReward,
    status: 'open',
    created_by: interaction.user.id,
  }).select().single();

  if (error) return interaction.editReply(`Failed to post quest: ${error.message}`);

  return interaction.editReply(
    `Quest posted: **${title}**\n` +
    `Reward: **${dkpReward} DKP**\n` +
    `ID: \`${quest.id}\``
  );
}

// ──────────────────────────────────────────────
// /quest complete
// ──────────────────────────────────────────────
async function handleComplete(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!isOfficer(interaction)) return interaction.editReply('Officer role required.');

  const questId = interaction.options.getString('quest_id');
  const target = interaction.options.getUser('member');
  const notes = interaction.options.getString('notes') ?? null;

  const { data: quest } = await db
    .from('quests').select('*').eq('id', questId).maybeSingle();

  if (!quest) return interaction.editReply('Quest not found.');
  if (quest.status !== 'open') return interaction.editReply('That quest is not open.');

  const { data: member } = await db
    .from('members').select('dkp_balance, display_name').eq('id', target.id).maybeSingle();

  if (!member) return interaction.editReply(`${target.username} hasn't registered yet.`);

  const newBalance = member.dkp_balance + quest.dkp_reward;

  await Promise.all([
    db.from('quests').update({ status: 'completed' }).eq('id', questId),
    db.from('quest_completions').insert({
      quest_id: questId,
      member_id: target.id,
      notes,
      completed_by: interaction.user.id,
    }),
    db.from('members').update({ dkp_balance: newBalance }).eq('id', target.id),
    db.from('dkp_transactions').insert({
      member_id: target.id,
      amount: quest.dkp_reward,
      reason: `Quest completion: ${quest.title}`,
      quest_id: questId,
      awarded_by: interaction.user.id,
    }),
  ]);

  return interaction.editReply(
    `Quest **${quest.title}** marked complete.\n` +
    `Awarded **${quest.dkp_reward} DKP** to **${member.display_name}**.\n` +
    `New balance: **${newBalance}**`
  );
}

// ──────────────────────────────────────────────
// /quest submissions  (pending web turn-ins)
// ──────────────────────────────────────────────
async function handleSubmissions(interaction) {
  await interaction.deferReply({ ephemeral: true });
  if (!isOfficer(interaction)) return interaction.editReply('Officer role required.');

  const { data: subs, error } = await db
    .from('quest_submissions')
    .select('id, quest_id, member_id, notes, submitted_at, quests(title, dkp_reward), members(display_name, username)')
    .order('submitted_at', { ascending: true })
    .limit(20);

  if (error) return interaction.editReply(`Database error: ${error.message}`);
  if (!subs?.length) return interaction.editReply('No pending turn-in submissions.');

  const lines = subs.map(s => {
    const name = s.members?.display_name || s.members?.username || s.member_id;
    const quest = s.quests?.title || s.quest_id;
    const dkp = s.quests?.dkp_reward ?? '?';
    const date = new Date(s.submitted_at).toLocaleDateString();
    const notes = s.notes ? `\n  > ${s.notes}` : '';
    return `**${name}** → **${quest}** (${dkp} DKP) · ${date}${notes}\n  Use \`/quest complete quest_id:${s.quest_id} member:@${name}\` to confirm.`;
  });

  return interaction.editReply(`**Pending Turn-In Submissions** (${subs.length})\n\n${lines.join('\n\n')}`);
}

// ──────────────────────────────────────────────
// /quest close  (cancel without reward)
// ──────────────────────────────────────────────
async function handleClose(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!isOfficer(interaction)) return interaction.editReply('Officer role required.');

  const questId = interaction.options.getString('quest_id');

  const { data: quest } = await db
    .from('quests').select('title, status').eq('id', questId).maybeSingle();

  if (!quest) return interaction.editReply('Quest not found.');
  if (quest.status !== 'open') return interaction.editReply('That quest is already closed.');

  await db.from('quests').update({ status: 'closed' }).eq('id', questId);

  return interaction.editReply(`Quest **${quest.title}** closed (no DKP awarded).`);
}
