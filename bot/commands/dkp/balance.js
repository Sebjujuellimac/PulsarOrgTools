import { SlashCommandBuilder } from 'discord.js';
import { db } from '../../db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('dkp')
    .setDescription('DKP commands')
    .addSubcommand(sub =>
      sub.setName('balance')
        .setDescription('Check your DKP balance or another member\'s.')
        .addUserOption(opt =>
          opt.setName('member')
            .setDescription('Member to check (defaults to you)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('award')
        .setDescription('[Officer] Award DKP to a member.')
        .addUserOption(opt =>
          opt.setName('member').setDescription('Member to award').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount').setDescription('DKP amount (can be negative to deduct)').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('reason').setDescription('Reason for the award').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('top')
        .setDescription('Show the DKP leaderboard.')
        .addIntegerOption(opt =>
          opt.setName('limit').setDescription('How many members to show (default 10)').setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('history')
        .setDescription('Show DKP transaction history for a member.')
        .addUserOption(opt =>
          opt.setName('member').setDescription('Member to check (defaults to you)').setRequired(false)
        )
        .addIntegerOption(opt =>
          opt.setName('limit').setDescription('How many entries to show (default 10)').setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'balance') return handleBalance(interaction);
    if (sub === 'award')   return handleAward(interaction);
    if (sub === 'top')     return handleTop(interaction);
    if (sub === 'history') return handleHistory(interaction);
  },
};

// ──────────────────────────────────────────────
// /dkp balance
// ──────────────────────────────────────────────
async function handleBalance(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('member') ?? interaction.user;

  const { data: member, error } = await db
    .from('members')
    .select('display_name, dkp_balance')
    .eq('id', target.id)
    .maybeSingle();

  if (error) return interaction.editReply('Database error. Try again later.');
  if (!member) return interaction.editReply(`${target.username} hasn't registered yet. Use \`/register\` first.`);

  return interaction.editReply(`**${member.display_name}** — DKP balance: **${member.dkp_balance}**`);
}

// ──────────────────────────────────────────────
// /dkp award  (officers only)
// ──────────────────────────────────────────────
async function handleAward(interaction) {
  await interaction.deferReply({ ephemeral: true });

  // Basic officer check — any role named "Officer" or "Admin"
  const memberRoles = interaction.member?.roles?.cache;
  const isOfficer = memberRoles?.some(r => ['Worg', 'Lycan'].includes(r.name));
  if (!isOfficer) {
    return interaction.editReply('You need the Officer or Admin role to award DKP.');
  }

  const target = interaction.options.getUser('member');
  const amount = interaction.options.getInteger('amount');
  const reason = interaction.options.getString('reason');

  const { data: member } = await db
    .from('members')
    .select('id, dkp_balance, display_name')
    .eq('id', target.id)
    .maybeSingle();

  if (!member) return interaction.editReply(`${target.username} hasn't registered yet.`);

  const newBalance = member.dkp_balance + amount;

  await Promise.all([
    db.from('members').update({ dkp_balance: newBalance }).eq('id', target.id),
    db.from('dkp_transactions').insert({
      member_id: target.id,
      amount,
      reason,
      awarded_by: interaction.user.id,
    }),
  ]);

  const sign = amount >= 0 ? '+' : '';
  return interaction.editReply(
    `Awarded **${sign}${amount} DKP** to **${member.display_name}**.\n` +
    `Reason: ${reason}\n` +
    `New balance: **${newBalance}**`
  );
}

// ──────────────────────────────────────────────
// /dkp top
// ──────────────────────────────────────────────
async function handleTop(interaction) {
  await interaction.deferReply();

  const limit = Math.min(interaction.options.getInteger('limit') ?? 10, 25);

  const { data: members, error } = await db
    .from('members')
    .select('display_name, dkp_balance')
    .order('dkp_balance', { ascending: false })
    .limit(limit);

  if (error || !members?.length) {
    return interaction.editReply('No members found.');
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = members.map((m, i) => {
    const rank = medals[i] ?? `**${i + 1}.**`;
    return `${rank} ${m.display_name} — **${m.dkp_balance} DKP**`;
  });

  return interaction.editReply(`**DKP Leaderboard**\n\n${lines.join('\n')}`);
}

// ──────────────────────────────────────────────
// /dkp history
// ──────────────────────────────────────────────
async function handleHistory(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('member') ?? interaction.user;
  const limit = Math.min(interaction.options.getInteger('limit') ?? 10, 25);

  const { data: txs, error } = await db
    .from('dkp_transactions')
    .select('amount, reason, created_at')
    .eq('member_id', target.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return interaction.editReply('Database error.');
  if (!txs?.length) return interaction.editReply(`No DKP history found for ${target.username}.`);

  const lines = txs.map(tx => {
    const sign = tx.amount >= 0 ? '+' : '';
    const date = new Date(tx.created_at).toLocaleDateString();
    return `${sign}${tx.amount} — ${tx.reason} *(${date})*`;
  });

  return interaction.editReply(`**DKP History — ${target.username}**\n\n${lines.join('\n')}`);
}
