import { Client, Connection } from '@temporalio/client';
import { TASK_QUEUE, TEMPORAL_ADDRESS } from './shared';
import { reportWorkflow } from './workflows';

async function run() {
  const id = process.argv[2] ?? `report-${Date.now()}`;
  const requireApproval = process.env.REQUIRE_APPROVAL === '1';

  const connection = await Connection.connect({ address: TEMPORAL_ADDRESS });
  const client = new Client({ connection });

  const handle = await client.workflow.start(reportWorkflow, {
    taskQueue: TASK_QUEUE,
    workflowId: id,
    args: [id, requireApproval],
  });
  console.log(`Started workflow ${id}`);
  console.log(`Web UI: http://localhost:8233/namespaces/default/workflows/${id}`);
  if (requireApproval) console.log(`Waiting for approval. Run: npm run approve -- ${id}`);

  const file = await handle.result();
  console.log(`Done. Report written to ${file}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
