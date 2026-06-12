// Workspace viewer types — ported from grip-lab (src/lab/types.ts), trimmed
// to what the viewer and the dynamic graph need.

export interface ChangedFile {
  path: string;
}

export interface RepoInfo {
  path: string;   // '' = the workspace root repo
  name: string;
  branch: string;
  head: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  changedFiles: ChangedFile[];
}

export interface DepEdge {
  source: string; // repo path; '' = root
  target: string;
}

// A node snapshot the graph engine publishes for rendering.
export interface GraphRenderNode {
  id: string;
  repoPath: string;
  name: string;
  branch: string;
  head: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  expanded: boolean;
  changedFiles: ChangedFile[];
}
