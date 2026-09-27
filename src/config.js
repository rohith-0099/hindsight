// Environment-driven settings, read once at startup.
import 'dotenv/config';

export const REQUIRED_ENV = ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'GROQ_API_KEY'];

export function loadConfig(env = process.env) {
  return {
    slackBotToken: env.SLACK_BOT_TOKEN,
    slackAppToken: env.SLACK_APP_TOKEN,
    groqApiKey: env.GROQ_API_KEY,
    groqModel: env.GROQ_MODEL || 'openai/gpt-oss-120b',
    dbPath: env.DB_PATH || 'data/hindsight.sqlite',
    // AUTO-CAPTURE: one env flag to disable the whole feature (default on).
    autocapture: (env.AUTOCAPTURE || 'on').toLowerCase() !== 'off',
    guardianMinConfidence: 0.85, // conservative: prefer misses over false positives
    autocaptureMinConfidence: 0.8, // only prompt on high-confidence decisions
  };
}

// Names of required variables that are unset or empty.
export function missingEnv(env = process.env) {
  return REQUIRED_ENV.filter((name) => !env[name] || !env[name].trim());
}

export const config = loadConfig();
