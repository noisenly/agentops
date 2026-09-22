'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import { Activity01Icon, ArrowUpRight01Icon, BotIcon, Clock01Icon, FlashIcon, Layers01Icon } from 'hugeicons-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { useProjects } from '@/hooks/queries/useProjects';
import { fetchAuthenticatedApi } from '@/lib/api-client';
import { ProjectMetrics } from '@/lib/interfaces';
import { ITrace } from '@/types/ITrace';

type ProjectSnapshot = { metrics: ProjectMetrics | null; traces: ITrace[] };
type Run = ITrace & { projectName: string };
type RunNode = Run & { children: RunNode[] };
type LatticeNode = { id: string; name: string; role: string; status: string };
type LatticeGraph = { nodes: LatticeNode[]; edges: { from: string; to: string; kind: 'handoff' | 'supervises' }[] };

const latticeId = (name?: string) => (name ?? '').trim().replace(/-/g, '_');

// Layers by longest handoff path from a root; supervision edges are drawn as badges, not layout.
function layerLattice({ nodes, edges }: LatticeGraph) {
  const handoffs = edges.filter((edge) => edge.kind === 'handoff');
  const depth = new Map(nodes.map((node) => [node.id, 0]));
  // ponytail: relax |nodes| times, fine for dozens of agents and stops on cycles.
  for (let i = 0; i < nodes.length; i++)
    for (const { from, to } of handoffs)
      if (depth.has(from) && depth.has(to) && depth.get(to)! <= depth.get(from)! && depth.get(from)! < nodes.length)
        depth.set(to, depth.get(from)! + 1);
  const layers: LatticeNode[][] = [];
  for (const node of nodes) (layers[depth.get(node.id)!] ??= []).push(node);
  return layers.filter(Boolean);
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

function timeAgo(value?: string) {
  if (!value) return 'No runs yet';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function isLive(value?: string) {
  return !!value && Date.now() - new Date(value).getTime() < 15 * 60 * 1000;
}

function buildRunForest(runs: Run[]) {
  const nodes = new Map<string, RunNode>(runs.filter((run) => run.agent_id).map((run) => [run.agent_id!, { ...run, children: [] }]));
  const roots: RunNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_agent_id && nodes.get(node.parent_agent_id);
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

async function fetchSnapshot(projectId: string): Promise<ProjectSnapshot> {
  const [metrics, traces] = await Promise.all([
    fetchAuthenticatedApi<ProjectMetrics>(`/v4/meterics/project/${projectId}`),
    fetchAuthenticatedApi<{ traces: ITrace[] }>(`/v4/traces/list/${projectId}?limit=20&offset=0`),
  ]);
  return { metrics, traces: traces.traces ?? [] };
}

export default function MissionControlPage() {
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const snapshots = useQueries({
    queries: projects.map((project) => ({
      queryKey: ['mission-control', project.id],
      queryFn: () => fetchSnapshot(project.id),
      refetchInterval: 30_000,
      staleTime: 20_000,
    })),
  });

  const projectCards = useMemo(
    () =>
      projects.map((project, index) => {
        const snapshot = snapshots[index]?.data;
        const latest = snapshot?.traces[0];
        const metrics = snapshot?.metrics;
        return { project, latest, metrics, traces: snapshot?.traces ?? [] };
      }),
    [projects, snapshots],
  );

  const totals = useMemo(() => {
    return projectCards.reduce(
      (total, item) => ({
        traces: total.traces + (item.metrics?.trace_count ?? 0),
        spans: total.spans + (item.metrics?.span_count?.total ?? 0),
        tokens: total.tokens + (item.metrics?.token_metrics?.total_tokens?.all ?? 0),
        cost: total.cost + Number(item.metrics?.token_metrics?.total_cost ?? 0),
      }),
      { traces: 0, spans: 0, tokens: 0, cost: 0 },
    );
  }, [projectCards]);

  const runs = useMemo<Run[]>(() => {
    return projectCards.flatMap(({ project, traces }) => traces.map((trace) => ({ ...trace, projectName: project.name })));
  }, [projectCards]);

  const liveRuns = runs.filter((run) => run.agent_status === 'running');
  const { data: lattice } = useQuery<LatticeGraph>({
    queryKey: ['lattice'],
    queryFn: () => fetch('/api/lattice').then((res) => res.json()),
    refetchInterval: 30_000,
  });
  const latestByAgent = useMemo(() => {
    const latest = new Map<string, Run>();
    for (const run of runs) {
      const key = latticeId(run.agent_name);
      const seen = latest.get(key);
      if (key && (!seen || run.start_time > seen.start_time)) latest.set(key, run);
    }
    return latest;
  }, [runs]);
  const runForest = useMemo(() => buildRunForest(runs), [runs]);

  return (
    <main className="min-h-screen bg-[#07111f] px-5 py-6 text-[#edf5ff] sm:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" /> Local observability
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Mission Control</h1>
            <p className="mt-2 text-sm text-slate-400">Every project. Every agent. One live view.</p>
          </div>
          <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100">
            Refreshes every 30 seconds
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Projects" value={projectsLoading ? '—' : String(projects.length)} icon={<Layers01Icon />} accent="text-violet-300" />
          <Metric label="Running agents" value={String(liveRuns.length)} icon={<Activity01Icon />} accent="text-cyan-300" />
          <Metric label="Tokens observed" value={compact.format(totals.tokens)} icon={<FlashIcon />} accent="text-amber-300" />
          <Metric label="Observed cost" value={money.format(totals.cost)} icon={<ArrowUpRight01Icon />} accent="text-emerald-300" />
        </section>

        {!!lattice?.nodes.length && <LatticeView graph={lattice} latest={latestByAgent} />}

        <section className="mt-6 rounded-3xl border border-white/10 bg-gradient-to-br from-[#10233a] to-[#0b1727] p-5 shadow-2xl shadow-cyan-950/20 sm:p-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">Agent topology</p>
              <h2 className="mt-1 text-xl font-semibold">Recent agent runs</h2>
            </div>
            <p className="hidden text-sm text-slate-400 sm:block">Parent → worker relationships</p>
          </div>
          <div className="mt-6 overflow-x-auto pb-2">
            <div className="flex min-w-max justify-center gap-12 px-4">
              {runForest.map((run) => <RunGraph key={run.agent_id || run.trace_id} run={run} />)}
              {runs.length === 0 && <p className="py-12 text-sm text-slate-400">Agent activity appears after the first trace.</p>}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.65fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#10233a] to-[#0b1727] p-5 shadow-2xl shadow-cyan-950/20 sm:p-7">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Portfolio pulse</p>
                <h2 className="mt-1 text-xl font-semibold">Projects under observation</h2>
              </div>
              <Link href="/projects" className="text-sm text-cyan-300 hover:text-cyan-100">Manage projects →</Link>
            </div>
            <div className="grid gap-3">
              {projectCards.map(({ project, latest, metrics }) => (
                <Link key={project.id} href="/traces" className="group grid gap-3 rounded-2xl border border-white/8 bg-[#091827]/80 p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-[#0d2032] sm:grid-cols-[1.2fr_.8fr_.7fr_.7fr] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${isLive(latest?.start_time) ? 'bg-cyan-300 shadow-[0_0_14px_#67e8f9]' : 'bg-slate-600'}`} />
                      <p className="truncate font-medium">{project.name}</p>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-400">{latest?.root_span_name ?? 'Waiting for the first trace'}</p>
                  </div>
                  <MiniStat label="Latest run" value={timeAgo(latest?.start_time)} />
                  <MiniStat label="Traces" value={compact.format(metrics?.trace_count ?? 0)} />
                  <MiniStat label="Spans" value={compact.format(metrics?.span_count?.total ?? 0)} />
                </Link>
              ))}
              {!projectsLoading && projectCards.length === 0 && <p className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-slate-400">Create a project and send it a trace to see it here.</p>}
            </div>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-[#0c1929] p-5 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">Telemetry volume</p>
            <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/5 p-4">
              <div className="flex items-center gap-2 text-amber-200"><Clock01Icon size={16} /> <span className="text-sm font-medium">Telemetry volume</span></div>
              <p className="mt-2 text-2xl font-semibold">{compact.format(totals.spans)} spans</p>
              <p className="mt-1 text-xs text-slate-400">Across all visible projects.</p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function LatticeView({ graph, latest }: { graph: LatticeGraph; latest: Map<string, Run> }) {
  const supervisedBy = new Map(graph.edges.filter((edge) => edge.kind === 'supervises').map((edge) => [edge.to, edge.from]));
  const live = graph.nodes.filter((node) => latest.get(node.id)?.agent_status === 'running').length;
  return (
    <section className="mt-6 rounded-3xl border border-white/10 bg-gradient-to-br from-[#10233a] to-[#0b1727] p-5 shadow-2xl shadow-cyan-950/20 sm:p-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Lattice</p>
          <h2 className="mt-1 text-xl font-semibold">Declared agents, live status</h2>
        </div>
        <p className="text-sm text-slate-400">{live} of {graph.nodes.length} agents running</p>
      </div>
      <div className="mt-6 overflow-x-auto pb-2">
        <div className="flex min-w-max flex-col items-center gap-3">
          {layerLattice(graph).map((layer, index) => (
            <div key={index} className="flex flex-col items-center gap-3">
              {index > 0 && <span className="h-5 border-l border-dashed border-cyan-300/60" />}
              <div className="flex flex-wrap justify-center gap-4">
                {layer.map((node) => <LatticeCard key={node.id} node={node} run={latest.get(node.id)} supervisor={supervisedBy.get(node.id)} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LatticeCard({ node, run, supervisor }: { node: LatticeNode; run?: Run; supervisor?: string }) {
  const state = run?.agent_status ?? 'idle';
  const dot = state === 'running' ? 'animate-pulse bg-cyan-300 shadow-[0_0_10px_#67e8f9]' : state === 'failed' ? 'bg-red-400' : state === 'idle' ? 'bg-slate-600' : 'bg-emerald-400';
  const body = (
    <>
      <div className="flex items-center gap-2"><span title={state} className={`h-2.5 w-2.5 rounded-full ${dot}`} /><p className="truncate font-medium">{node.name}</p></div>
      <p className="mt-2 line-clamp-2 text-xs text-slate-400">{node.role}</p>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-slate-300">
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">{state}</span>
        {run && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">{timeAgo(run.start_time)}</span>}
        {!!run?.total_cost && <span className="rounded-full border border-emerald-300/20 bg-emerald-300/5 px-2 py-0.5 text-emerald-200">{money.format(run.total_cost)}</span>}
        {supervisor && <span className="rounded-full border border-amber-300/20 bg-amber-300/5 px-2 py-0.5 text-amber-200">↑ {supervisor}</span>}
      </div>
    </>
  );
  const className = `block w-60 rounded-2xl border p-4 transition ${state === 'running' ? 'border-cyan-300/50 bg-cyan-300/5' : 'border-white/10 bg-[#0c1929]'}`;
  return run ? <Link href={`/traces?trace_id=${run.trace_id}`} className={`${className} hover:-translate-y-0.5 hover:border-cyan-300/40`}>{body}</Link> : <div className={className}>{body}</div>;
}

function RunGraph({ run }: { run: RunNode }) {
  return <div className="flex min-w-[260px] flex-col items-center"><AgentCard run={run} leader={run.agent_role === 'orchestrator'} />{run.children.length > 0 && <><span className="h-5 border-l border-dashed border-cyan-300/60" /><div className="relative flex justify-center gap-4 border-t border-dashed border-cyan-300/60 pt-5">{run.children.map((child) => <div key={child.agent_id || child.trace_id} className="relative before:absolute before:-top-5 before:left-1/2 before:h-5 before:border-l before:border-dashed before:border-cyan-300/60"><RunBranch run={child} /></div>)}</div></>}</div>;
}

function RunBranch({ run }: { run: RunNode }) {
  return <div className="flex flex-col items-center"><AgentCard run={run} />{run.children.length > 0 && <div className="mt-3 space-y-2 border-l border-dashed border-cyan-300/40 pl-3">{run.children.map((child) => <RunBranch key={child.agent_id || child.trace_id} run={child} />)}</div>}</div>;
}

function AgentCard({ run, leader = false }: { run: Run; leader?: boolean }) {
  const status = run.agent_status === 'running' ? 'bg-cyan-300 shadow-[0_0_10px_#67e8f9]' : run.agent_status === 'failed' ? 'bg-red-400' : 'bg-emerald-400';
  return <Link href={`/traces?trace_id=${run.trace_id}`} className={`w-56 rounded-2xl border p-4 transition hover:-translate-y-0.5 ${leader ? 'border-amber-300/50 bg-amber-300/10 shadow-lg shadow-amber-950/30' : 'border-white/10 bg-[#0c1929] hover:border-cyan-300/40'}`}><div className="flex items-center gap-2"><span title={run.agent_status || 'Observed'} className={`h-2.5 w-2.5 rounded-full ${status}`} /><p className="truncate font-medium">{run.agent_name || run.root_service_name}</p></div><p className="mt-2 line-clamp-2 text-xs text-slate-400">{run.root_span_name || 'agent.run'}</p><span className="mt-3 inline-block rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">{run.agent_role || 'worker'}</span></Link>;
}

function Metric({ label, value, icon, accent }: { label: string; value: string; icon: React.ReactNode; accent: string }) {
  return <div className="rounded-2xl border border-white/10 bg-[#0c1929] p-5"><div className={`mb-7 ${accent}`}>{icon}</div><p className="text-sm text-slate-400">{label}</p><p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p></div>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-200">{value}</p></div>;
}
