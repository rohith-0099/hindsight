import 'dotenv/config';
import { WebClient } from '@slack/web-api';
import { saveDecision } from '../src/db.js';

// Seeds realistic fake team history into channels the bot is already in.
//   Usage: node scripts/seed.js [channel1 channel2 ...]
//   Defaults to: architecture product engineering
// Posts each message under a distinct persona (display name + avatar) via
// chat.postMessage username/icon_emoji — REQUIRES the bot's chat:write.customize
// scope. Create the channels yourself and /invite @Hindsight first.

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error('Missing SLACK_BOT_TOKEN in .env');
  process.exit(1);
}
const web = new WebClient(token);

const wantedNames = process.argv.slice(2).length
  ? process.argv.slice(2).map((s) => s.replace(/^#/, ''))
  : ['architecture', 'product', 'engineering'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Personas — posted via chat:write.customize (distinct display name + avatar).
const PERSONAS = {
  priya: { username: 'Priya – Backend', icon_emoji: ':woman-technologist:' },
  arjun: { username: 'Arjun – Frontend', icon_emoji: ':man-artist:' },
  sara: { username: 'Sara – PM', icon_emoji: ':woman-office-worker:' },
  dev: { username: 'Dev – DevOps', icon_emoji: ':gear:' },
};

// Each decision plays out as a short debate: proposal → pushback → resolution.
// who = persona key · text = message body · d = true captures it as a decision.
const SCENES = {
  architecture: [
    { who: 'priya', text: 'Kicking off the core datastore decision — Postgres vs MongoDB. Our data is deeply relational: orders, users, invoices, joins everywhere.' },
    { who: 'dev', text: 'Mongo would be easier to shard later though, and schema changes are painless. Worth weighing before we lock in.' },
    { who: 'arjun', text: 'From the frontend, all I care about is consistent reads. Half-written orders showing up would wreck the UI. Relational integrity matters more to us than sharding right now.' },
    { who: 'priya', text: 'Decision: we are going with *PostgreSQL* as the main database. Relational integrity, transactions, and mature tooling beat MongoDB for our joined workload. We can revisit sharding with Citus if scale demands it.', d: true },
    { who: 'sara', text: 'Works for me — stability over cleverness this quarter. Postgres it is.' },
    { who: 'priya', text: 'Next: API auth. Proposal is short-TTL JWT access tokens plus refresh tokens, no server-side sessions.' },
    { who: 'dev', text: 'Refresh-token rotation is fiddly to get right — revocation on logout is the tricky part. But stateless scales better than a session store, so I am on board.' },
    { who: 'priya', text: 'Decision: API auth standard is *JWT access tokens (short TTL) + rotating refresh tokens*. No server-side sessions; revocation via a refresh-token denylist.', d: true },
  ],
  product: [
    { who: 'sara', text: 'Q3 roadmap — we can only ship one headline well: mobile app or the web dashboard. Which leads?' },
    { who: 'arjun', text: 'Dashboard is closer to done on my side, but honestly our analytics say 70% of sessions are mobile web already.' },
    { who: 'sara', text: 'That data settles it. Decision: Q3 we ship the *mobile app first*; the web dashboard slips to Q4. That is where our users actually are.', d: true },
    { who: 'arjun', text: 'Cool — I will refocus on the mobile flows and park the dashboard polish.' },
    { who: 'sara', text: 'One more: several folks asked about a public API. Proposal is to hold off this year.' },
    { who: 'dev', text: 'Agreed — a public API means versioning, rate limits, and support load we cannot staff yet. Internal-only keeps us fast.' },
    { who: 'sara', text: 'Decision: we are *not* building a public API this year — internal-only. Revisit next year once the core product is stable.', d: true },
  ],
  engineering: [
    { who: 'priya', text: 'We keep reinventing service scaffolding in different langs. Proposal: standardize new backend services on Go.' },
    { who: 'arjun', text: 'Most of us know TypeScript better — Node would ramp faster for the frontend-leaning folks.' },
    { who: 'dev', text: 'Ops-wise Go wins though: single static binary, tiny containers, no runtime to babysit. Cheaper to deploy and run.' },
    { who: 'priya', text: 'Decision: standard backend language is *Go*. New services in Go unless there is a strong, written reason otherwise. TS stays for frontend.', d: true },
    { who: 'dev', text: 'On releases — CI flaked on main three times today. Proposal: a fixed daily deploy window instead of ad-hoc pushes.' },
    { who: 'arjun', text: 'As long as hotfixes can still go out same-day, a predictable window is fine by me.' },
    { who: 'dev', text: 'Decision: we deploy *once a day at 10am*, hotfixes excepted. *No Friday deploys* — no weekend firefighting.', d: true },
  ],
};

async function resolveChannels() {
  const map = new Map();
  let cursor;
  do {
    const res = await web.users.conversations({
      types: 'public_channel',
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    for (const c of res.channels || []) map.set(c.name, c.id);
    cursor = res.response_metadata?.next_cursor || '';
  } while (cursor);
  return map;
}

async function run() {
  const channelMap = await resolveChannels();

  const targets = wantedNames.filter((n) => channelMap.has(n));
  const missing = wantedNames.filter((n) => !channelMap.has(n));
  if (missing.length) {
    console.warn(
      `⚠️  Bot is not in these channels (create them + /invite @Hindsight): ${missing.map((m) => '#' + m).join(', ')}`,
    );
  }
  if (targets.length === 0) {
    console.error('No target channels found. Create the channels, invite the bot, then re-run.');
    process.exit(1);
  }

  let posted = 0;
  let captured = 0;

  for (const name of targets) {
    const channel = channelMap.get(name);
    console.log(`\n📨 Seeding #${name} (${channel})`);
    for (const item of SCENES[name]) {
      const persona = PERSONAS[item.who];
      const res = await web.chat.postMessage({
        channel,
        text: item.text,
        username: persona.username,
        icon_emoji: persona.icon_emoji,
      });
      posted += 1;
      await sleep(250);

      if (item.d) {
        const perm = await web.chat
          .getPermalink({ channel, message_ts: res.ts })
          .then((p) => p.permalink)
          .catch(() => null);
        saveDecision({
          text: item.text,
          author_id: null,
          author_name: persona.username,
          channel_id: channel,
          channel_name: name,
          message_ts: res.ts,
          permalink: perm,
          captured_by: 'seed script',
        });
        captured += 1;
        console.log(`   ✅ captured decision: ${item.text.slice(0, 60)}…`);
      }
    }
  }

  console.log(`\n✨ Done. Posted ${posted} messages, pre-loaded ${captured} decisions into the ledger.`);
  console.log('\n🎬 LIVE DEMO — plantable contradiction:');
  const archPresent = targets.includes('architecture');
  console.log(
    archPresent
      ? '   In #architecture, post this to trigger the Guardian on the Postgres decision:\n' +
          '   "Hey team, I think we should migrate the main database from Postgres to MongoDB for the new analytics work."'
      : '   Post a message reversing one of the seeded decisions in a seeded channel to trigger the Guardian.',
  );
  console.log('\n   Then run /decisions or open the App Home to show the ledger, and');
  console.log('   @Hindsight what database did we choose?  → cited recall card.');
  process.exit(0);
}

run().catch((e) => {
  console.error('Seed failed:', e.data?.error || e.message);
  process.exit(1);
});
