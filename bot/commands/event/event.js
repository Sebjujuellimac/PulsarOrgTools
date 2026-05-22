import { SlashCommandBuilder, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType, ChannelType } from 'discord.js';
import { db } from '../../db.js';
import { TIMEZONE_MAP, parseEventTime } from '../../utils/timeUtils.js';
import { getCourses, autocompleteCourses } from '../../courseData.js';
import { awardCertsToAttendees, finalizeTimeTracking, awardDkp } from '../../eventHelpers.js';

// ──────────────────────────────────────────────
// Command definition
// ──────────────────────────────────────────────
export default {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Event management commands')

    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('[Officer] Create an event — posts to the Discord calendar automatically.')
        .addStringOption(opt =>
          opt.setName('title').setDescription('Event title').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('dkp').setDescription('DKP reward for attending').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('date')
            .setDescription('Date in YYYY-MM-DD format (e.g. 2026-05-10)').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('time')
            .setDescription('Start time in HH:MM — 24h (e.g. 20:00). Defaults to Eastern Time.')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('timezone')
            .setDescription('Timezone (default: EST)')
            .setRequired(false)
            .addChoices(
              { name: 'EST — Eastern',   value: 'EST' },
              { name: 'CST — Central',   value: 'CST' },
              { name: 'MST — Mountain',  value: 'MST' },
              { name: 'PST — Pacific',   value: 'PST' },
              { name: 'GMT / UTC',       value: 'UTC' },
              { name: 'BST — UK',        value: 'BST' },
              { name: 'CET — Europe',    value: 'CET' },
              { name: 'AEST — Australia', value: 'AEST' },
            )
        )
        .addIntegerOption(opt =>
          opt.setName('duration')
            .setDescription('Duration in minutes (default: 90)').setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('location')
            .setDescription('Location (default: Star Citizen)').setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('description')
            .setDescription('Event description').setRequired(false)
        )
        .addChannelOption(opt =>
          opt.setName('voice_channel')
            .setDescription('Voice channel for auto-attendance (members joining get marked attended)')
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('course')
            .setDescription('Course this event teaches (prompts officers to award cert on close)')
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addNumberOption(opt =>
          opt.setName('dkp_per_hour')
            .setDescription('Time-based DKP per hour of voice attendance (stacks with flat reward, default: 0)')
            .setRequired(false)
            .setMinValue(0)
        )
        .addNumberOption(opt =>
          opt.setName('auec_per_hour')
            .setDescription('aUEC owed per hour of voice attendance (recorded for manual payout, default: 0)')
            .setRequired(false)
            .setMinValue(0)
        )
    )

    .addSubcommand(sub =>
      sub.setName('integrate')
        .setDescription('[Officer] Add DKP + attendance tracking to an existing Discord calendar event.')
        .addStringOption(opt =>
          opt.setName('discord_event_id')
            .setDescription('ID of the existing Discord Scheduled Event').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('dkp').setDescription('DKP reward for attending').setRequired(true)
        )
        .addChannelOption(opt =>
          opt.setName('voice_channel')
            .setDescription('Voice channel for auto-attendance')
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('course')
            .setDescription('Course this event teaches')
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addNumberOption(opt =>
          opt.setName('dkp_per_hour')
            .setDescription('Time-based DKP per hour of voice attendance')
            .setRequired(false)
            .setMinValue(0)
        )
        .addNumberOption(opt =>
          opt.setName('auec_per_hour')
            .setDescription('aUEC owed per hour of voice attendance')
            .setRequired(false)
            .setMinValue(0)
        )
    )

    .addSubcommand(sub =>
      sub.setName('certify')
        .setDescription('[Officer] Award the linked course cert to attendees of a closed event.')
        .addStringOption(opt =>
          opt.setName('event_id').setDescription('Bot event ID (the training session)').setRequired(true)
        )
        .addUserOption(opt =>
          opt.setName('only').setDescription('Only certify this one member (default: all attendees)').setRequired(false)
        )
        .addBooleanOption(opt =>
          opt.setName('override').setDescription('Skip prereq check (default: false)').setRequired(false)
        )
    )

    .addSubcommand(sub =>
      sub.setName('link')
        .setDescription('[Officer] Manually link a bot event to a Discord Scheduled Event.')
        .addStringOption(opt =>
          opt.setName('event_id').setDescription('Bot event ID (from /event list)').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('discord_event_id').setDescription('Discord Scheduled Event ID').setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('[Officer] Manually close an event and award DKP to all marked attendees.')
        .addStringOption(opt =>
          opt.setName('event_id').setDescription('Bot event ID (from /event list)').setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub.setName('attend')
        .setDescription('Mark yourself as attended for an event.')
        .addStringOption(opt =>
          opt.setName('event_id').setDescription('Bot event ID (from /event list)').setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List open events.')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'create')    return handleCreate(interaction);
    if (sub === 'integrate') return handleIntegrate(interaction);
    if (sub === 'link')      return handleLink(interaction);
    if (sub === 'close')     return handleClose(interaction);
    if (sub === 'attend')    return handleAttend(interaction);
    if (sub === 'list')      return handleList(interaction);
    if (sub === 'certify')   return handleCertify(interaction);
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'course') {
      const choices = await autocompleteCourses(focused.value);
      await interaction.respond(choices);
    }
  },
};

function isOfficer(interaction) {
  return interaction.member?.roles?.cache?.some(r =>
    ['Worg', 'Lycan'].includes(r.name)
  );
}

// ──────────────────────────────────────────────
// /event create
// ──────────────────────────────────────────────
async function handleCreate(interaction) {
  await interaction.deferReply({ ephemeral: true });
  if (!isOfficer(interaction)) return interaction.editReply('Officer role required.');

  const title        = interaction.options.getString('title');
  const dkpReward    = interaction.options.getInteger('dkp');
  const dateStr      = interaction.options.getString('date');
  const timeStr      = interaction.options.getString('time');
  const tzAbbr       = interaction.options.getString('timezone') ?? 'EST';
  const duration     = interaction.options.getInteger('duration') ?? 90;
  const location     = interaction.options.getString('location') ?? 'Star Citizen';
  const description  = interaction.options.getString('description') ?? null;
  const voiceChannel = interaction.options.getChannel('voice_channel');
  const courseCode   = interaction.options.getString('course');
  const dkpPerHour   = interaction.options.getNumber('dkp_per_hour')  ?? 0;
  const auecPerHour  = interaction.options.getNumber('auec_per_hour') ?? 0;

  const startTime = parseEventTime(dateStr, timeStr, tzAbbr);
  if (!startTime) {
    return interaction.editReply(
      `Couldn't parse the date/time.\n` +
      `Date must be **YYYY-MM-DD** (e.g. \`2026-05-10\`)\n` +
      `Time must be **HH:MM** in 24h (e.g. \`20:00\`)`
    );
  }
  if (startTime < Date.now()) {
    return interaction.editReply('That start time is in the past — double-check the date and time.');
  }

  const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

  // Create Discord Scheduled Event
  let discordEvent;
  try {
    discordEvent = await interaction.guild.scheduledEvents.create({
      name: title,
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: { location },
      description: description ?? undefined,
    });
  } catch (err) {
    console.error('Discord Scheduled Event creation failed:', err.message);
    // Save to DB without calendar link — officer can /event link later
    const { data: evt, error: dbErr } = await db.from('events').insert({
      title, dkp_reward: dkpReward, status: 'open', created_by: interaction.user.id,
    }).select().single();
    if (dbErr) return interaction.editReply(`Database error: ${dbErr.message}`);
    return interaction.editReply(
      `⚠️ Saved to bot but Discord calendar creation failed.\n` +
      `The bot likely needs the **Manage Events** permission.\n\n` +
      `**${title}** · ${dkpReward} DKP · ID: \`${evt.id}\``
    );
  }

  // Save to DB with Discord event already linked
  const { data: evt, error: dbErr } = await db.from('events').insert({
    title, description, dkp_reward: dkpReward,
    discord_event_id: discordEvent.id,
    scheduled_start_time: startTime,
    scheduled_end_time: endTime,
    location,
    status: 'open',
    created_by: interaction.user.id,
    voice_channel_id:   voiceChannel?.id ?? null,
    course_code:        courseCode ?? null,
    officer_channel_id: interaction.channelId,
    dkp_per_hour:  dkpPerHour  > 0 ? dkpPerHour  : null,
    auec_per_hour: auecPerHour > 0 ? auecPerHour : null,
  }).select().single();

  if (dbErr) return interaction.editReply(`Discord event created but DB save failed: ${dbErr.message}`);

  // Format time back in the chosen timezone for confirmation
  const displayTime = startTime.toLocaleString('en-US', {
    timeZone: TIMEZONE_MAP[tzAbbr],
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });

  let courseTitle = null;
  if (courseCode) {
    const COURSES = await getCourses();
    courseTitle = COURSES[courseCode]?.title ?? courseCode;
  }
  const extras = [
    voiceChannel ? `🎙️ Auto-attendance from <#${voiceChannel.id}>` : '',
    courseCode   ? `🎓 Course: **${courseCode} — ${courseTitle}** (cert prompt on close)` : '',
    dkpPerHour   > 0 ? `⏱️ Time DKP: **${dkpPerHour} DKP/hr** of voice attendance` : '',
    auecPerHour  > 0 ? `💵 Time aUEC: **${auecPerHour.toLocaleString()} aUEC/hr** (recorded for manual payout)` : '',
  ].filter(Boolean).join('\n');

  return interaction.editReply(
    `✅ Event created and posted to the Discord calendar!\n\n` +
    `**${title}**\n` +
    `📅 ${displayTime}\n` +
    `⏱️ ${duration} min · 📍 ${location}\n` +
    `💰 ${dkpReward} DKP reward\n` +
    (extras ? extras + '\n' : '') +
    `ID: \`${evt.id}\``
  );
}

// ──────────────────────────────────────────────
// /event integrate
// ──────────────────────────────────────────────
async function handleIntegrate(interaction) {
  await interaction.deferReply({ ephemeral: true });
  if (!isOfficer(interaction)) return interaction.editReply('Officer role required.');

  const discordEventId = interaction.options.getString('discord_event_id');
  const dkpReward      = interaction.options.getInteger('dkp');
  const voiceChannel   = interaction.options.getChannel('voice_channel');
  const courseCode     = interaction.options.getString('course');
  const dkpPerHour     = interaction.options.getNumber('dkp_per_hour')  ?? 0;
  const auecPerHour    = interaction.options.getNumber('auec_per_hour') ?? 0;

  // Check not already tracked
  const { data: existing } = await db
    .from('events').select('id').eq('discord_event_id', discordEventId).maybeSingle();
  if (existing) {
    return interaction.editReply(`That Discord event is already being tracked. Bot event ID: \`${existing.id}\``);
  }

  // Fetch the Discord Scheduled Event to pull its details
  let discordEvent;
  try {
    discordEvent = await interaction.guild.scheduledEvents.fetch(discordEventId);
  } catch {
    return interaction.editReply(
      `Couldn't find a Discord Scheduled Event with ID \`${discordEventId}\`.\n` +
      `Make sure you're copying the event ID, not the event URL.`
    );
  }

  // Save to DB using the Discord event's own details
  const { data: evt, error: dbErr } = await db.from('events').insert({
    title: discordEvent.name,
    description: discordEvent.description ?? null,
    dkp_reward: dkpReward,
    discord_event_id: discordEventId,
    scheduled_start_time: discordEvent.scheduledStartAt,
    scheduled_end_time: discordEvent.scheduledEndAt ?? null,
    location: discordEvent.entityMetadata?.location ?? null,
    status: 'open',
    created_by: interaction.user.id,
    voice_channel_id:   voiceChannel?.id ?? null,
    course_code:        courseCode ?? null,
    officer_channel_id: interaction.channelId,
    dkp_per_hour:  dkpPerHour  > 0 ? dkpPerHour  : null,
    auec_per_hour: auecPerHour > 0 ? auecPerHour : null,
  }).select().single();

  if (dbErr) return interaction.editReply(`Database error: ${dbErr.message}`);

  return interaction.editReply(
    `✅ **${discordEvent.name}** is now tracked by the bot.\n\n` +
    `💰 ${dkpReward} DKP will be awarded to attendees on close.\n` +
    `Members can mark attendance with \`/event attend\` using ID: \`${evt.id}\`\n` +
    `DKP will also award automatically when the Discord event ends.`
  );
}

// ──────────────────────────────────────────────
// /event link  (manual fallback)
// ──────────────────────────────────────────────
async function handleLink(interaction) {
  await interaction.deferReply({ ephemeral: true });
  if (!isOfficer(interaction)) return interaction.editReply('Officer role required.');

  const eventId = interaction.options.getString('event_id');
  const discordEventId = interaction.options.getString('discord_event_id');

  const { error } = await db.from('events')
    .update({ discord_event_id: discordEventId })
    .eq('id', eventId);

  if (error) return interaction.editReply(`Failed to link: ${error.message}`);
  return interaction.editReply(`Event \`${eventId}\` linked to Discord event \`${discordEventId}\`.`);
}

// ──────────────────────────────────────────────
// /event close
// ──────────────────────────────────────────────
async function handleClose(interaction) {
  await interaction.deferReply({ ephemeral: true });
  if (!isOfficer(interaction)) return interaction.editReply('Officer role required.');

  const eventId = interaction.options.getString('event_id');

  const { data: evt, error: fetchErr } = await db
    .from('events').select('*').eq('id', eventId).maybeSingle();

  if (fetchErr || !evt) return interaction.editReply('Event not found.');
  if (evt.status === 'closed') return interaction.editReply('That event is already closed.');

  await db.from('events').update({ status: 'closed' }).eq('id', eventId);

  // Finalize time tracking — clock out remaining members, calculate time DKP/aUEC
  await finalizeTimeTracking(evt, new Date().toISOString());

  const { data: attendees } = await db
    .from('attendance').select('member_id')
    .eq('event_id', eventId).eq('attended', true);

  // Award flat DKP (separate from time-based DKP which finalizeTimeTracking handled)
  let awarded = 0;
  if (evt.dkp_reward > 0) {
    for (const row of attendees ?? []) {
      await awardDkp({
        memberId:  row.member_id,
        amount:    evt.dkp_reward,
        reason:    `Event attendance: ${evt.title}`,
        eventId:   eventId,
        awardedBy: interaction.user.id,
      });
      awarded++;
    }
  }

  const lines = [
    `Event **${evt.title}** closed.`,
    evt.dkp_reward > 0 ? `Flat DKP: **${evt.dkp_reward}** awarded to **${awarded}** attendee(s).` : '',
    evt.dkp_per_hour  > 0 ? `Time DKP: **${evt.dkp_per_hour} DKP/hr** calculated per attendee duration.` : '',
    evt.auec_per_hour > 0 ? `Time aUEC: **${evt.auec_per_hour.toLocaleString()} aUEC/hr** recorded — check the dashboard to see individual amounts owed.` : '',
  ].filter(Boolean).join('\n');

  return interaction.editReply(lines);
}

// ──────────────────────────────────────────────
// /event attend
// ──────────────────────────────────────────────
async function handleAttend(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const eventId = interaction.options.getString('event_id');

  const { data: evt } = await db
    .from('events').select('id, title, status').eq('id', eventId).maybeSingle();

  if (!evt) return interaction.editReply('Event not found.');
  if (evt.status === 'closed') return interaction.editReply('That event is already closed.');

  const { data: member } = await db
    .from('members').select('id').eq('id', interaction.user.id).maybeSingle();
  if (!member) return interaction.editReply('You need to register first — use `/register`.');

  const { error } = await db.from('attendance').upsert({
    event_id: eventId,
    member_id: interaction.user.id,
    attended: true,
  }, { onConflict: 'event_id,member_id' });

  if (error) return interaction.editReply(`Failed to record attendance: ${error.message}`);
  return interaction.editReply(`Attendance recorded for **${evt.title}**. DKP will be awarded when the event closes.`);
}

// ──────────────────────────────────────────────
// /event list
// ──────────────────────────────────────────────
async function handleList(interaction) {
  await interaction.deferReply();

  const { data: events, error } = await db
    .from('events')
    .select('id, title, dkp_reward, scheduled_start_time, location')
    .eq('status', 'open')
    .order('scheduled_start_time', { ascending: true, nullsFirst: false })
    .limit(10);

  if (error) return interaction.editReply('Database error.');
  if (!events?.length) return interaction.editReply('No open events right now.');

  const lines = events.map(e => {
    const when = e.scheduled_start_time
      ? new Date(e.scheduled_start_time).toLocaleString('en-US', {
          timeZone: 'America/New_York',
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
        })
      : 'Time TBD';
    const loc = e.location ? ` · 📍 ${e.location}` : '';
    return `**${e.title}** — ${e.dkp_reward} DKP\n📅 ${when}${loc}\nID: \`${e.id}\``;
  });

  return interaction.editReply(`**Open Events**\n\n${lines.join('\n\n')}`);
}

// ──────────────────────────────────────────────
// /event certify
// ──────────────────────────────────────────────
async function handleCertify(interaction) {
  await interaction.deferReply({ ephemeral: true });
  if (!isOfficer(interaction)) return interaction.editReply('Officer role required.');

  const eventId  = interaction.options.getString('event_id');
  const onlyUser = interaction.options.getUser('only');
  const override = interaction.options.getBoolean('override') ?? false;

  const { data: evt } = await db
    .from('events').select('id, title, course_code').eq('id', eventId).maybeSingle();
  if (!evt) return interaction.editReply('Event not found.');
  if (!evt.course_code) return interaction.editReply(
    `**${evt.title}** has no course linked. Use \`/cert award\` directly, ` +
    `or set a course on the event first.`
  );

  // Determine recipients
  let memberIds;
  if (onlyUser) {
    // Verify they actually attended
    const { data: att } = await db
      .from('attendance').select('member_id').eq('event_id', eventId)
      .eq('member_id', onlyUser.id).eq('attended', true).maybeSingle();
    if (!att) return interaction.editReply(
      `${onlyUser.username} isn't marked as attended for **${evt.title}**.`
    );
    memberIds = [onlyUser.id];
  } else {
    const { data: rows } = await db
      .from('attendance').select('member_id').eq('event_id', eventId).eq('attended', true);
    memberIds = (rows ?? []).map(r => r.member_id);
  }

  if (memberIds.length === 0) {
    return interaction.editReply(`No attendees found for **${evt.title}**.`);
  }

  const result = await awardCertsToAttendees({
    eventId,
    courseCode: evt.course_code,
    memberIds,
    awardedBy: interaction.user.id,
    override,
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
