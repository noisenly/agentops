import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

// Declared agent graph, parsed the way Lattice does: markdown table rows are
// agents, plain `a -> b` / `a supervises b` lines are edges.
// ponytail: fixed file list for the showroom harness; glob the repo if a second repo shows up.
const ROOT = process.env.LATTICE_DIR || '/lattice';
const AGENT_FILES = ['AGENT_MAP.md', 'demo-harness/issue-agents.md'];
const EDGE_FILES = ['demo-harness/handoffs.md', 'demo-harness/issue-handoffs.md'];

export const dynamic = 'force-dynamic';

const id = (name: string) => name.trim().replace(/-/g, '_');
const read = (file: string) => readFile(path.join(ROOT, file), 'utf8').catch(() => '');

export async function GET() {
  const [agentDocs, edgeDocs] = await Promise.all([Promise.all(AGENT_FILES.map(read)), Promise.all(EDGE_FILES.map(read))]);

  const nodes = new Map<string, { id: string; name: string; role: string; status: string }>();
  for (const line of agentDocs.join('\n').split('\n')) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 4 || cells[0] === 'Agent Name' || /^-+$/.test(cells[0])) continue;
    nodes.set(id(cells[0]), { id: id(cells[0]), name: cells[0], role: cells[1], status: cells[3] });
  }

  const edges = new Map<string, { from: string; to: string; kind: 'handoff' | 'supervises' }>();
  for (const line of edgeDocs.join('\n').split('\n')) {
    const match = line.trim().match(/^([\w-]+)\s+(->|supervises|passes to)\s+([\w-]+)$/);
    if (!match) continue;
    const [, from, verb, to] = match;
    const kind = verb === 'supervises' ? 'supervises' : 'handoff';
    edges.set(`${id(from)}:${id(to)}:${kind}`, { from: id(from), to: id(to), kind });
  }

  return NextResponse.json({ nodes: [...nodes.values()], edges: [...edges.values()] });
}
