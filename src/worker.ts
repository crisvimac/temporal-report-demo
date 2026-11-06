import { NativeConnection, Runtime, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { TASK_QUEUE, TEMPORAL_ADDRESS } from './shared';

// By default the SDK catches Ctrl+C and shuts down gracefully, letting running activities finish.
// For the demo we want Ctrl+C to behave like a crash, so we turn that off.
Runtime.install({ shutdownSignals: [] });

async function run() {
  const connection = await NativeConnection.connect({ address: TEMPORAL_ADDRESS });
  const worker = await Worker.create({
    connection,
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve('./workflows'),
    activities,
  });
  console.log(`Worker listening on task queue "${TASK_QUEUE}"`);
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
