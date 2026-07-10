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
import { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } from 'discord.js';
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

    if (req.method !== 'POST' || req.url !== '/api/create-discord-event') {
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

    const { event_id, title, description, location, scheduled_start_time, scheduled_end_time } = body;
    if (!event_id || !title || !scheduled_start_time) {
      respond(res, 400, { error: 'Missing required fields: event_id, title, scheduled_start_time' }); return;
    }

    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);

      // External events require an end time and a location string
      const startTime = new Date(scheduled_start_time);
      const endTime   = scheduled_end_time
        ? new Date(scheduled_end_time)
        : new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // default +2h

      const discordEvent = await guild.scheduledEvents.create({
        name:              title,
        description:       description || undefined,
        scheduledStartTime: startTime,
        scheduledEndTime:   endTime,
        entityType:        GuildScheduledEventEntityType.External,
        entityMetadata:    { location: location || 'TBD' },
        privacyLevel:      GuildScheduledEventPrivacyLevel.GuildOnly,
      });

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
