// Optional .env values stay server-side; defaults allow local preview mode without SMTP setup.
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
import { z } from 'zod';
const env = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().default('127.0.0.1'),
    DATA_DIR: z.string().default('./data'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.email().optional(),
    TEST_EMAIL_TO: z.email().optional(),
  })
  .parse(process.env);
// Fail at startup rather than accepting email requests with incomplete SMTP credentials.
// TEST_EMAIL_TO is optional: the browser now supplies the recipient per send; it is
// kept only as an optional fallback and a default to show in the UI.
if (env.SMTP_HOST && ![env.SMTP_USER, env.SMTP_PASS, env.EMAIL_FROM].every(Boolean))
  throw new Error('SMTP requires SMTP_USER, SMTP_PASS and EMAIL_FROM.');
export default env;
