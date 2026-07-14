import { Handle, Position, type NodeProps } from '@xyflow/react';
export interface InteractionNodeData extends Record<string, unknown> { title: string; body: string; selected: boolean }
export function InteractionNode({ data }: NodeProps) { const d = data as InteractionNodeData; return <div className={`interaction-node ${d.selected ? 'selected' : ''}`} data-testid="interaction-node"><Handle type="target" position={Position.Left}/><strong>{d.title}</strong><span>{d.body}</span><Handle type="source" position={Position.Right}/></div>; }
