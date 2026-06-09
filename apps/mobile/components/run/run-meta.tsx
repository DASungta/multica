/**
 * Shared metadata bits for an agent run (`AgentTask`), used by both the
 * run-list row (`components/issue/run-row.tsx`) and the run-detail sheet
 * (`issue/[id]/runs/[taskId]`). Promoted out of `run-row.tsx` so the status
 * badge / labels / colours and the cancel affordance can't drift between the
 * row and the detail header.
 */
import { Alert, Pressable } from "react-native";
import type { AgentTask, TaskFailureReason } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { useCancelTask } from "@/data/mutations/issues";

export const ACTIVE_STATUSES: readonly AgentTask["status"][] = [
  "queued",
  "dispatched",
  "running",
];

export function isActiveTask(task: AgentTask): boolean {
  return ACTIVE_STATUSES.includes(task.status);
}

export const STATUS_LABEL: Record<AgentTask["status"], string> = {
  queued: "Queued",
  dispatched: "Starting",
  waiting_local_directory: "Waiting for directory",
  running: "Running",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const STATUS_CLASS: Record<AgentTask["status"], string> = {
  queued: "text-muted-foreground",
  dispatched: "text-brand",
  waiting_local_directory: "text-muted-foreground",
  running: "text-brand",
  completed: "text-muted-foreground",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
};

export const FAILURE_REASON_LABEL: Record<TaskFailureReason, string> = {
  agent_error: "Agent error",
  timeout: "Timeout",
  codex_semantic_inactivity: "Codex inactivity",
  runtime_offline: "Runtime offline",
  runtime_recovery: "Runtime recovery",
  manual: "Manual",
};

export function fallbackSummary(task: AgentTask): string {
  switch (task.kind) {
    case "comment":
      return "Comment task";
    case "autopilot":
      return "Autopilot run";
    case "chat":
      return "Chat task";
    case "quick_create":
      return "Quick create";
    case "direct":
    default:
      return "Task";
  }
}

export function StatusBadge({ task }: { task: AgentTask }) {
  const label = STATUS_LABEL[task.status] ?? task.status;
  const cls = STATUS_CLASS[task.status] ?? "text-muted-foreground";
  // For failed tasks, surface the failure_reason inline so users don't have
  // to drill in. Reasons are coarse enums; missing/empty stays as just "Failed".
  if (task.status === "failed" && task.failure_reason) {
    const reasonLabel = FAILURE_REASON_LABEL[task.failure_reason];
    if (reasonLabel) {
      return (
        <Text className={`text-xs ${cls}`}>
          {label} · {reasonLabel}
        </Text>
      );
    }
  }
  return <Text className={`text-xs ${cls}`}>{label}</Text>;
}

export function CancelButton({
  taskId,
  issueId,
}: {
  taskId: string;
  issueId: string;
}) {
  const mutation = useCancelTask(issueId);

  const onPress = () => {
    Alert.alert(
      "Cancel task?",
      "The agent will stop after the current step.",
      [
        { text: "Keep running", style: "cancel" },
        {
          text: "Cancel task",
          style: "destructive",
          onPress: () => mutation.mutate(taskId),
        },
      ],
    );
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={mutation.isPending}
      className="px-3 py-1.5 rounded-md bg-secondary active:opacity-70"
    >
      <Text className="text-xs font-medium text-foreground">Cancel</Text>
    </Pressable>
  );
}
