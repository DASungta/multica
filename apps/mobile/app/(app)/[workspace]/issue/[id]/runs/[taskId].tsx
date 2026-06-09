/**
 * Agent run detail — the full execution transcript for one task, presented as
 * a formSheet. Reached by tapping a row in the runs list (`runs/index.tsx`).
 *
 *   - Live (running): `useTaskMessagesRealtime` streams `task:message` rows
 *     into the per-task cache; a "Thinking · 0:12" StatusPill shows the stage.
 *   - Historical (terminal): the same cache is lazy-loaded from
 *     GET /api/tasks/:id/messages via `taskMessagesOptions`.
 *
 * The step trace, the StatusPill, the per-task cache, and the live-append
 * updater are all shared with chat — the only issue-specific wiring is the
 * per-record realtime mount and the header built from the cached `AgentTask`.
 *
 * Android: the formSheet falls back to a plain modal (no grabber / detents) —
 * acceptable per apps/mobile/CLAUDE.md Lesson 5 (iOS is the primary target).
 */
import { useMemo } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { AgentTask, TaskMessagePayload } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { TaskTimeline } from "@/components/run/task-timeline";
import { StatusPill } from "@/components/chat/status-pill";
import {
  CancelButton,
  FAILURE_REASON_LABEL,
  StatusBadge,
  fallbackSummary,
  isActiveTask,
} from "@/components/run/run-meta";
import { taskMessagesOptions } from "@/data/queries/chat";
import {
  issueActiveTasksOptions,
  issueTasksOptions,
} from "@/data/queries/issues";
import { useTaskMessagesRealtime } from "@/data/realtime/use-task-messages-realtime";
import { useActorLookup } from "@/data/use-actor-name";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useAgentPresence } from "@/lib/use-agent-presence";
import { timeAgo } from "@/lib/time-ago";

export default function IssueRunDetailRoute() {
  const { id: issueId, taskId } = useLocalSearchParams<{
    id: string;
    taskId: string;
  }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  // Both caches were populated by the runs list the user tapped through; we
  // find the AgentTask there instead of refetching a single task.
  const { data: activeTasks = [], isLoading: activeLoading } = useQuery(
    issueActiveTasksOptions(wsId, issueId),
  );
  const { data: allTasks = [], isLoading: allLoading } = useQuery(
    issueTasksOptions(wsId, issueId),
  );

  const task = useMemo<AgentTask | undefined>(
    () =>
      activeTasks.find((t) => t.id === taskId) ??
      allTasks.find((t) => t.id === taskId),
    [activeTasks, allTasks, taskId],
  );

  // Stream live steps + keep the header status fresh while this sheet is open.
  // Per-record: unsubscribes on unmount (sheet dismiss). See the hook for why
  // this isn't a global subscription.
  useTaskMessagesRealtime(taskId, issueId);

  const { data: messages = [] } = useQuery(taskMessagesOptions(taskId));

  if (!task) {
    // Cold deep-link: both lists still loading → spinner; otherwise the task
    // genuinely isn't cached (deleted / wrong workspace) → graceful fallback.
    return (
      <View className="flex-1 items-center justify-center px-6">
        {activeLoading || allLoading ? (
          <ActivityIndicator />
        ) : (
          <Text className="text-sm text-muted-foreground">Run not found</Text>
        )}
      </View>
    );
  }

  return (
    <RunDetailBody task={task} issueId={issueId} messages={messages} />
  );
}

function RunDetailBody({
  task,
  issueId,
  messages,
}: {
  task: AgentTask;
  issueId: string;
  messages: TaskMessagePayload[];
}) {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { getName } = useActorLookup();
  const presence = useAgentPresence(wsId, task.agent_id);
  const availability = presence === "loading" ? undefined : presence.availability;

  const active = isActiveTask(task);
  const summary = task.trigger_summary?.trim() || fallbackSummary(task);
  const timestamp = task.completed_at || task.created_at;

  // Synthesize a ChatPendingTask-shaped object so StatusPill's stage logic +
  // elapsed timer (a mirror of web's) can be reused for the run-detail header.
  const pendingTask = active
    ? { task_id: task.id, status: task.status, created_at: task.created_at }
    : null;

  return (
    <View className="flex-1">
      {/* Header — SHEET_OPTIONS sets headerShown:false, so the body owns it. */}
      <View className="px-4 pt-4 pb-3 flex-row items-start gap-3">
        <ActorAvatar type="agent" id={task.agent_id} size={32} showPresence />
        <View className="flex-1 gap-1">
          <Text
            className="text-base font-semibold text-foreground"
            numberOfLines={1}
          >
            {getName("agent", task.agent_id)}
          </Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={3}>
            {summary}
          </Text>
          <View className="flex-row items-center gap-2 pt-0.5">
            <StatusBadge task={task} />
            <Text className="text-xs text-muted-foreground">
              {timestamp ? timeAgo(timestamp) : ""}
            </Text>
          </View>
        </View>
        {active ? <CancelButton taskId={task.id} issueId={issueId} /> : null}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        // Android: this sheet falls back to a draggable bottom-sheet modal.
        // Without nested scrolling, a downward drag once the content is
        // scrolled hands the gesture to the sheet (drags the whole control)
        // instead of scrolling the transcript back up. No-op on iOS, where
        // UISheetPresentationController already coordinates scroll vs. drag.
        nestedScrollEnabled
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      >
        <View className="gap-3">
          {/* Live status line — only while running. Unmounts when the task
              reaches a terminal status (the realtime hook refetches the
              AgentTask, flipping `active` false). */}
          {pendingTask ? (
            <StatusPill
              pendingTask={pendingTask}
              taskMessages={messages}
              availability={availability}
            />
          ) : null}

          {/* Full transcript (coalesced inside TaskTimeline). Unlike chat,
              this view passes `includeText` so the agent's narration / answer
              renders inline as green "Agent" rows in chronological order,
              mirroring web's AgentTranscriptDialog; `defaultOpen` shows the
              trace without a tap since this sheet IS the transcript. */}
          <TaskTimeline
            items={messages}
            isStreaming={active}
            includeText
            defaultOpen
          />

          {/* Failure summary above the trace's own error rows. */}
          {task.status === "failed" ? <FailureNotice task={task} /> : null}

          {/* Terminal run with nothing recorded (e.g. cancelled before any
              step) — say so rather than render an empty sheet. */}
          {messages.length === 0 && !active && task.status !== "failed" ? (
            <Text className="text-sm text-muted-foreground">
              No transcript recorded for this run.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function FailureNotice({ task }: { task: AgentTask }) {
  const reason = task.failure_reason
    ? FAILURE_REASON_LABEL[task.failure_reason]
    : undefined;
  const detail = task.error?.trim();
  return (
    <View className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 gap-1">
      <Text className="text-xs font-semibold text-destructive">
        {reason ? `Failed · ${reason}` : "Failed"}
      </Text>
      {detail ? (
        <Text className="text-xs text-muted-foreground">{detail}</Text>
      ) : null}
    </View>
  );
}
