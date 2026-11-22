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
