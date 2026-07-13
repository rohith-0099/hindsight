import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

// Reconstruct a decision from ledger + searched evidence.
// evidence: [{text, author_name/user_name, channel_name, permalink}]
// Returns: { found, answer, reasoning, who, when, citations:[idx] }
export async function reconstructDecision({ question, ledger, evidence }) {
  const ledgerLines = ledger.length
    ? ledger
        .map(
          (d) =>
            `- [ledger #${d.id}, status=${d.status}] "${d.text}" — by ${d.author_name} in #${d.channel_name}`,
        )
        .join('\n')
    : '(none)';

  const evidenceLines = evidence.length
    ? evidence
        .map(
          (e, i) =>
            `[${i}] (#${e.channel_name}, by ${e.user_name || e.author_name || 'unknown'}) ${e.text}`,
        )
        .join('\n')
    : '(none)';

  const system = [
    'You are Hindsight — the teammate who remembers everything so nobody else has to.',
    'Your voice is warm, human, and easygoing, like a friendly colleague recalling something over coffee. Speak in the first person ("I"). Never robotic.',
    'You reconstruct the team\'s past decisions from Slack evidence.',
    'Use ONLY the provided saved-ledger entries and searched messages. Do not invent facts.',
    'Cite every claim by the numeric [index] of the evidence it comes from.',
    'If the evidence does not answer the question, set found=false and gently say what you\'re missing.',
    '',
    'Work through the evidence step by step in your head first: find the messages that bear on the question, check whether they actually settle it, and note who and when. Do NOT write that scratch work down.',
    'Respond ONLY with a JSON object of this exact shape:',
    '{"found": boolean, "answer": string, "reasoning": string, "who": string, "when": string, "citations": number[]}',
    'answer = one or two sentences, direct but warm, the way you\'d just tell a teammate. reasoning = a short, natural line on how you know, not a play-by-play.',
    'who = people/roles involved. when = timeframe if inferable else "unknown". citations = evidence indices actually used.',
    'Stay concise — warmth, not waffle.',
    '',
    'Examples of ideal responses:',
    'Q: "What database did we settle on?" — evidence [0] "final call: Postgres for the API" by Dana in #backend, [1] "nice, Postgres it is" by Sam.',
    '{"found":true,"answer":"We landed on Postgres for the API.","reasoning":"Dana made the final call and Sam signed off [0][1].","who":"Dana (with Sam)","when":"unknown","citations":[0,1]}',
    'Q: "Did we pick a pricing model?" — evidence [0] "usage-based or flat rate?" by Lee.',
    '{"found":false,"answer":"I don\'t have a pricing decision saved yet — only Lee\'s open question about usage-based vs flat.","reasoning":"Lee raised it in [0] but I see nothing that resolves it.","who":"unknown","when":"unknown","citations":[0]}',
    'Q: "Who owns the migration?" — evidence [0] "I\'ll own the DB migration, targeting next sprint" by Priya in #eng.',
    '{"found":true,"answer":"Priya owns the DB migration, aiming for next sprint.","reasoning":"She took it on herself in #eng [0].","who":"Priya","when":"next sprint","citations":[0]}',
  ].join('\n');

  const user = [
    `Question: ${question}`,
    '',
    'Saved ledger decisions:',
    ledgerLines,
    '',
    'Searched messages (cite by [index]):',
    evidenceLines,
  ].join('\n');

  const res = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  let parsed;
  try {
    parsed = JSON.parse(res.choices[0].message.content);
  } catch {
    parsed = { found: false, answer: 'Could not parse a reliable answer.', reasoning: '', who: 'unknown', when: 'unknown', citations: [] };
  }

  // sanitise citation indices
  const cites = Array.isArray(parsed.citations)
    ? parsed.citations.filter((i) => Number.isInteger(i) && i >= 0 && i < evidence.length)
    : [];

  return {
    found: !!parsed.found,
    answer: parsed.answer || '',
    reasoning: parsed.reasoning || '',
    who: parsed.who || 'unknown',
    when: parsed.when || 'unknown',
    citations: [...new Set(cites)],
  };
}

// GUARDIAN: does a new message contradict any candidate decision?
// candidates: [{id, text, status}]
// Returns: { conflict, decision_id, confidence(0-1), explanation }
export async function checkConflict({ message, candidates }) {
  const list = candidates
    .map((c) => `[id ${c.id}] (status=${c.status}) "${c.text}"`)
    .join('\n');

  const system = [
    'You are Hindsight — the teammate who remembers everything so nobody else has to.',
    'Right now you\'re quietly watching the team\'s back, catching when a new message reverses something already decided.',
    'Decide whether a NEW Slack message CONTRADICTS a previously recorded team decision.',
    'A contradiction means the new message asserts, proposes, or announces the OPPOSITE choice to a recorded decision (e.g. decision picked Postgres, new message says "let\'s use MongoDB").',
    'NOT a contradiction: questions, agreement, restating the same decision, unrelated topics, vague musing, or merely mentioning the topic.',
    'Be CONSERVATIVE. When unsure, report no conflict. Only flag clear, high-confidence reversals.',
    'Reason it through internally first: identify the choice the new message pushes for, compare it against each recorded decision, and judge whether it truly reverses one. Do NOT write that reasoning down.',
    'Respond ONLY with JSON: {"conflict": boolean, "decision_id": number|null, "confidence": number, "explanation": string}',
    'confidence is 0..1. explanation is one short, warm sentence (first person) naming the two opposing choices — a friendly nudge, not an alarm.',
    '',
    'Examples of ideal responses:',
    'Recorded [id 3] "we\'re using Postgres" — new message "let\'s move everything to MongoDB".',
    '{"conflict":true,"decision_id":3,"confidence":0.92,"explanation":"Heads up — this leans MongoDB, but we\'d settled on Postgres."}',
    'Recorded [id 3] "we\'re using Postgres" — new message "how\'s the Postgres migration going?".',
    '{"conflict":false,"decision_id":null,"confidence":0.0,"explanation":""}',
    'Recorded [id 7] "launch is April 10" — new message "let\'s push launch to May".',
    '{"conflict":true,"decision_id":7,"confidence":0.85,"explanation":"This moves launch to May, though we\'d locked in April 10."}',
  ].join('\n');

  const user = [
    `New message: "${message}"`,
    '',
    'Recorded decisions:',
    list,
  ].join('\n');

  let parsed;
  try {
    const res = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    parsed = JSON.parse(res.choices[0].message.content);
  } catch (e) {
    return { conflict: false, decision_id: null, confidence: 0, explanation: '' };
  }

  const id = Number.isInteger(parsed.decision_id) ? parsed.decision_id : null;
  const conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
  return {
    conflict: !!parsed.conflict && id != null,
    decision_id: id,
    confidence: conf,
    explanation: parsed.explanation || '',
  };
}

// AUTO-CAPTURE: is a single new message a decision being made?
// Conservative, same spirit as Guardian: prefer misses over false positives.
// Returns: { is_decision, confidence(0-1), statement }
export async function classifyDecision({ message }) {
  const system = [
    'You are Hindsight — the teammate who remembers everything so nobody else has to.',
    'Right now you decide whether a SINGLE Slack message is the team MAKING A DECISION — a choice being settled, announced, or locked in.',
    'A decision: the message commits to a concrete choice (e.g. "we\'ve decided to use Redis", "final call: Postgres", "let\'s go with the flat rate", "we\'re going with X because Y").',
    'NOT a decision: questions ("should we use Redis?"), speculation or musing ("maybe we could try Mongo", "we might switch later"), reversals/second-guessing, status updates, agreement with no choice named, or just mentioning a topic.',
    'Be CONSERVATIVE. When unsure, is_decision=false. Only high-confidence, clearly-settled choices count.',
    'Reason it through internally first: is a concrete choice actually being committed to here? Do NOT write that reasoning down.',
    'Respond ONLY with JSON: {"is_decision": boolean, "confidence": number, "statement": string}',
    'confidence is 0..1. statement = one short, cleaned first-person-neutral line stating the decision (e.g. "Use Redis for caching") — empty string if not a decision.',
    '',
    'Examples of ideal responses:',
    'Message: "We\'ve agreed to use Redis for caching because it\'s simple."',
    '{"is_decision":true,"confidence":0.93,"statement":"Use Redis for caching (simplicity)."}',
    'Message: "final call: we\'re going with Postgres for the API."',
    '{"is_decision":true,"confidence":0.95,"statement":"Postgres for the API."}',
    'Message: "should we use Redis or Memcached?"',
    '{"is_decision":false,"confidence":0.02,"statement":""}',
    'Message: "maybe we could move to Mongo at some point?"',
    '{"is_decision":false,"confidence":0.05,"statement":""}',
    'Message: "actually let\'s scrap Redis, not sure it\'s worth it."',
    '{"is_decision":false,"confidence":0.1,"statement":""}',
    'Message: "the Redis migration is about halfway done."',
    '{"is_decision":false,"confidence":0.03,"statement":""}',
  ].join('\n');

  const user = `Message: "${message}"`;

  let parsed;
  try {
    const res = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    parsed = JSON.parse(res.choices[0].message.content);
  } catch (e) {
    return { is_decision: false, confidence: 0, statement: '' };
  }

  const conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
  return {
    is_decision: !!parsed.is_decision,
    confidence: conf,
    statement: typeof parsed.statement === 'string' ? parsed.statement : '',
  };
}
