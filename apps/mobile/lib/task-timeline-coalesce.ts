/**
 * Coalesces a per-task execution trace before rendering — merges adjacent
 * streaming `thinking` / `text` fragments that were split only by daemon
 * flush timing.
 *
 * Mirror of web's `coalesceTimelineItems` in
 * `packages/views/common/task-transcript/build-timeline.ts` (mirror, don't
 * import — same "key-factory binding" rule as the activity
 * `lib/timeline-coalesce.ts`; that file operates on `TimelineEntry`, a
 * different shape, so this is a genuinely new helper, not a duplicate).
 *
 * This is a behavioral-parity gate (apps/mobile/CLAUDE.md "Counts and
 * visibility must agree"): the daemon emits a long "thinking" stream as many
 * tiny `seq` rows. Without merging, mobile renders dozens of one-line rows and
 * the "N steps" count disagrees with web's transcript for the same run.
 *
 * Redaction (web's `redactSecrets`) is intentionally NOT ported: the server
 * redacts `content` / `output` / `input` before both persisting and
 * broadcasting (`server/internal/handler/daemon.go` ReportTaskMessages), so
 * the payloads mobile receives are already masked.
 */
import type { TaskMessagePayload } from "@multica/core/types";

function canMergeStreamingText(
  prev: TaskMessagePayload,
  next: TaskMessagePayload,
): boolean {
  return (
    (prev.type === "thinking" || prev.type === "text") &&
    prev.type === next.type
  );
}

/**
 * Merge adjacent text/thinking fragments. Sorts by `seq` ASC first so
 * late-arriving / reordered rows still merge in execution order. The merged
 * row keeps the first fragment's identity (`seq`, `task_id`) and concatenates
 * the content — matching web.
 */
export function coalesceTaskMessages(
  items: TaskMessagePayload[],
): TaskMessagePayload[] {
  const sorted = [...items].sort((a, b) => a.seq - b.seq);
  const out: TaskMessagePayload[] = [];

  for (const item of sorted) {
    const prev = out[out.length - 1];
    if (prev && canMergeStreamingText(prev, item)) {
      out[out.length - 1] = {
        ...prev,
        content: `${prev.content ?? ""}${item.content ?? ""}`,
      };
      continue;
    }
    out.push(item);
  }

  return out;
}
