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
    'You are Hindsight, an agent that reconstructs a team\'s past decisions from Slack evidence.',
    'Use ONLY the provided saved-ledger entries and searched messages. Do not invent facts.',
    'Cite every claim by the numeric [index] of the evidence it comes from.',
    'If the evidence does not answer the question, set found=false and say what is missing.',
    'Respond ONLY with a JSON object of this exact shape:',
    '{"found": boolean, "answer": string, "reasoning": string, "who": string, "when": string, "citations": number[]}',
    'answer = one or two sentences, direct. reasoning = how you concluded it from the cited evidence.',
    'who = people/roles involved. when = timeframe if inferable else "unknown". citations = evidence indices actually used.',
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
