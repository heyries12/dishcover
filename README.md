# Dishcover

ASP.NET Core 10 application with an EF Core SQLite database and a responsive HTML/CSS/JavaScript frontend.

## Run

```powershell
dotnet run
```

Open `http://localhost:5122`.

## Test Account

- Email: `demo@dishcover.app`
- Password: `Dishcover123!`

The local database is created automatically as `dishcover.db` on first run.

## Render

The included `render.yaml` and `Dockerfile` deploy the app on Render's free web-service plan. The free filesystem is ephemeral, so SQLite data may reset after restarts or redeploys. Use a paid persistent disk for durable production data.

## Social Sign-In

Google and Apple use real OAuth redirects and automatically create or link a Dishcover account by verified email. Configure these secret environment variables in Render.

Google:

- `Authentication__Google__ClientId`
- `Authentication__Google__ClientSecret`
- Authorized redirect URI: `https://dishcover-odv1.onrender.com/signin-google`

Apple:

- `Authentication__Apple__ClientId` (Services ID)
- `Authentication__Apple__TeamId`
- `Authentication__Apple__KeyId`
- `Authentication__Apple__PrivateKey` (the `.p8` contents; escaped `\n` line breaks are supported)
- Return URL: `https://dishcover-odv1.onrender.com/signin-apple`

Apple Sign In requires an Apple Developer account. If a provider is not configured, its button remains visible with a setup status instead of starting a broken OAuth redirect.
