/**
 * Comment threading (Slice 2) — turn the flat, cursor-paginated comment
 * list into the nested tree the drawer renders.
 *
 * The server keeps returning a FLAT, sorted list (§4.13); each row carries
 * an optional `parent_id`. We thread it here, client-side, so nesting stays
 * additive: a pre-threading backend (no `parent_id`) yields an all-roots
 * tree that renders exactly like the old flat drawer.
 *
 * Orphan-safe: a reply whose parent isn't in the currently-loaded pages
 * (its parent lives on a not-yet-fetched page, or was deleted) surfaces at
 * root rather than vanishing — nothing the server sent is ever dropped.
 *
 * Sibling order is preserved from the server list (the server owns the sort
 * per §A2); we only group, never reorder.
 */

import type { Comment } from "@/lib/api/types";

export interface CommentNode {
  comment: Comment;
  /** 0 = top-level; increments per nesting level. */
  depth: number;
  /** Direct replies, in server order. */
  children: CommentNode[];
}

/** Normalize an optional parent link to a real id or null (absent/"" → root). */
function parentIdOf(comment: Comment): string | null {
  const raw = comment.parent_id;
  return raw === undefined || raw === null || raw === "" ? null : raw;
}

/**
 * Build the comment forest from a flat list. Returns top-level nodes in
 * server order, each with its `children` threaded recursively and a `depth`
 * relative to the forest root.
 */
export function buildCommentTree(items: readonly Comment[]): CommentNode[] {
  // First pass: a node per comment, indexed by id (so a reply can find its
  // parent regardless of list order).
  const byId = new Map<string, CommentNode>();
  for (const comment of items) {
    byId.set(comment.id, { comment, depth: 0, children: [] });
  }

  const roots: CommentNode[] = [];
  // Second pass in list order → siblings keep the server's sort.
  for (const comment of items) {
    const node = byId.get(comment.id);
    if (node === undefined) continue; // unreachable; keeps TS's index checks happy
    const parentId = parentIdOf(comment);
    const parent = parentId === null ? undefined : byId.get(parentId);
    if (parent === undefined) {
      // Top-level, or an orphan whose parent isn't loaded → surface at root.
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }

  // Third pass: stamp depth by walking the assembled tree (parents may have
  // been seen after their children in the flat list, so depth can't be set
  // during grouping).
  const stampDepth = (node: CommentNode, depth: number): void => {
    node.depth = depth;
    for (const child of node.children) stampDepth(child, depth + 1);
  };
  for (const root of roots) stampDepth(root, 0);

  return roots;
}

/**
 * Find a node by comment id anywhere in a forest — used by the drill-down to
 * re-root the view at the pivot comment. Returns the matching node (with its
 * already-threaded children) or null.
 */
export function findNode(nodes: readonly CommentNode[], id: string): CommentNode | null {
  for (const node of nodes) {
    if (node.comment.id === id) return node;
    const hit = findNode(node.children, id);
    if (hit !== null) return hit;
  }
  return null;
}
