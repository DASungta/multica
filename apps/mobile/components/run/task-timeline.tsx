/**
 * Per-task execution trace — what the agent is/was thinking and which tools
 * it called. Shared between two consumers:
 *
 *   - Chat (live under the StatusPill while a task is in flight, and
 *     persisted under the assistant bubble once the message has landed).
 *   - Issue run detail (`issue/[id]/runs/[taskId]`) — live + historical.
 *
 * Process steps (thinking / tool_use / tool_result / error) collapse
 * behind a single "N steps" toggle. Final text is NOT rendered here —
 * the parent renders the assistant message's `content` (or the latest
 * streaming text) as its own markdown block.
 *
 * Items are coalesced via `coalesceTaskMessages` before filtering so the
 * "N steps" count matches web's transcript (the daemon flushes a long
 * thinking/text stream as many tiny `seq` rows). See that helper for the
 * behavioral-parity rationale.
 *
 * Folds use RNR `Collapsible` (built on `@rn-primitives/collapsible`).
 * The earlier version of this file hand-rolled four separate
 * `useState + Pressable + chevron` triggers (~60 lines of state +
 * handlers); Collapsible owns open/close + a11y semantics in one place.
 *
 * `defaultOpen` is true on the outer fold while streaming so the user
 * sees activity; the persisted instance below an assistant bubble
 * starts closed (matches web's `OuterProcessFold` behaviour in
 * `packages/views/chat/components/chat-message-list.tsx`).
 */
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TaskMessagePayload } from "@multica/core/types";
import { coalesceTaskMessages } from "@/lib/task-timeline-coalesce";
import { Text } from "@/components/ui/text";
import { Markdown } from "@/lib/markdown";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Props {
  items: TaskMessagePayload[];
  /** Whether the owning task is still running. Drives the default-open
   *  state and the dot-pulse next to the trigger. */
  isStreaming?: boolean;
  /** Render `text` rows (the agent's narration / final answer) inline as
   *  green "Agent" rows, mirroring web's AgentTranscriptDialog. Chat leaves
   *  this false because the assistant text is rendered as the bubble body;
   *  the run-detail transcript turns it on so the interspersed agent
   *  messages appear in chronological position instead of being dropped. */
  includeText?: boolean;
  /** Override the fold's initial open state. Defaults to `isStreaming`.
   *  The run-detail transcript passes `true` so the trace is visible on
   *  open even for a terminal run. */
  defaultOpen?: boolean;
}

export function TaskTimeline({
  items,
  isStreaming = false,
  includeText = false,
  defaultOpen,
}: Props) {
  const processSteps = coalesceTaskMessages(items).filter((i) =>
    includeText ? true : i.type !== "text",
  );
  if (processSteps.length === 0) return null;

  return (
    <Collapsible defaultOpen={defaultOpen ?? isStreaming}>
      <CollapsibleTrigger asChild>
        <View
          accessibilityRole="button"
          accessibilityLabel={`${processSteps.length} step${processSteps.length === 1 ? "" : "s"}`}
          className="flex-row items-center gap-1 active:opacity-70"
        >
          <Ionicons name="chevron-forward" size={12} color="#71717a" />
          {isStreaming ? <StreamingDot /> : null}
          <Text className="text-xs text-muted-foreground">
            {processSteps.length === 1
              ? "1 step"
              : `${processSteps.length} steps`}
          </Text>
        </View>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <View className="mt-1 rounded-lg border border-border bg-muted/20 px-2 py-1.5 gap-0.5">
          {processSteps.map((item) => (
            <StepRow key={`${item.task_id}-${item.seq}`} item={item} />
          ))}
        </View>
      </CollapsibleContent>
    </Collapsible>
  );
}

function StreamingDot() {
  // Single accent dot beside the trigger so the user knows the rows
  // below may still be growing. Real "agent is alive" cue is StatusPill
  // (breathing dots) above; this is a quiet co-signal.
  return <View className="h-1.5 w-1.5 rounded-full bg-primary" />;
}

function StepRow({ item }: { item: TaskMessagePayload }) {
  switch (item.type) {
    case "text":
      return <AgentTextRow item={item} />;
    case "thinking":
      return <ThinkingRow item={item} />;
    case "tool_use":
      return <ToolCallRow item={item} />;
    case "tool_result":
      return <ToolResultRow item={item} />;
    case "error":
      return <ErrorRow item={item} />;
    default:
      return null;
  }
}

/**
 * Agent narration / answer. Only reached when the parent passes
 * `includeText` (run-detail transcript); chat filters `text` out upstream
 * and renders it as the assistant bubble body instead. Mirror of web's
 * `TranscriptEventRow` "agent" branch — a green "Agent" badge, the first
 * non-empty line as the collapsed summary, full markdown on expand.
 */
function AgentTextRow({ item }: { item: TaskMessagePayload }) {
  const text = item.content ?? "";
  if (!text) return null;
  const firstLine = text.split("\n").find((l) => l.trim().length > 0) ?? text;
  const preview =
    firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <View className="py-0.5 flex-row items-center gap-1.5 active:opacity-70">
          <Ionicons name="chevron-forward" size={12} color="#71717a" />
          <View className="rounded bg-success/15 px-1.5 py-0.5">
            <Text className="text-[10px] font-medium text-success">Agent</Text>
          </View>
          <Text
            className="flex-1 text-xs text-muted-foreground"
            numberOfLines={1}
          >
            {preview}
          </Text>
        </View>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <View className="ml-4 mt-1 rounded bg-success/5 px-2 py-1.5">
          <Markdown content={text} compact selectable={false} />
        </View>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ThinkingRow({ item }: { item: TaskMessagePayload }) {
  const text = item.content ?? "";
  if (!text) return null;
  const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <View className="py-0.5 flex-row items-start gap-1.5 active:opacity-70">
          <Ionicons
            name="bulb-outline"
            size={12}
            color="#a1a1aa"
            style={{ marginTop: 2 }}
          />
          <Text
            className="flex-1 text-xs italic text-muted-foreground"
            numberOfLines={1}
          >
            {preview}
          </Text>
        </View>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Text className="ml-4 mt-0.5 text-xs italic text-muted-foreground">
          {text}
        </Text>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolCallRow({ item }: { item: TaskMessagePayload }) {
  const summary = getToolSummary(item);
  const hasInput = !!item.input && Object.keys(item.input).length > 0;
  // If the call has no expandable input, render a non-interactive row —
  // wrapping a static row in Collapsible adds a wasted tap target.
  if (!hasInput) {
    return (
      <View className="py-0.5 flex-row items-center gap-1.5">
        <View style={{ width: 12 }} />
        <Text className="text-xs font-medium text-foreground">
          {item.tool ?? "tool"}
        </Text>
        {summary ? (
          <Text
            className="flex-1 text-xs text-muted-foreground"
            numberOfLines={1}
          >
            {summary}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <View className="py-0.5 flex-row items-center gap-1.5 active:opacity-70">
          <Ionicons name="chevron-forward" size={12} color="#71717a" />
          <Text className="text-xs font-medium text-foreground">
            {item.tool ?? "tool"}
          </Text>
          {summary ? (
            <Text
              className="flex-1 text-xs text-muted-foreground"
              numberOfLines={1}
            >
              {summary}
            </Text>
          ) : null}
        </View>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <View className="ml-4 mt-1 rounded bg-muted/40 px-2 py-1.5">
          <Text className="text-xs text-muted-foreground">
            {JSON.stringify(item.input, null, 2)}
          </Text>
        </View>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolResultRow({ item }: { item: TaskMessagePayload }) {
  const output = item.output ?? "";
  if (!output) return null;
  const preview = output.length > 80 ? `${output.slice(0, 80)}…` : output;
  const prefix = item.tool ? `${item.tool} result: ` : "result: ";
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <View className="py-0.5 flex-row items-start gap-1.5 active:opacity-70">
          <Ionicons
            name="chevron-forward"
            size={12}
            color="#71717a"
            style={{ marginTop: 2 }}
          />
          <Text
            className="flex-1 text-xs text-muted-foreground/80"
            numberOfLines={1}
          >
            <Text className="text-xs text-muted-foreground">{prefix}</Text>
            {preview}
          </Text>
        </View>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <View className="ml-4 mt-1 rounded bg-muted/40 px-2 py-1.5">
          <Text className="text-xs text-muted-foreground">
            {output.length > 4000
              ? `${output.slice(0, 4000)}\n…(truncated)`
              : output}
          </Text>
        </View>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ErrorRow({ item }: { item: TaskMessagePayload }) {
  return (
    <View className="py-0.5 flex-row items-start gap-1.5">
      <Ionicons
        name="alert-circle"
        size={12}
        color="#dc2626"
        style={{ marginTop: 2 }}
      />
      <Text className="flex-1 text-xs text-destructive" numberOfLines={3}>
        {item.content}
      </Text>
    </View>
  );
}

/**
 * Mirror of web's `getToolSummary` (chat-message-list.tsx) — picks the most
 * informative single-line summary from a tool_use payload. Order matters:
 * `query` / `file_path` / `pattern` are the headline params, `command` /
 * `prompt` get truncated, and a final loop catches whichever short string
 * a future tool might emit.
 */
function getToolSummary(item: TaskMessagePayload): string {
  if (!item.input) return "";
  const inp = item.input as Record<string, unknown>;
  const pick = (k: string): string | undefined => {
    const v = inp[k];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  const q = pick("query");
  if (q) return q;
  const fp = pick("file_path") ?? pick("path");
  if (fp) return shortenPath(fp);
  const p = pick("pattern");
  if (p) return p;
  const d = pick("description");
  if (d) return d;
  const cmd = pick("command");
  if (cmd) return cmd.length > 100 ? `${cmd.slice(0, 100)}…` : cmd;
  const prompt = pick("prompt");
  if (prompt) return prompt.length > 100 ? `${prompt.slice(0, 100)}…` : prompt;
  const skill = pick("skill");
  if (skill) return skill;
  for (const v of Object.values(inp)) {
    if (typeof v === "string" && v.length > 0 && v.length < 120) return v;
  }
  return "";
}

function shortenPath(p: string): string {
  const parts = p.split("/");
  if (parts.length <= 3) return p;
  return `…/${parts.slice(-2).join("/")}`;
}
