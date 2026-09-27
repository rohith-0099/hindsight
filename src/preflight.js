// Startup check, imported for its side effect before anything else in app.js.
// Fails early with a readable message instead of a Bolt/Groq stack trace.
import { missingEnv } from './config.js';

const missing = missingEnv();
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill them in — see docs/configuration.md');
  process.exit(1);
}
