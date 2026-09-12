import type { LensNode } from '../contract';
import type { PreviewPlan } from './neighbourhood';

// The DOT a preview hands to Graphviz, written the way the Gyld host writes it
// (gyld/scripts/lens_geometry.py, `plan_dot`, which is what the emitted
// neighbourhood members are laid out from).
//
// Same graph, node and edge preamble; same cluster block; same id on every
// node, edge and cluster; same label breaking. The point is not byte identity
// with the host's file, which nothing here can check, but that the same
// records drawn with the same typography and the same shapes give a picture a
// reader recognises as the same lens. The POSITIONS will differ: the host's
// Graphviz and the browser's wasm build are different versions, which is
// exactly why a preview is emitted `pinned: false`.

/** `json.dumps(str(value), ensure_ascii=True)`: a DOT string literal with
 *  every non-ASCII character escaped, as the host's `quote` writes it. */
export function quote(value: string | number): string {
  return JSON.stringify(String(value)).replace(
    /[\u0080-\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/**
 * One node's label attribute value.
 *
 * A single line is quoted as it stands and Graphviz centres it. Several lines
 * are joined with Graphviz's left-aligned break `\l` when the lens justified
 * them left, and with a real newline, which Graphviz centres, when it did not.
 * This is the host's `_label` and the reason every emitted node carries its
 * own `justify`.
 */
export function dotLabel(text: readonly string[], justify: string): string {
  if (text.length === 1) {
    return quote(text[0]);
  }
  if (justify !== 'left') {
    return quote(text.join('\n'));
  }
  return quote(text.map((line) => `${line}\\l`).join('')).replaceAll('\\\\l', '\\l');
}

/** One node statement. `style` and `fillcolor` are written only when the lens
 *  carries them: a lens that says nothing about a node's fill is not a licence
 *  to choose one, so Graphviz's own default stands instead. */
function nodeLine(node: LensNode, justify: string, indent: string): string {
  const pairs: string[] = [`label=${dotLabel(node.text, justify)}`];
  pairs.push(`shape=${quote(node.shape)}`);
  if (node.style !== undefined) {
    pairs.push(`style=${quote(node.style)}`);
  }
  if (node.fill !== undefined) {
    pairs.push(`fillcolor=${quote(node.fill)}`);
  }
  pairs.push(`id=${quote(node.id)}`);
  return `${indent}${quote(node.label)} [${pairs.join(', ')}];`;
}

/** The graph name the host gives a neighbourhood member's DOT. */
export const PREVIEW_GRAPH_NAME = 'glade_neighbourhood';

export function previewDot(plan: PreviewPlan): string {
  const lines = [
    `digraph ${PREVIEW_GRAPH_NAME} {`,
    '  graph [rankdir=TB, bgcolor="white", pad="0.4", nodesep="0.35", ranksep="0.9",',
    '    newrank=true, fontname="Helvetica", fontsize=20, labelloc="t",',
    `    label=${quote(`${plan.title}\n${plan.note}`)}];`,
    `  node [fontname="Helvetica", fontsize=${plan.fontsize}, color="#64748b",`
      + ' margin="0.14,0.08"];',
    '  edge [color="#475569", arrowsize=0.7, fontname="Helvetica", fontsize=9];',
  ];
  const byId = new Map(plan.nodes.map((node) => [node.id, node]));
  const grouped = new Set<string>();
  plan.groups.forEach((group, position) => {
    lines.push(`  subgraph cluster_${position} {`);
    lines.push(
      `    label=${quote(group.label)}; id=${quote(group.id)}; fontsize=12;`
      + ' color="#94a3b8"; style="rounded"; bgcolor="#f8fafc";',
    );
    for (const member of group.members) {
      const node = byId.get(member);
      if (node === undefined) {
        continue;
      }
      lines.push(nodeLine(node, plan.justify, '    '));
      grouped.add(member);
    }
    lines.push('  }');
  });
  for (const node of plan.nodes) {
    if (!grouped.has(node.id)) {
      lines.push(nodeLine(node, plan.justify, '  '));
    }
  }
  for (const edge of plan.edges) {
    const pairs: string[] = [];
    // The styling the picture actually used for THIS edge, as the lens
    // recorded it. Every value is quoted, as the host's `attributes` does.
    if (edge.style?.color !== undefined) {
      pairs.push(`color=${quote(edge.style.color)}`);
    }
    if (edge.style?.style !== undefined) {
      pairs.push(`style=${quote(edge.style.style)}`);
    }
    if (edge.style?.penwidth !== undefined) {
      pairs.push(`penwidth=${quote(edge.style.penwidth)}`);
    }
    if (edge.label !== undefined) {
      pairs.push(`label=${quote(edge.label)}`);
    }
    pairs.push(`id=${quote(edge.id)}`);
    const tail = byId.get(edge.tail);
    const head = byId.get(edge.head);
    if (tail === undefined || head === undefined) {
      continue;
    }
    lines.push(`  ${quote(tail.label)} -> ${quote(head.label)} [${pairs.join(', ')}];`);
  }
  return [...lines, '}', ''].join('\n');
}
