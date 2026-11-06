import { condition, defineQuery, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';
import type * as activities from './activities';

const { fetchSales, fetchSupport, fetchEngineering, aiSummarize, writeReport } = proxyActivities<typeof activities>({
  // If a worker dies mid-activity, Temporal gives up on that attempt after 15s and runs it again.
  startToCloseTimeout: '15 seconds',
  retry: {
    initialInterval: '2 seconds',
    backoffCoefficient: 1.5,
    maximumInterval: '6 seconds',
    // no maximumAttempts: keep retrying until the service comes back
  },
});

export const approveSignal = defineSignal('approve');
// Used by the demo panel to know when to show the Approve button.
export const waitingForApprovalQuery = defineQuery<boolean>('waitingForApproval');

export async function reportWorkflow(id: string, requireApproval = false): Promise<string> {
  let approved = false;
  let waiting = false;
  setHandler(approveSignal, () => {
    approved = true;
  });
  setHandler(waitingForApprovalQuery, () => waiting);

  const sections: string[] = [];
  sections.push(await fetchSales());
  sections.push(await fetchSupport());
  sections.push(await fetchEngineering());

  const summary = await aiSummarize(sections);

  if (requireApproval) {
    // Waits for the "approve" signal: seconds or weeks, holding no thread.
    waiting = true;
    await condition(() => approved);
    waiting = false;
  }

  return await writeReport(id, summary, sections);
}
