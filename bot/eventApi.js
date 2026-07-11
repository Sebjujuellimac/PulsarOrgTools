// ============================================================
// PULSAR ORG TOOLS — Bot HTTP API
//
// Exposes a minimal HTTP server so the web dashboard can request
// Discord Scheduled Event creation. Railway routes traffic to
// process.env.PORT automatically when the service has a public domain.
//
// Endpoint: POST /api/create-discord-event
//   Headers: Authorization: Bearer <BOT_EVENT_SECRET>
//   Body (JSON): { event_id, title, description, location,
//                  scheduled_start_time, scheduled_end_time }
//   Returns: { discord_event_id } | { error }
// ============================================================

import { createServer } from 'http';
import { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, ChannelType } from 'discord.js';
import { db } from './db.js';

const SECRET = process.env.BOT_EVENT_SECRET;

function respond(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

export function startEventApi(client) {
  const port = process.env.PORT || 3001;

  const server = createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') { respond(res, 204, {}); return; }

    const route = req.url;
    if (req.method !== 'POST' ||
        (route !== '/api/create-discord-event' &&
         route !== '/api/delete-discord-event' &&
         route !== '/api/voice-channels')) {
      respond(res, 404, { error: 'Not found' }); return;
    }

    // Auth
    const auth = req.headers['authorization'] || '';
    if (!SECRET || auth !== `Bearer ${SECRET}`) {
      respond(res, 401, { error: 'Unauthorized' }); return;
    }

    // Parse body
    let body;
    try {
      const raw = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', c => data += c);
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      body = JSON.parse(raw);
    } catch {
      respond(res, 400, { error: 'Invalid JSON' }); return;
    }

    // ── List guild voice channels ─────────────────────────────────────────────
    if (route === '/api/voice-channels') {
      try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const channels = await guild.channels.fetch();
        const voice = [...channels.values()]
          .filter(c => c && c.type === ChannelType.GuildVoice)
          .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
          .map(c => ({ id: c.id, name: c.name }));
        respond(res, 200, { channels: voice });
      } catch (err) {
        console.error('eventApi voice-channels error:', err);
        respond(res, 500, { error: err.message || String(err) });
      }
      return;
    }

    // ── Delete a Discord Scheduled Event ──────────────────────────────────────
    if (route === '/api/delete-discord-event') {
      const { discord_event_id } = body;
      if (!discord_event_id) {
        respond(res, 400, { error: 'Missing required field: discord_event_id' }); return;
      }
      try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        await guild.scheduledEvents.delete(discord_event_id);
        respond(res, 200, { deleted: true });
      } catch (err) {
        // If it's already gone, treat as success so the DB delete still proceeds
        if (err?.code === 10070 /* Unknown Guild Scheduled Event */) {
          respond(res, 200, { deleted: true, note: 'already gone' }); return;
        }
        console.error('eventApi delete-discord-event error:', err);
        respond(res, 500, { error: err.message || String(err) });
      }
      return;
    }

    // ── Create a Discord Scheduled Event ──────────────────────────────────────
    const { event_id, title, description, location, voice_channel_id,
            scheduled_start_time, scheduled_end_time } = body;
    if (!event_id || !title || !scheduled_start_time) {
      respond(res, 400, { error: 'Missing required fields: event_id, title, scheduled_start_time' }); return;
    }

    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);

      const startTime = new Date(scheduled_start_time);
      const endTime   = scheduled_end_time
        ? new Date(scheduled_end_time)
        : new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // default +2h

      // If a voice channel is chosen, make a Voice event tied to it (Discord
      // shows attendees who join). Otherwise an External event with a location.
      const base = {
        name:               title,
        description:        description || undefined,
        scheduledStartTime: startTime,
        scheduledEndTime:   endTime,
        privacyLevel:       GuildScheduledEventPrivacyLevel.GuildOnly,
      };
      const options = voice_channel_id
        ? { ...base, entityType: GuildScheduledEventEntityType.Voice, channel: voice_channel_id }
        : { ...base, entityType: GuildScheduledEventEntityType.External, entityMetadata: { location: location || 'TBD' } };

      const discordEvent = await guild.scheduledEvents.create(options);

      // Write discord_event_id back to the DB row
      await db.from('events').update({ discord_event_id: discordEvent.id }).eq('id', event_id);

      respond(res, 200, { discord_event_id: discordEvent.id });
    } catch (err) {
      console.error('eventApi create-discord-event error:', err);
      respond(res, 500, { error: err.message || String(err) });
    }
  });

  server.listen(port, () => console.log(`eventApi listening on port ${port}`));
}
