// Environment-driven settings, read once at startup.
import 'dotenv/config';

export const REQUIRED_ENV = ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'GROQ_API_KEY'];

// Parse a 0..1 confidence threshold, falling back when unset or out of range.
function threshold(value, fallback) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

export function loadConfig(env = process.env) {
  return {
    slackBotToken: env.SLACK_BOT_TOKEN,
    slackAppToken: env.SLACK_APP_TOKEN,
    groqApiKey: env.GROQ_API_KEY,
    groqModel: env.GROQ_MODEL || 'openai/gpt-oss-120b',
    dbPath: env.DB_PATH || 'data/hindsight.sqlite',
    // AUTO-CAPTURE: one env flag to disable the whole feature (default on).
    autocapture: (env.AUTOCAPTURE || 'on').toLowerCase() !== 'off',
    // conservative: prefer misses over false positives
    guardianMinConfidence: threshold(env.GUARDIAN_MIN_CONFIDENCE, 0.85),
    // only prompt on high-confidence decisions
    autocaptureMinConfidence: threshold(env.AUTOCAPTURE_MIN_CONFIDENCE, 0.8),
  };
}

// Names of required variables that are unset or empty.
export function missingEnv(env = process.env) {
  return REQUIRED_ENV.filter((name) => !env[name] || !env[name].trim());
}

export const config = loadConfig();
