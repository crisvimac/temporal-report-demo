import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { API_URL } from './shared';

// Small pauses on purpose, so the audience can follow each step live.
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchSection(service: string): Promise<string> {
  console.log(`[${service}] calling ${API_URL}/${service} ...`);
  await pause(2000);
  const res = await fetch(`${API_URL}/${service}`);
  if (!res.ok) {
    console.log(`[${service}] failed with HTTP ${res.status}`);
    // Throwing makes Temporal retry this activity according to the retry policy.
    throw new Error(`${service} API returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as { section: string };
  console.log(`[${service}] ok`);
  return body.section;
}

export const fetchSales = () => fetchSection('sales');
export const fetchSupport = () => fetchSection('support');
export const fetchEngineering = () => fetchSection('engineering');

// The "AI" step is simulated: no external API, no key, always the same output.
export async function aiSummarize(sections: string[]): Promise<string> {
  console.log(`[ai] summarizing ${sections.length} sections ...`);
  await pause(3000);
  console.log('[ai] ok');
  return [
    'Sales grew this week, support cleared most of its backlog,',
    'and engineering shipped the release on time.',
    'Main risk for next week: the support queue during the launch.',
  ].join(' ');
}

export async function writeReport(id: string, summary: string, sections: string[]): Promise<string> {
  const dir = path.resolve('output');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  const content = [`# Weekly report: ${id}`, '## Summary', summary, ...sections].join('\n\n') + '\n';
  await writeFile(file, content);
  console.log(`[write] ${file}`);
  return file;
}
