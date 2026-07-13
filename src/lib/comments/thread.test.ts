import { describe, expect, it } from "vitest";

import { buildCommentTree, findNode, type CommentNode } from "@/lib/comments/thread";
import type { Comment } from "@/lib/api/types";

/**
 * The tree builder is the load-bearing pure logic behind Slice 2 nesting:
 * it threads the FLAT server list into the drawer's tree. The invariants
 * that matter — order-independence (a reply may arrive before its parent),
 * orphan-safety (nothing the server sent is ever dropped), correct depth
 * stamping, and preserved sibling order — are all exercised here.
 */

/** Minimal Comment factory — only the fields the tree builder reads. */
function c(id: string, parent_id: string | null = null): Comment {
  return {
    id,
    comment_id: id,
    feed_id: "feed_1",
    author: { id: 1, handle: "h", display_name: "H", avatar_url: "" },
    body: id,
    mentions: [],
    posted_at: "2026-07-13T00:00:00Z",
    permissions: { can_delete: { allowed: false, unlock_hint: null } },
    parent_id,
  };
}

/** Flatten a forest to `id@depth` strings in traversal order, for assertions. */
function shape(nodes: CommentNode[]): string[] {
  const out: string[] = [];
  const walk = (n: CommentNode) => {
    out.push(`${n.comment.id}@${n.depth}`);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

describe("buildCommentTree", () => {
  it("threads a simple parent→child chain with correct depths", () => {
    const tree = buildCommentTree([c("a"), c("b", "a"), c("c", "b")]);
    expect(shape(tree)).toEqual(["a@0", "b@1", "c@2"]);
  });

  it("is order-independent — a reply listed before its parent still nests", () => {
    // 'b' (reply) arrives before 'a' (its parent) in the flat list.
    const tree = buildCommentTree([c("b", "a"), c("a")]);
    expect(shape(tree)).toEqual(["a@0", "b@1"]);
  });

  it("surfaces an orphan (parent not in the loaded set) at root, never dropping it", () => {
    // 'x' points at a parent that isn't present (unloaded page / deleted).
    const tree = buildCommentTree([c("a"), c("x", "missing")]);
    expect(shape(tree)).toEqual(["a@0", "x@0"]);
  });

  it("treats null / empty-string parent_id as top-level", () => {
    const withEmpty: Comment = { ...c("e"), parent_id: "" };
    const tree = buildCommentTree([c("a"), withEmpty]);
    expect(tree.map((n) => n.comment.id)).toEqual(["a", "e"]);
  });

  it("preserves server sibling order under a shared parent", () => {
    const tree = buildCommentTree([c("a"), c("b1", "a"), c("b2", "a"), c("b3", "a")]);
    const root = tree[0];
    expect(root?.children.map((n) => n.comment.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("handles a pre-threading backend (no parent_id key at all) as an all-roots list", () => {
    // exactOptionalPropertyTypes: the field must be ABSENT, not `undefined`.
    const noParent = (id: string): Comment => {
      const { parent_id: _drop, ...rest } = c(id);
      void _drop;
      return rest;
    };
    const tree = buildCommentTree([noParent("a"), noParent("b")]);
    expect(shape(tree)).toEqual(["a@0", "b@0"]);
  });
});

describe("findNode", () => {
  const tree = buildCommentTree([c("a"), c("b", "a"), c("c", "b"), c("d")]);

  it("finds a deeply-nested node with its subtree intact", () => {
    const hit = findNode(tree, "c");
    expect(hit?.comment.id).toBe("c");
    expect(hit?.depth).toBe(2);
  });

  it("returns null for an id not in the forest", () => {
    expect(findNode(tree, "nope")).toBeNull();
  });
});
