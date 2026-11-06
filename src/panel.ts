import http from 'node:http';
import { Client, Connection } from '@temporalio/client';
import { API_URL, TASK_QUEUE, TEMPORAL_ADDRESS } from './shared';
import { approveSignal, reportWorkflow, waitingForApprovalQuery } from './workflows';

// A small control panel for the live demo: buttons to start reports, approve them
// and break or fix the mock API, plus a live list of recent runs.

const PORT = Number(process.env.PANEL_PORT ?? 3000);

async function main() {
  const connection = await Connection.connect({ address: TEMPORAL_ADDRESS });
  const client = new Client({ connection });
  let counter = 0;

  async function startReport(requireApproval: boolean) {
    counter += 1;
    const id = `report-${counter}-${Date.now().toString(36)}`;
    await client.workflow.start(reportWorkflow, { taskQueue: TASK_QUEUE, workflowId: id, args: [id, requireApproval] });
    return { id };
  }

  async function listRuns() {
    const runs = [];
    for await (const wf of client.workflow.list({ query: `WorkflowType = 'reportWorkflow'` })) {
      runs.push({ id: wf.workflowId, status: wf.status.name, waiting: false });
      if (runs.length >= 8) break;
    }
    // Ask running reports whether they are waiting for approval (a Temporal Query).
    await Promise.all(
      runs
        .filter((r) => r.status === 'RUNNING')
        .map(async (r) => {
          r.waiting = await client.workflow.getHandle(r.id).query(waitingForApprovalQuery).catch(() => false);
        }),
    );
    return runs;
  }

  async function apiState() {
    const res = await fetch(`${API_URL}/state`).catch(() => null);
    return res && res.ok ? ((await res.json()) as { broken: string[] }) : { broken: null };
  }

  async function chaos(name: string, mode: string) {
    await fetch(`${API_URL}/chaos/${name}/${mode}`, { method: 'POST' });
    return apiState();
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(PAGE);
      } else if (req.method === 'GET' && url.pathname === '/state') {
        json(200, { runs: await listRuns(), api: await apiState() });
      } else if (req.method === 'POST' && url.pathname === '/start') {
        json(200, await startReport(url.searchParams.get('approval') === '1'));
      } else if (req.method === 'POST' && url.pathname === '/approve') {
        const id = url.searchParams.get('id') ?? '';
        await client.workflow.getHandle(id).signal(approveSignal);
        json(200, { id });
      } else if (req.method === 'POST' && url.pathname.startsWith('/chaos/')) {
        const [, , name, mode] = url.pathname.split('/');
        json(200, await chaos(name, mode));
      } else {
        json(404, { error: 'not found' });
      }
    } catch (err) {
      json(500, { error: String((err as Error).message ?? err) });
    }
  });

  server.listen(PORT, () => console.log(`Demo panel on http://localhost:${PORT}`));
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Report demo panel</title>
<style>
  :root { --bg:#12142B; --card:#1D2043; --line:#2C3066; --text:#F2F1EC; --muted:#9A9EC4; --accent:#A9A0FF; --warn:#FFB454; --ok:#7BD88F; --bad:#FF7A7A; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.5 -apple-system, system-ui, sans-serif; }
  main { max-width:880px; margin:0 auto; padding:40px 16px; display:flex; flex-direction:column; gap:24px; }
  h1 { margin:0; font-size:32px; }
  .sub { color:var(--muted); margin:4px 0 0; }
  section { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:20px; }
  h2 { margin:0 0 14px; font-size:14px; letter-spacing:1.5px; text-transform:uppercase; color:var(--accent); }
  .row { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
  button { font:inherit; font-weight:600; border:0; border-radius:10px; padding:14px 22px; cursor:pointer; background:var(--accent); color:#12142B; }
  button.secondary { background:transparent; color:var(--text); border:1px solid var(--line); }
  button.small { padding:6px 14px; font-size:14px; }
  button:disabled { opacity:.5; cursor:default; }
  .svc { display:flex; align-items:center; gap:10px; padding:10px 14px; border:1px solid var(--line); border-radius:10px; }
  .dot { width:10px; height:10px; border-radius:50%; background:var(--ok); }
  .dot.bad { background:var(--bad); }
  table { width:100%; border-collapse:collapse; }
  td { padding:10px 6px; border-top:1px solid var(--line); vertical-align:middle; }
  td.id { font-family:ui-monospace, Menlo, monospace; font-size:14px; }
  .status { font-weight:600; font-size:14px; }
  .RUNNING { color:var(--warn); } .COMPLETED { color:var(--ok); } .FAILED, .TERMINATED, .TIMED_OUT, .CANCELLED { color:var(--bad); }
  a { color:var(--accent); }
  .empty { color:var(--muted); }
  #msg { color:var(--muted); min-height:24px; }
</style>
</head>
<body>
<main>
  <div>
    <h1>Weekly report demo</h1>
    <p class="sub">Temporal durable execution · <a href="http://localhost:8233" target="_blank">Open Temporal Web UI</a></p>
  </div>

  <section>
    <h2>Start a report</h2>
    <div class="row">
      <button onclick="start(false)">Start report</button>
      <button class="secondary" onclick="start(true)">Start with approval</button>
    </div>
    <p id="msg"></p>
  </section>

  <section>
    <h2>Mock API</h2>
    <div class="row" id="services"></div>
  </section>

  <section>
    <h2>Recent runs</h2>
    <table><tbody id="runs"><tr><td class="empty">Loading…</td></tr></tbody></table>
  </section>
</main>
<script>
  const SERVICES = ['sales', 'support', 'engineering'];
  const msg = (t) => { document.getElementById('msg').textContent = t; };
  const post = async (path) => {
    const res = await fetch(path, { method: 'POST' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || res.statusText);
    return body;
  };

  async function start(approval) {
    try {
      const { id } = await post('/start' + (approval ? '?approval=1' : ''));
      msg('Started ' + id + (approval ? ' (waits for approval after the AI summary)' : ''));
      refresh();
    } catch (e) { msg('Error: ' + e.message); }
  }
  async function approve(id) {
    try { await post('/approve?id=' + encodeURIComponent(id)); msg('Approved ' + id); refresh(); }
    catch (e) { msg('Error: ' + e.message); }
  }
  async function toggle(name, broken) {
    try { await post('/chaos/' + name + '/' + (broken ? 'off' : 'on')); refresh(); }
    catch (e) { msg('Error: ' + e.message); }
  }

  function renderServices(broken) {
    if (!broken) { setHtml('services', '<span class="empty">Mock API is not running (npm run api)</span>'); return; }
    setHtml('services', SERVICES.map((s) => {
      const isBroken = broken.includes(s);
      return '<div class="svc"><span class="dot' + (isBroken ? ' bad' : '') + '"></span>/' + s +
        ' <button class="small secondary" onclick="toggle(\\'' + s + '\\',' + isBroken + ')">' + (isBroken ? 'Fix' : 'Break') + '</button></div>';
    }).join(''));
  }

  function renderRuns(runs) {
    if (!runs.length) { setHtml('runs', '<tr><td class="empty">No runs yet</td></tr>'); return; }
    setHtml('runs', runs.map((r) =>
      '<tr><td class="id"><a target="_blank" href="http://localhost:8233/namespaces/default/workflows/' + encodeURIComponent(r.id) + '">' + r.id + '</a></td>' +
      '<td class="status ' + r.status + '">' + (r.waiting ? 'WAITING FOR APPROVAL' : r.status) + '</td>' +
      '<td style="text-align:right">' + (r.waiting ? '<button class="small" onclick="approve(\\'' + r.id + '\\')">Approve</button>' : '') + '</td></tr>'
    ).join(''));
  }

  // Only touch the DOM when something changed, so a click is never lost to a redraw.
  const last = {};
  function setHtml(id, html) {
    if (last[id] === html) return;
    last[id] = html;
    document.getElementById(id).innerHTML = html;
  }

  async function refresh() {
    try {
      const s = await (await fetch('/state')).json();
      renderRuns(s.runs || []);
      renderServices(s.api && s.api.broken);
    } catch (e) { msg('Panel lost connection: ' + e.message); }
  }
  refresh();
  setInterval(refresh, 1500);
</script>
</body>
</html>`;

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
