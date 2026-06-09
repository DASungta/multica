/**
 * Pure-function tests for the per-task transcript coalescer. This is the
 * headline behavioral-parity gate: the daemon flushes a long thinking/text
 * stream as many tiny `seq` rows, and the run-detail / chat "N steps" count
 * must match web's transcript after merging adjacent fragments. Mirrors the
 * intent of web's `build-timeline.test.ts` (coalesceTimelineItems).
 */
import { describe, expect, it } from "vitest";
import type { TaskMessagePayload } from "@multica/core/types";
import { coalesceTaskMessages } from "./task-timeline-coalesce";

function msg(p: Partial<TaskMessagePayload>): TaskMessagePayload {
  return {
    task_id: "t1",
    issue_id: "i1",
    seq: 0,
    type: "text",
    ...p,
  } as TaskMessagePayload;
}

describe("coalesceTaskMessages", () => {
  it("merges adjacent thinking fragments into one row", () => {
    const out = coalesceTaskMessages([
      msg({ seq: 1, type: "thinking", content: "Let me " }),
      msg({ seq: 2, type: "thinking", content: "analyze " }),
      msg({ seq: 3, type: "thinking", content: "the bug." }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.content).toBe("Let me analyze the bug.");
    expect(out[0]?.seq).toBe(1); // keeps the first fragment's identity
  });

  it("merges adjacent text fragments but keeps them separate from thinking", () => {
    const out = coalesceTaskMessages([
      msg({ seq: 1, type: "thinking", content: "thinking" }),
      msg({ seq: 2, type: "text", content: "Hello " }),
      msg({ seq: 3, type: "text", content: "world" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]?.type).toBe("thinking");
    expect(out[1]?.type).toBe("text");
    expect(out[1]?.content).toBe("Hello world");
  });

  it("does not merge across an interleaved tool_use", () => {
    const out = coalesceTaskMessages([
      msg({ seq: 1, type: "thinking", content: "a" }),
      msg({ seq: 2, type: "tool_use", tool: "grep", content: undefined }),
      msg({ seq: 3, type: "thinking", content: "b" }),
    ]);
    expect(out).toHaveLength(3);
    expect(out.map((m) => m.type)).toEqual(["thinking", "tool_use", "thinking"]);
  });

  it("sorts by seq before coalescing so out-of-order arrivals merge correctly", () => {
    const out = coalesceTaskMessages([
      msg({ seq: 3, type: "thinking", content: "c" }),
      msg({ seq: 1, type: "thinking", content: "a" }),
      msg({ seq: 2, type: "thinking", content: "b" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.content).toBe("abc");
  });

  it("never mutates the input array", () => {
    const input = [
      msg({ seq: 1, type: "thinking", content: "a" }),
      msg({ seq: 2, type: "thinking", content: "b" }),
    ];
    const before = JSON.stringify(input);
    coalesceTaskMessages(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
