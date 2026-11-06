# Temporal report demo

A small live demo of [Temporal](https://temporal.io) durable execution, in Node + TypeScript.

A weekly report is built in several steps:

1. Three services (sales, support, engineering) each add a section, by calling a local mock API.
2. An "AI" step summarizes everything. It is simulated: no external API, no key needed.
3. The last step writes the report to `output/<id>.md`.

The steps have short pauses on purpose, so the audience can follow along.

## Setup

You need Node 18+ and the [Temporal CLI](https://docs.temporal.io/cli) (`brew install temporal` on macOS).

```bash
npm install
```

## Run it (4 terminals)

```bash
temporal server start-dev   # 1. Temporal server, Web UI at http://localhost:8233
npm run api                 # 2. mock API on port 4000 (/support starts broken)
npm run worker              # 3. the worker that runs the workflow and activities
npm start                   # 4. start a report (optional id: npm start -- report-42)
```

### Optional: control panel

```bash
npm run panel               # http://localhost:3000
```

A small web page with buttons to start a report (with or without approval), break or fix each mock API endpoint, and approve reports that are waiting. It also lists recent runs with a link to each one in the Web UI. It uses a Temporal Query (`waitingForApproval`) to know when to show the Approve button.

## Demo script

### 1. A flaky service

The mock API starts with `/support` returning HTTP 503.

- Run `npm start`. Sales succeeds, then support fails.
- The worker log shows the support call failing again and again. There is no retry loop in the code: the workflow declares a retry policy (2s to 6s between attempts, no attempt limit).
- In the Web UI, open the workflow: it is still running, and the pending activity shows the attempt count and the last failure.
- Fix the endpoint:

  ```bash
  curl -X POST localhost:4000/chaos/support/off
  ```

- The next retry succeeds, the flow continues with engineering, the AI summary and the file in `output/`.

You can break or fix any endpoint with `/chaos/<sales|support|engineering>/<on|off>`, and `BROKEN= npm run api` starts everything healthy.

### 2. A crashed worker

- Start everything healthy (`curl -X POST localhost:4000/chaos/support/off`) and run `npm start`.
- While a step is running (say, engineering), press Ctrl+C in the worker terminal. The worker dies on the spot, like a crash.
- Start the worker again with `npm run worker`.
- The steps that already finished are **not** run again: their results are in the workflow history. The step that was cut off runs again once its 15 second timeout expires, and the flow finishes.

Note: the SDK normally catches Ctrl+C and shuts down gracefully, letting running activities finish. `src/worker.ts` turns that off so Ctrl+C behaves like a real crash.

### 3. Signals: human approval

```bash
REQUIRE_APPROVAL=1 npm start -- report-42
```

After the AI summary, the workflow waits for an `approve` signal before writing the file. It can wait seconds or weeks without holding a thread. Approve it from another terminal:

```bash
npm run approve -- report-42
```

## Files

- `src/workflows.ts`: the workflow (the order of steps, retry policy, approval signal)
- `src/activities.ts`: the steps themselves (API calls, the simulated AI summary, writing the file)
- `src/worker.ts`: runs the workflow and activities
- `src/client.ts`: starts a report
- `src/approve.ts`: sends the approval signal
- `src/mock-api.ts`: the local mock API with the chaos switches
- `src/panel.ts`: the optional control panel
