import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all Pulsar Org Tools commands.'),

  async execute(interaction) {
    const isOfficer = interaction.member?.roles?.cache?.some(r =>
      ['Worg', 'Lycan'].includes(r.name)
    );

    const embed = new EmbedBuilder()
      .setTitle('Pulsar Org Tools — Commands')
      .setColor(0x5865F2)
      .addFields(
        {
          name: '👤 General',
          value: [
            '`/register` — Create your DKP account',
            '`/profile [member]` — View profile, DKP, and certifications',
            '`/dkp balance [member]` — Check DKP balance',
            '`/dkp top [limit]` — DKP leaderboard',
            '`/dkp history [member]` — DKP transaction history',
            '`/cert list [member]` — View certifications held',
            '`/cert eligible [member]` — Show courses you can take next',
            '`/event list` — Show open events',
            '`/event attend <event_id>` — Mark yourself as attended',
            '`/quest list` — Show open quests',
          ].join('\n'),
        },
        {
          name: `🐺 Officer ${isOfficer ? '' : '*(Worg / Lycan only)*'}`,
          value: [
            '`/dkp award <member> <amount> <reason>` — Award or deduct DKP',
            '`/cert award <member> <course>` — Award a certification',
            '`/cert revoke <member> <course>` — Revoke a certification',
            '`/event create <title> <dkp> <date> <time>` — Create event + post to Discord calendar (EST default)',
            '`/event integrate <discord_event_id> <dkp>` — Add DKP tracking to an existing Discord event',
            '`/event link <event_id> <discord_event_id>` — Manually link a bot event to a Discord event',
            '`/event close <event_id>` — Close event and award DKP to attendees',
            '`/quest post <title> <description> <dkp>` — Post a quest',
            '`/quest submissions` — View pending web dashboard turn-in submissions',
            '`/quest complete <quest_id> <member>` — Mark quest done and award DKP',
            '`/quest close <quest_id>` — Cancel a quest (no DKP awarded)',
          ].join('\n'),
        }
      )
      .setFooter({ text: 'DKP awards are automatic when a linked Discord Scheduled Event ends.' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
