# AI Voice Detector MVP

Free AI voice detector MVP with a browser UI and a small Node backend.

## Run locally

```bash
npm start
```

Open `http://localhost:8787`.

## Provider setup

The app works in mock mode until a real provider is configured.

```bash
cp .env.example .env
```

Set these values on the server:

```env
MODULATE_API_KEY=your_server_side_key
MODULATE_API_URL=https://modulate-developer-apis.com/api/velma-2-synthetic-voice-detection-batch
SESSION_SECRET=generate_a_long_random_secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PRO_MONTHLY_LIMIT=50
CREEM_API_KEY=your_creem_api_key
CREEM_API_BASE_URL=https://api.creem.io
CREEM_WEBHOOK_SECRET=your_creem_webhook_secret
CREEM_PRO_PRODUCT_ID=prod_12r7OKEp2EKXmH8Hsyz5oN
CREEM_CREDITS_PRODUCT_ID=your_one_time_credit_pack_product_id
CREDIT_PACK_CHECKS=20
CREDIT_PACK_PRICE_USD=4.99
```

Do not put `MODULATE_API_KEY` in `public/app.js` or any frontend file.
Do not put `SUPABASE_SERVICE_ROLE_KEY` in frontend files either.

## Supabase users table

Run these SQL files in the Supabase SQL Editor, in order, before testing paid access:

1. `supabase-schema.sql`
2. `supabase-credits.sql`
3. `supabase-pro-monthly.sql`

The first file creates account, subscription, daily quota, and analytics storage. The next two add permanent credit packs and the Pro monthly allowance. Google login works without Supabase, but users, paid access, and persistent quotas require these tables and RPC functions.

## Optional Google login

Users can still detect audio without logging in. Google login only adds account identity and a higher free daily quota.

Create an OAuth 2.0 Web Client in Google Cloud Console, then add this authorized redirect URI:

```text
http://localhost:8787/auth/google/callback
```

Set these values in `.env`:

```env
APP_BASE_URL=http://localhost:8787
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
SESSION_SECRET=generate_a_long_random_secret
AUTH_DAILY_LIMIT=3
PRO_MONTHLY_LIMIT=50
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

When deploying, change `APP_BASE_URL` and the Google redirect URI to your production domain, for example:

```text
https://voiceaichecker.com/auth/google/callback
```

## Free-use controls

Defaults are in `.env.example`:

- `MAX_FILE_MB=10`
- `MAX_ANALYZE_SECONDS=30`
- `DAILY_IP_LIMIT=1`
- `AUTH_DAILY_LIMIT=3`
- `PRO_MONTHLY_LIMIT=50`

The backend also keeps an in-memory hash cache, so repeated uploads of the same file and analyze window do not call the provider again.

The current MVP converts supported browser uploads to a short PCM WAV sample before sending it to the server. The server only accepts WAV and trims the sample again before calling the provider.

For broader production support, add FFmpeg or a managed media service so the backend can also decode and trim MP3, M4A, MP4, and WebM files without relying on browser-side conversion.

## Deploy to Vercel

The project includes Vercel serverless functions in `api/` and static pages in `public/`.

Set these environment variables in Vercel:

```env
APP_BASE_URL=https://voiceaichecker.com
MODULATE_API_KEY=your_modulate_key
MODULATE_API_URL=https://modulate-developer-apis.com/api/velma-2-synthetic-voice-detection-batch
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
SESSION_SECRET=generate_a_long_random_secret
MAX_FILE_MB=3
MAX_ANALYZE_SECONDS=30
DAILY_IP_LIMIT=1
AUTH_DAILY_LIMIT=3
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PRO_MONTHLY_LIMIT=50
CREEM_API_KEY=your_creem_api_key
CREEM_API_BASE_URL=https://api.creem.io
CREEM_WEBHOOK_SECRET=your_creem_webhook_secret
CREEM_PRO_PRODUCT_ID=prod_12r7OKEp2EKXmH8Hsyz5oN
CREEM_CREDITS_PRODUCT_ID=your_one_time_credit_pack_product_id
CREDIT_PACK_CHECKS=20
CREDIT_PACK_PRICE_USD=4.99
```

In Google Cloud, add the production redirect URI:

```text
https://voiceaichecker.com/auth/google/callback
```

For local development, keep:

```text
http://localhost:8787/auth/google/callback
```

In Creem, set the production webhook URL to:

```text
https://voiceaichecker.com/webhook
```

## Files

- `server.js`: static file server and `/api/detect`
- `src/auth.js`: Google OAuth login and in-memory sessions
- `src/supabase.js`: Supabase REST users, subscriptions, daily quotas, Pro monthly checks, and permanent credits
- `src/audio.js`: WAV validation and server-side trimming
- `src/provider.js`: mock detector and provider adapter
- `src/config.js`: limits and environment configuration
- `public/index.html`: MVP UI
- `public/privacy/index.html`: privacy policy
- `public/terms/index.html`: terms of use
- `public/app.js`: upload, recording, waveform, and API calls
- `public/styles.css`: responsive interface styles
