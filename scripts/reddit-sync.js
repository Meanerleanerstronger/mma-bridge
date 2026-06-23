#!/usr/bin/env node
/**
 * reddit-sync.js — Fetch hot posts from r/ufc and write to data/reddit.json
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data', 'reddit.json');

async function run() {
  const res = await fetch('https://www.reddit.com/r/ufc/hot.json?limit=15&t=day', {
    headers: {
      'User-Agent': 'mmabridge-bot/1.0 (github.com/mmabridge)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Reddit HTTP ${res.status}`);
  const data = await res.json();

  const posts = (data?.data?.children || [])
    .filter(c => c.kind === 't3' && !c.data.stickied && !c.data.pinned)
    .slice(0, 8)
    .map(c => ({
      title:    c.data.title,
      url:      `https://reddit.com${c.data.permalink}`,
      score:    c.data.score,
      comments: c.data.num_comments,
      flair:    c.data.link_flair_text || '',
      created:  c.data.created_utc,
    }));

  fs.writeFileSync(OUT, JSON.stringify(posts, null, 2));
  console.log(`✅ Reddit: wrote ${posts.length} posts to data/reddit.json`);
}

run().catch(e => { console.error('Reddit sync failed:', e.message); process.exit(1); });
