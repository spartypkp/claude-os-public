'use client';

import { useEffect, useState, useCallback, useMemo, memo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Panel,
  type Node,
  type Edge,
  type NodeTypes,
  Position,
  Handle,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Loader2, Users } from 'lucide-react';
import { API_BASE } from '@/lib/api';

const CLAUDE_CORAL = '#DA7756';

// Color palette for companies
const COMPANY_COLORS = [
  '#DA7756', '#5B8DEF', '#22c55e', '#f59e0b', '#a855f7',
  '#ec4899', '#14b8a6', '#ef4444', '#6366f1', '#84cc16',
];

interface GraphNode {
  id: string;
  name: string;
  company?: string;
  role?: string;
  relationship?: string;
  pinned: boolean;
  tags: string[];
  description?: string;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  label: string;
}

interface ContactNodeData {
  name: string;
  company?: string;
  role?: string;
  relationship?: string;
  pinned: boolean;
  tags: string[];
  color: string;
}

// Contact node component — must be memoized and defined outside
function ContactNodeComponent({ data }: { data: Record<string, unknown> }) {
  const d = data as unknown as ContactNodeData;

  return (
    <div
      className="group relative"
      style={{ width: 140 }}
    >
      <Handle type="target" position={Position.Left} id="left" style={{ background: 'transparent', border: 'none', width: 1, height: 1 }} />
      <Handle type="source" position={Position.Right} id="right" style={{ background: 'transparent', border: 'none', width: 1, height: 1 }} />

      <div
        className="px-2.5 py-2 rounded-lg border backdrop-blur-sm cursor-pointer transition-all hover:scale-105"
        style={{
          background: 'rgba(30, 30, 30, 0.85)',
          borderColor: `${d.color}40`,
          boxShadow: `0 0 12px ${d.color}15`,
        }}
      >
        {/* Name */}
        <div className="flex items-center gap-1.5">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
            style={{ background: d.color }}
          >
            {d.name.charAt(0).toUpperCase()}
          </div>
          <span className="text-[11px] font-medium text-white truncate">{d.name}</span>
        </div>

        {/* Company / Role */}
        {(d.company || d.role) && (
          <p className="text-[9px] text-white/50 mt-1 truncate pl-6">
            {d.company}{d.role ? ` · ${d.role}` : ''}
          </p>
        )}

        {/* Relationship badge */}
        {d.relationship && (
          <span
            className="inline-block mt-1 ml-6 px-1.5 py-0.5 rounded text-[8px] font-medium"
            style={{ background: `${d.color}20`, color: d.color }}
          >
            {d.relationship}
          </span>
        )}

        {/* Pinned indicator */}
        {d.pinned && (
          <div
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2"
            style={{ background: '#f59e0b', borderColor: 'rgba(30,30,30,0.85)' }}
          />
        )}
      </div>
    </div>
  );
}

const ContactNode = memo(ContactNodeComponent);

// Node types — MUST be outside component for stable reference
const nodeTypes: NodeTypes = {
  contact: ContactNode as any,
};

interface NetworkGraphProps {
  onSelectContact: (contactId: string) => void;
}

/**
 * Simple force-directed-ish layout.
 * Groups contacts by company in a circular arrangement.
 */
function computeLayout(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  companyColorMap: Map<string, string>,
): { nodes: Node[]; edges: Edge[] } {
  // Group by company for positioning
  const companyGroups = new Map<string, GraphNode[]>();
  const ungrouped: GraphNode[] = [];

  for (const n of graphNodes) {
    if (n.company) {
      if (!companyGroups.has(n.company)) companyGroups.set(n.company, []);
      companyGroups.get(n.company)!.push(n);
    } else {
      ungrouped.push(n);
    }
  }

  const nodes: Node[] = [];
  const centerX = 400;
  const centerY = 300;

  // Position company groups in a circle
  const groups = Array.from(companyGroups.entries());
  const totalGroups = groups.length + (ungrouped.length > 0 ? 1 : 0);
  const radius = Math.max(200, totalGroups * 60);

  groups.forEach(([company, members], groupIdx) => {
    const angle = (groupIdx / totalGroups) * 2 * Math.PI - Math.PI / 2;
    const groupCenterX = centerX + radius * Math.cos(angle);
    const groupCenterY = centerY + radius * Math.sin(angle);

    // Spread members within the group
    const memberRadius = Math.max(40, members.length * 20);
    members.forEach((m, mIdx) => {
      const memberAngle = (mIdx / members.length) * 2 * Math.PI;
      const x = groupCenterX + memberRadius * Math.cos(memberAngle);
      const y = groupCenterY + memberRadius * Math.sin(memberAngle);
      const color = companyColorMap.get(company) || '#8E8E93';

      nodes.push({
        id: m.id,
        type: 'contact',
        position: { x, y },
        data: {
          name: m.name,
          company: m.company,
          role: m.role,
          relationship: m.relationship,
          pinned: m.pinned,
          tags: m.tags,
          color,
        } as unknown as Record<string, unknown>,
      });
    });
  });

  // Position ungrouped contacts
  if (ungrouped.length > 0) {
    const angle = (groups.length / totalGroups) * 2 * Math.PI - Math.PI / 2;
    const groupCenterX = centerX + radius * Math.cos(angle);
    const groupCenterY = centerY + radius * Math.sin(angle);

    ungrouped.forEach((m, mIdx) => {
      const memberAngle = (mIdx / ungrouped.length) * 2 * Math.PI;
      const memberRadius = Math.max(40, ungrouped.length * 20);
      const x = groupCenterX + memberRadius * Math.cos(memberAngle);
      const y = groupCenterY + memberRadius * Math.sin(memberAngle);

      nodes.push({
        id: m.id,
        type: 'contact',
        position: { x, y },
        data: {
          name: m.name,
          company: m.company,
          role: m.role,
          relationship: m.relationship,
          pinned: m.pinned,
          tags: m.tags,
          color: '#8E8E93',
        } as unknown as Record<string, unknown>,
      });
    });
  }

  // Build edges
  const edges: Edge[] = graphEdges.map((e, idx) => ({
    id: `e-${idx}`,
    source: e.source,
    target: e.target,
    type: 'default',
    style: {
      stroke: e.type === 'company'
        ? (companyColorMap.get(e.label) || '#8E8E93')
        : '#6366f1',
      strokeWidth: e.type === 'company' ? 1.5 : 0.8,
      opacity: e.type === 'company' ? 0.4 : 0.2,
    },
    animated: false,
  }));

  return { nodes, edges };
}

function NetworkGraphInner({ onSelectContact }: NetworkGraphProps) {
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/contacts/graph?limit=200`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setGraphData(data);
    } catch (err) {
      console.error('Graph load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  // Build company color map
  const companyColorMap = useMemo(() => {
    if (!graphData) return new Map<string, string>();
    const companies = new Set<string>();
    for (const n of graphData.nodes) {
      if (n.company) companies.add(n.company);
    }
    const map = new Map<string, string>();
    Array.from(companies).sort().forEach((c, i) => {
      map.set(c, COMPANY_COLORS[i % COMPANY_COLORS.length]);
    });
    return map;
  }, [graphData]);

  const layout = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [] };
    return computeLayout(graphData.nodes, graphData.edges, companyColorMap);
  }, [graphData, companyColorMap]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    onSelectContact(node.id);
  }, [onSelectContact]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#8E8E93]" />
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#DA7756]/20 to-[#C15F3C]/30 flex items-center justify-center mb-3">
          <Users className="w-7 h-7 text-[#DA7756]" />
        </div>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1">No connections yet</p>
        <p className="text-xs text-[#8E8E93]">
          Add companies, tags, or relationships to build the network
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full" style={{ background: '#1a1a1a' }}>
      <ReactFlow
        nodes={layout.nodes}
        edges={layout.edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.5, minZoom: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        colorMode="dark"
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        proOptions={{ hideAttribution: true }}
      >
        <Controls
          position="bottom-right"
          showInteractive={false}
          style={{ background: 'rgba(30,30,30,0.9)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}
        />
        {/* Legend */}
        <Panel position="top-left">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg border border-white/10 px-3 py-2 space-y-1">
            <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wider mb-1">Companies</p>
            {Array.from(companyColorMap.entries()).slice(0, 8).map(([company, color]) => (
              <div key={company} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <span className="text-[10px] text-white/70">{company}</span>
              </div>
            ))}
            {companyColorMap.size > 8 && (
              <p className="text-[9px] text-white/40">+{companyColorMap.size - 8} more</p>
            )}
            <div className="border-t border-white/10 mt-1 pt-1">
              <p className="text-[9px] text-white/40">
                {graphData.nodes.length} contacts · {graphData.edges.length} connections
              </p>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function NetworkGraph(props: NetworkGraphProps) {
  return (
    <ReactFlowProvider>
      <NetworkGraphInner {...props} />
    </ReactFlowProvider>
  );
}

export default NetworkGraph;
