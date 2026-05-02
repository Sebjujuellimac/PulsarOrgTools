/**
 * /rsi — RSI account linking and profile lookup
 *
 * Subcommands:
 *   link    <handle>   — start the bio-token verification flow
 *   confirm            — check bio for the token and complete linking
 *   profile [member]   — display RSI profile data for a member
 *   unlink             — remove your RSI link
 *   whois   <handle>   — public RSI lookup (no account link required)
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { randomBytes } from 'crypto';
import { db } from '../../db.js';
import { fetchRsiUser, isOrgMember } from '../../rsiApi.js';

const TOKEN_PREFIX  = 'khd-';
const TOKEN_TTL_MS  = 48 * 60 * 60 * 1000;   // 48 hours
const ORG_SID       = process.env.KHD_ORG_SID; // optional — enables org-membership check

export default {
  data: new SlashCommandBuilder()
    .setName('rsi')
    .setDescription('RSI account linking and profile commands')

    .addSubcommand(sub =>
      sub.setName('link')
        .setDescription('Link your RSI account to your KHD profile.')
        .addStringOption(opt =>
          opt.setName('handle')
            .setDescription('Your RSI handle (exactly as shown on your RSI profile)')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub.setName('confirm')
        .setDescription('Confirm your RSI link after adding the verification token to your bio.')
    )

    .addSubcommand(sub =>
      sub.setName('profile')
        .setDescription('View RSI profile info for a KHD member.')
        .addUserOption(opt =>
          opt.setName('member')
            .setDescription('Member to view (defaults to you)')
            .setRequired(false)
        )
    )

    .addSubcommand(sub =>
      sub.setName('unlink')
        .setDescription('Remove your RSI account link from your KHD profile.')
    )

    .addSubcommand(sub =>
      sub.setName('whois')
        .setDescription('Look up any public RSI profile by handle.')
        .addStringOption(opt =>
          opt.setName('handle')
            .setDescription('RSI handle to look up')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'link')    return handleLink(interaction);
    if (sub === 'confirm') return handleConfirm(interaction);
    if (sub === 'profile') return handleProfile(interaction);
    if (sub === 'unlink')  return handleUnlink(interaction);
    if (sub === 'whois')   return handleWhois(interaction);
  },
};

// ── /rsi link ────────────────────────────────────────────────────────────────

async function handleLink(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const handle = interaction.options.getString('handle').trim();

  // Must be registered first
  const { data: member } = await db
    .from('members').select('id, display_name, rsi_handle, rsi_verified')
    .eq('id', interaction.user.id).maybeSingle();

  if (!member) {
    return interaction.editReply('You need to `/register` before linking your RSI account.');
  }

  // Already verified — confirm before overwriting
  if (member.rsi_verified && member.rsi_handle) {
    return interaction.editReply(
      `Your account is already linked to **${member.rsi_handle}**.\n` +
      `Use \`/rsi unlink\` first if you want to link a different handle.`
    );
  }

  // Check the handle isn't already claimed by another member
  const { data: clash } = await db
    .from('members')
    .select('id, display_name')
    .ilike('rsi_handle', handle)
    .neq('id', interaction.user.id)
    .maybeSingle();

  if (clash) {
    return interaction.editReply(
      `The handle **${handle}** is already linked to another member. ` +
      `If you believe this is an error, contact an officer.`
    );
  }

  // Verify the handle exists on RSI
  let rsiProfile;
  try {
    rsiProfile = await fetchRsiUser(handle, 'live');
  } catch (err) {
    console.error('RSI API error during /rsi link:', err);
    return interaction.editReply(
      `Couldn't reach the RSI API right now. Try again in a moment.\n` +
      `*(${err.message})*`
    );
  }

  if (!rsiProfile) {
    return interaction.editReply(
      `No RSI profile found for **${handle}**. ` +
      `Check the spelling — handles are case-sensitive on RSI's end.`
    );
  }

  // Generate a bio token
  const token   = TOKEN_PREFIX + randomBytes(5).toString('hex');
  const expires = new Date(Date.now() + TOKEN_TTL_MS);

  await db.from('members').update({
    rsi_handle:         rsiProfile.handle ?? handle,  // use RSI's canonical casing
    rsi_verified:       false,
    rsi_verify_token:   token,
    rsi_verify_expires: expires.toISOString(),
  }).eq('id', interaction.user.id);

  return interaction.editReply({
    content:
      `## RSI Account Verification\n` +
      `Handle found: **${rsiProfile.handle ?? handle}**\n\n` +
      `**Step 1:** Go to your RSI profile bio:\n` +
      `<https://robertsspaceindustries.com/citizens/${encodeURIComponent(rsiProfile.handle ?? handle)}/edit>\n\n` +
      `**Step 2:** Add this token anywhere in your bio:\n` +
      `\`\`\`${token}\`\`\`\n` +
      `**Step 3:** Run \`/rsi confirm\` — I'll check your bio and complete the link.\n\n` +
      `*Token expires in 48 hours. You can remove it from your bio after confirming.*`,
  });
}

// ── /rsi confirm ─────────────────────────────────────────────────────────────

async function handleConfirm(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const { data: member } = await db
    .from('members')
    .select('id, display_name, rsi_handle, rsi_verify_token, rsi_verify_expires, rsi_verified')
    .eq('id', interaction.user.id).maybeSingle();

  if (!member) {
    return interaction.editReply('You need to `/register` before linking your RSI account.');
  }
  if (member.rsi_verified) {
    return interaction.editReply(`Your RSI account (**${member.rsi_handle}**) is already verified. ✅`);
  }
  if (!member.rsi_verify_token || !member.rsi_handle) {
    return interaction.editReply('No pending verification found. Run `/rsi link <handle>` first.');
  }
  if (new Date(member.rsi_verify_expires) < new Date()) {
    return interaction.editReply(
      'Your verification token has expired. Run `/rsi link` again to get a new one.'
    );
  }

  // Fetch their bio live
  let rsiProfile;
  try {
    rsiProfile = await fetchRsiUser(member.rsi_handle, 'live');
  } catch (err) {
    console.error('RSI API error during /rsi confirm:', err);
    return interaction.editReply(
      `Couldn't reach the RSI API right now. Try again in a moment.\n*(${err.message})*`
    );
  }

  if (!rsiProfile) {
    return interaction.editReply(`Couldn't find the RSI profile for **${member.rsi_handle}**. Contact an officer.`);
  }

  // Check for token in bio
  if (!rsiProfile.bio?.includes(member.rsi_verify_token)) {
    return interaction.editReply(
      `Token not found in your RSI bio yet.\n\n` +
      `Make sure **\`${member.rsi_verify_token}\`** appears in your bio at:\n` +
      `<https://robertsspaceindustries.com/citizens/${encodeURIComponent(member.rsi_handle)}/edit>\n\n` +
      `Then run \`/rsi confirm\` again. *(Hint: save the bio page before confirming.)*`
    );
  }

  // Optional: warn if they're not in the org (but don't block — officers can still award)
  let orgLine = '';
  if (ORG_SID) {
    try {
      const inOrg = await isOrgMember(member.rsi_handle, ORG_SID);
      if (!inOrg) {
        orgLine = `\n⚠️ Your RSI profile doesn't show membership in the **${ORG_SID}** org. ` +
                  `Contact an officer if you believe this is wrong.`;
      }
    } catch {
      // Org check is best-effort — don't fail verification if it errors
    }
  }

  // All good — persist RSI data, clear token
  await db.from('members').update({
    rsi_verified:       true,
    rsi_verify_token:   null,
    rsi_verify_expires: null,
    rsi_citizen_number: rsiProfile.citizenNumber,
    rsi_avatar_url:     rsiProfile.avatarUrl,
    rsi_enlisted:       rsiProfile.enlisted,
    rsi_org_rank:       rsiProfile.orgRank,
    rsi_last_synced:    new Date().toISOString(),
  }).eq('id', interaction.user.id);

  return interaction.editReply(
    `✅ **RSI account verified!**\n\n` +
    `Handle: **${member.rsi_handle}**\n` +
    (rsiProfile.citizenNumber ? `Citizen #: **${rsiProfile.citizenNumber}**\n` : '') +
    (rsiProfile.enlisted      ? `Enlisted:  **${rsiProfile.enlisted}**\n`       : '') +
    (rsiProfile.orgRank       ? `Org Rank:  **${rsiProfile.orgRank}**\n`        : '') +
    `\nYou can remove the token from your bio now.` +
    orgLine
  );
}

// ── /rsi profile ─────────────────────────────────────────────────────────────

async function handleProfile(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('member') ?? interaction.user;

  const { data: member } = await db
    .from('members')
    .select('display_name, rsi_handle, rsi_verified, rsi_citizen_number, rsi_avatar_url, rsi_enlisted, rsi_org_rank, rsi_last_synced')
    .eq('id', target.id).maybeSingle();

  if (!member) {
    return interaction.editReply(`${target.username} hasn't registered yet.`);
  }
  if (!member.rsi_verified || !member.rsi_handle) {
    const isSelf = target.id === interaction.user.id;
    return interaction.editReply(
      isSelf
        ? `You haven't linked your RSI account yet. Use \`/rsi link <handle>\` to get started.`
        : `**${member.display_name}** hasn't linked their RSI account yet.`
    );
  }

  // Attempt a live refresh if data is stale (>24h) or avatar missing
  let fresh = null;
  const lastSynced = member.rsi_last_synced ? new Date(member.rsi_last_synced) : null;
  const stale = !lastSynced || (Date.now() - lastSynced.getTime()) > 24 * 60 * 60 * 1000;

  if (stale) {
    try {
      fresh = await fetchRsiUser(member.rsi_handle, 'auto');
      if (fresh) {
        await db.from('members').update({
          rsi_citizen_number: fresh.citizenNumber ?? member.rsi_citizen_number,
          rsi_avatar_url:     fresh.avatarUrl     ?? member.rsi_avatar_url,
          rsi_enlisted:       fresh.enlisted      ?? member.rsi_enlisted,
          rsi_org_rank:       fresh.orgRank       ?? member.rsi_org_rank,
          rsi_last_synced:    new Date().toISOString(),
        }).eq('id', target.id);
      }
    } catch { /* best-effort */ }
  }

  const avatar    = fresh?.avatarUrl     ?? member.rsi_avatar_url;
  const citizen   = fresh?.citizenNumber ?? member.rsi_citizen_number;
  const enlisted  = fresh?.enlisted      ?? member.rsi_enlisted;
  const rank      = fresh?.orgRank       ?? member.rsi_org_rank;

  const embed = new EmbedBuilder()
    .setTitle(`${member.rsi_handle}`)
    .setURL(`https://robertsspaceindustries.com/citizens/${encodeURIComponent(member.rsi_handle)}`)
    .setColor(0x1a6496)
    .addFields(
      { name: 'KHD Member',    value: member.display_name,              inline: true },
      { name: 'Citizen #',     value: citizen   ?? '—',                 inline: true },
      { name: 'Enlisted',      value: enlisted  ?? '—',                 inline: true },
      { name: 'Org Rank',      value: rank      ?? '—',                 inline: true },
    )
    .setFooter({ text: 'RSI Profile' });

  if (avatar) embed.setThumbnail(avatar);

  return interaction.editReply({ embeds: [embed] });
}

// ── /rsi unlink ──────────────────────────────────────────────────────────────

async function handleUnlink(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const { data: member } = await db
    .from('members').select('display_name, rsi_handle, rsi_verified')
    .eq('id', interaction.user.id).maybeSingle();

  if (!member) {
    return interaction.editReply('You need to `/register` before managing your RSI link.');
  }
  if (!member.rsi_handle && !member.rsi_verify_token) {
    return interaction.editReply("You don't have an RSI account linked.");
  }

  await db.from('members').update({
    rsi_handle:         null,
    rsi_verified:       false,
    rsi_verify_token:   null,
    rsi_verify_expires: null,
    rsi_citizen_number: null,
    rsi_avatar_url:     null,
    rsi_enlisted:       null,
    rsi_org_rank:       null,
    rsi_last_synced:    null,
  }).eq('id', interaction.user.id);

  return interaction.editReply(
    `RSI account **${member.rsi_handle ?? '(pending)'}** has been unlinked from your KHD profile.`
  );
}

// ── /rsi whois ───────────────────────────────────────────────────────────────

async function handleWhois(interaction) {
  await interaction.deferReply();

  const handle = interaction.options.getString('handle').trim();

  let profile;
  try {
    profile = await fetchRsiUser(handle, 'auto');
  } catch (err) {
    console.error('RSI API error during /rsi whois:', err);
    return interaction.editReply(`RSI API error: ${err.message}`);
  }

  if (!profile) {
    return interaction.editReply(`No RSI profile found for **${handle}**.`);
  }

  // Check if this handle is linked to a KHD member
  const { data: linked } = await db
    .from('members').select('display_name')
    .ilike('rsi_handle', profile.handle ?? handle)
    .maybeSingle();

  const embed = new EmbedBuilder()
    .setTitle(profile.handle ?? handle)
    .setURL(`https://robertsspaceindustries.com/citizens/${encodeURIComponent(profile.handle ?? handle)}`)
    .setColor(0x1a6496)
    .addFields(
      { name: 'Display Name', value: profile.displayName ?? '—', inline: true },
      { name: 'Citizen #',    value: profile.citizenNumber ?? '—', inline: true },
      { name: 'Enlisted',     value: profile.enlisted ?? '—', inline: true },
    );

  if (profile.orgName) {
    embed.addFields({
      name: 'Primary Org',
      value: `${profile.orgName} *(${profile.orgSid})*${profile.orgRank ? ` — ${profile.orgRank}` : ''}`,
      inline: false,
    });
  }

  if (linked) {
    embed.addFields({ name: '🐺 KHD Member', value: linked.display_name, inline: true });
  }

  if (profile.bio) {
    const bio = profile.bio.length > 200 ? profile.bio.slice(0, 197) + '…' : profile.bio;
    embed.addFields({ name: 'Bio', value: bio, inline: false });
  }

  if (profile.avatarUrl) embed.setThumbnail(profile.avatarUrl);
  embed.setFooter({ text: 'RSI Public Profile' });

  return interaction.editReply({ embeds: [embed] });
}
