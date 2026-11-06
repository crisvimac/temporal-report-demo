import { Client, Connection } from '@temporalio/client';
import { TEMPORAL_ADDRESS } from './shared';
import { approveSignal } from './workflows';

async function run() {
  const id = process.argv[2];
  if (!id) throw new Error('Usage: npm run approve -- <workflow-id>');
  const connection = await Connection.connect({ address: TEMPORAL_ADDRESS });
  const client = new Client({ connection });
  await client.workflow.getHandle(id).signal(approveSignal);
  console.log(`Sent "approve" to ${id}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
