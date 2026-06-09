/**
 * Single row inside the agent-runs formSheet route
 * (`app/(app)/[workspace]/issue/[id]/runs/index.tsx`). Same component for
 * active and past tasks — the trailing Cancel button is conditional on
 * `status in {queued, dispatched, running}`, and the status badge / colour
 * swaps based on the AgentTask.status enum.
 *
 * Tapping the row (`onPress`) opens the run-detail transcript sheet. The
 * trailing Cancel button sits OUTSIDE the row Pressable so its destructive
 * tap never doubles as a row navigation.
 */
import { Pressable, View } from "react-native";
import type { AgentTask } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import {
  CancelButton,
  StatusBadge,
  fallbackSummary,
  isActiveTask,
} from "@/components/run/run-meta";
import { useActorLookup } from "@/data/use-actor-name";
import { timeAgo } from "@/lib/time-ago";

interface Props {
  task: AgentTask;
  issueId: string;
  /** Open the run-detail transcript sheet. */
  onPress?: () => void;
}

export function RunRow({ task, issueId, onPress }: Props) {
  const { getName } = useActorLookup();
  const isActive = isActiveTask(task);
  const summary = task.trigger_summary?.trim() || fallbackSummary(task);
  // Past tasks use completed_at when present (server fills it for terminal
  // statuses); active tasks fall back to created_at so the user sees how
  // long it's been waiting.
  const timestamp = task.completed_at || task.created_at;

  return (
    <View className="flex-row items-start gap-3 py-2">
      <Pressable
        onPress={onPress}
        className="flex-1 flex-row items-start gap-3 active:opacity-60"
      >
        <ActorAvatar type="agent" id={task.agent_id} size={28} showPresence />
        <View className="flex-1 gap-1">
          <Text className="text-sm text-foreground" numberOfLines={2}>
            <Text className="font-medium">
              {getName("agent", task.agent_id)}
            </Text>
            <Text className="text-muted-foreground"> · {summary}</Text>
          </Text>
          <View className="flex-row items-center gap-2">
            <StatusBadge task={task} />
            <Text className="text-xs text-muted-foreground">
              {timestamp ? timeAgo(timestamp) : ""}
            </Text>
          </View>
        </View>
      </Pressable>
      {isActive ? <CancelButton taskId={task.id} issueId={issueId} /> : null}
    </View>
  );
}
