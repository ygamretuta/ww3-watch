# WW3 Watch

A live dashboard of conflict-escalation and de-escalation signals, built on public news feeds.
Dark side: flashpoints, a countdown, alerts, a daily briefing. Light side: ceasefires, aid, releases
and recovery news that push the countdown back. It is a heuristic, not a forecast.

TypeScript 7 end to end: the server runs `.ts` directly on Node, and the browser code is compiled to ES modules.

## Run

```bash
npm install
npm start          # builds the browser code, then serves http://localhost:3000
```

Needs Node 24 or newer (Node strips the types from the server files, so there is no server build step).

| Command | What it does |
| --- | --- |
| `npm start` | build the browser code, then run the server |
| `npm run build` | compile `src/client` + `src/shared` to `public/js/` |
| `npm run typecheck` | typecheck server and client (`tsc`, TypeScript 7) |
| `npm run dev` | rebuild the browser code on change and restart the server on change |

## Layout

```
src/shared/   types.ts (the API payload), model.ts (scoring model, used by both sides)
src/server/   server, feeds, scoring, classifier, alerts, briefing, data stores
src/client/   browser modules (main.ts is the dashboard, flashpoint.ts the detail page)
public/       index.html, flashpoint.html, style.css, js/ (build output)
data/         history, events, alerts, caches (created at runtime)
```

## Configuration (environment or a `.env` file)

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | an AI model rates headlines and writes the daily briefing; without it, keywords and a template are used |
| `WW3_MODEL`, `WW3_BRIEFING_MODEL` | model overrides (defaults `claude-haiku-5-5`, `claude-sonnet-5-5`) |
| `ALERT_WEBHOOK_URL`, `PUBLIC_URL` | push alerts and the daily briefing to a Slack/Discord/ntfy-style webhook |
| `PORT` | default 3000 |
