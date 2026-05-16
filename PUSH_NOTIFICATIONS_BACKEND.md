# Browser Push Notifications — Backend Setup

## 1. Install the web-push package on your backend

```bash
npm install web-push node-cron
```

## 2. Create the Supabase tables

Run these SQL statements in your Supabase dashboard → SQL Editor:

```sql
-- Stores each browser's push subscription
CREATE TABLE push_subscriptions (
  browser_id        TEXT PRIMARY KEY,
  user_id           UUID REFERENCES auth.users ON DELETE SET NULL,
  endpoint          TEXT NOT NULL,
  p256dh            TEXT NOT NULL,
  auth              TEXT NOT NULL,
  fav_fighter_ids   JSONB,       -- array of fighter id strings
  fav_fighter_names JSONB,       -- array of fighter display names
  updated_at        TIMESTAMPTZ DEFAULT now(),
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Stores which events a browser/user has starred
CREATE TABLE starred_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  browser_id       TEXT NOT NULL,
  user_id          UUID REFERENCES auth.users ON DELETE SET NULL,
  event_id         TEXT NOT NULL,
  event_name       TEXT,
  event_iso_date   TEXT,         -- YYYY-MM-DD
  event_start_time TEXT,         -- ISO timestamp
  notified_week    BOOLEAN DEFAULT FALSE,
  notified_day     BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (browser_id, event_id)
);

-- Enable Row Level Security
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE starred_events     ENABLE ROW LEVEL SECURITY;

-- Policies: anyone can insert/update their own browser_id row
CREATE POLICY "Own subscription" ON push_subscriptions
  USING (true) WITH CHECK (true);   -- tighten this if you add auth checks

CREATE POLICY "Own starred events" ON starred_events
  USING (true) WITH CHECK (true);
```

## 3. Add this file to your backend (e.g. pushNotifications.js)

```javascript
// pushNotifications.js
// Add to your Express server: require('./pushNotifications')(app, supabaseAdminClient)

const webPush = require('web-push');
const cron    = require('node-cron');

// ── VAPID keys (KEEP PRIVATE KEY SECRET — use env vars in production) ─
const VAPID_PUBLIC_KEY  = 'BE2r4AU2Z-g48i3Bjg3CFIsFSBjtktzkR_rV2LQyv7hO2jJCLFrv2FBQ-M_oztS26G3Efrw6CMkpkgYo416Fwb4';
const VAPID_PRIVATE_KEY = 'O-x8dq2i55GVye2eCtgT0WGzsCjDXCrOzo9DjkIFUJU';
const VAPID_EMAIL       = 'mailto:your@email.com';   // ← change this

webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ── Helper: send one notification ──────────────
async function sendPush(sub, payload) {
  const pushSub = {
    endpoint: sub.endpoint,
    keys:     { p256dh: sub.p256dh, auth: sub.auth },
  };
  try {
    await webPush.sendNotification(pushSub, JSON.stringify(payload));
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      return 'expired';   // subscription is gone — caller should clean it up
    }
    console.warn('Push send failed:', err.statusCode, sub.endpoint.slice(-20));
    return false;
  }
}

// ── Cron: check starred events every day at 8am UTC ──
function startCronJobs(sb) {
  cron.schedule('0 8 * * *', () => checkStarredEvents(sb), { timezone: 'UTC' });
  cron.schedule('0 8 * * *', () => checkFavFighterAnnouncements(sb), { timezone: 'UTC' });
  console.log('[Push] Cron jobs started');
}

// ── Check starred events and send 7-day and 1-day notifications ──
async function checkStarredEvents(sb) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Calculate target dates
  const in7  = new Date(today); in7.setDate(in7.getDate() + 7);
  const in1  = new Date(today); in1.setDate(in1.getDate() + 1);

  const iso7 = in7.toISOString().slice(0, 10);
  const iso1 = in1.toISOString().slice(0, 10);

  // Find starred events that haven't been notified yet
  const { data: week } = await sb
    .from('starred_events')
    .select('*, push_subscriptions!inner(endpoint, p256dh, auth)')
    .eq('event_iso_date', iso7)
    .eq('notified_week', false);

  const { data: day } = await sb
    .from('starred_events')
    .select('*, push_subscriptions!inner(endpoint, p256dh, auth)')
    .eq('event_iso_date', iso1)
    .eq('notified_day', false);

  for (const row of (week || [])) {
    const sub = row.push_subscriptions;
    const res = await sendPush(sub, {
      title: `${row.event_name} in 1 week`,
      body:  'Finalize your picks — the event is one week away.',
      url:   `/picks.html?id=${row.event_id}`,
      tag:   `ev-week-${row.event_id}`,
    });
    if (res === true) {
      await sb.from('starred_events').update({ notified_week: true }).eq('id', row.id);
    } else if (res === 'expired') {
      await sb.from('push_subscriptions').delete().eq('browser_id', row.browser_id);
    }
  }

  for (const row of (day || [])) {
    const sub = row.push_subscriptions;
    const res = await sendPush(sub, {
      title: `${row.event_name} is TOMORROW`,
      body:  'Event day is here. Check your picks and enjoy the fights!',
      url:   `/picks.html?id=${row.event_id}`,
      tag:   `ev-day-${row.event_id}`,
      requireInteraction: true,
    });
    if (res === true) {
      await sb.from('starred_events').update({ notified_day: true }).eq('id', row.id);
    } else if (res === 'expired') {
      await sb.from('push_subscriptions').delete().eq('browser_id', row.browser_id);
    }
  }
}

// ── Check fav fighter announcements (call this when you add a new event) ──
async function checkFavFighterAnnouncements(sb, newEventFighters, eventName, eventId) {
  // newEventFighters: array of fighter names from the new event card
  if (!newEventFighters?.length) return;

  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('browser_id, endpoint, p256dh, auth, fav_fighter_names, fav_fighter_ids')
    .not('fav_fighter_ids', 'is', null);

  for (const sub of (subs || [])) {
    let favNames = [];
    try { favNames = JSON.parse(sub.fav_fighter_names || '[]'); } catch {}

    const matched = favNames.find(favName =>
      newEventFighters.some(f => f.toLowerCase().includes(favName.toLowerCase()) || favName.toLowerCase().includes(f.toLowerCase()))
    );

    if (matched) {
      await sendPush(sub, {
        title: `${matched} was just announced!`,
        body:  `${matched} is fighting at ${eventName}. Make your pick now.`,
        url:   `/picks.html?id=${eventId}`,
        tag:   `fav-${sub.browser_id}-${eventId}`,
      });
    }
  }
}

// ── Express routes ───────────────────────────────
module.exports = function registerPushRoutes(app, sb) {
  // Called by the frontend when checking/subscribing for fav fighter announcement alerts
  // (push_subscriptions are saved directly to Supabase from the frontend — no route needed)

  // Manual trigger for testing
  app.post('/api/push/test', async (req, res) => {
    const { browser_id } = req.body;
    const { data: sub } = await sb.from('push_subscriptions')
      .select('*').eq('browser_id', browser_id).single();
    if (!sub) return res.status(404).json({ error: 'Not found' });

    const result = await sendPush(sub, {
      title: 'MMA Bridge test notification',
      body:  'Push notifications are working!',
      url:   '/events.html',
    });
    res.json({ result });
  });

  // Called when you manually add a new event — triggers fav fighter alerts
  app.post('/api/push/announce-fighters', async (req, res) => {
    const { fighters, eventName, eventId } = req.body;
    await checkFavFighterAnnouncements(sb, fighters, eventName, eventId);
    res.json({ ok: true });
  });

  startCronJobs(sb);
};
```

## 4. Wire it into your main server file (server.js / index.js)

```javascript
const registerPushRoutes = require('./pushNotifications');

// After you create your Supabase admin client and Express app:
registerPushRoutes(app, supabaseAdminClient);
```

## 5. Add VAPID_PRIVATE_KEY to Render environment variables

In Render dashboard → your service → Environment:
```
VAPID_PRIVATE_KEY=O-x8dq2i55GVye2eCtgT0WGzsCjDXCrOzo9DjkIFUJU
VAPID_EMAIL=mailto:your@email.com
```

Then in pushNotifications.js change to:
```javascript
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL       = process.env.VAPID_EMAIL;
```

## 6. How fav fighter announcements work

When you add a new event to events.json and want to notify users:

```bash
curl -X POST https://mmabridge-backend.onrender.com/api/push/announce-fighters \
  -H "Content-Type: application/json" \
  -d '{
    "fighters": ["Jon Jones", "Stipe Miocic"],
    "eventName": "UFC 309",
    "eventId": "ufc-309"
  }'
```

The backend will cross-reference this against everyone's `fav_fighter_ids` in Supabase and send push notifications to all matching subscribers automatically.

## How to test locally

1. Run your backend with `node server.js`
2. Open events.html, star an event
3. POST to `http://localhost:5001/api/push/test` with `{ "browser_id": "your-browser-id" }`
   (find your browser_id in localStorage → `mma_browser_id`)
