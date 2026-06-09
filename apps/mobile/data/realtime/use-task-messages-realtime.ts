/**
 * Per-task live execution trace — Layer 3.
 *
 * Mounted by the run-detail sheet (`issue/[id]/runs/[taskId]`) with the open
 * task id; cleans up on navigate-away. Streams the agent's step trace
 * (thinking / tool_use / tool_result / text / error) into the per-task
 * `task-messages` cache as the daemon reports it.
 *
 * Why per-record (and NOT mounted in the global `RealtimeSubscriptions`):
 * `task:message` fires once per agent step — high frequency — and only the
 * currently-open run has a UI consumer. A global mount would run the
 * `task_id` filter on every step of every run for every run opened this
 * session, for zero benefit once the sheet closes. The per-record mount runs
 * only while the sheet is on screen and unsubscribes on unmount.
 *
 * Events handled (all self-gated on `payload.task_id === taskId`):
 *   - task:message            → append the row to the task-messages cache
 *   - task:completed / failed /
 *     cancelled               → invalidate the issue's task-list queries so
 *                                the cached AgentTask refetches with its
 *                                terminal status. The run-detail header reads
 *                                `AgentTask.status`; refetching flips
 *                                `isActive` false → the live StatusPill
 *                                unmounts and the badge shows Done/Failed.
 *                                (The WS payload carries only ids + status,
 *                                not the full AgentTask, so invalidate — not
 *                                patch — is the correct primitive here, per
 *                                apps/mobile/CLAUDE.md "Patch over invalidate"
 *                                rule #1.)
 *   - reconnect               → invalidate this task's messages (we may have
 *                                missed rows while disconnected; the catch-up
 *                                refetch via GET /api/tasks/:id/messages
 *                                re-seeds the full trace).
 *
 * The cache + append updater are reused as-is from chat (`chat-ws-updaters`,
 * `chatKeys.taskMessages`) — the `task-messages` cache is keyed only on
 * `task_id` precisely so issue runs and chat runs share it.
 */
import { useQueryClient } from "@tanstack/react-query";
import { chatKeys } from "@/data/queries/chat";
import { issueKeys } from "@/data/queries/issue-keys";
import { useWSSubscriptions } from "@/lib/use-ws-subscriptions";
import { appendTaskMessage } from "./chat-ws-updaters";

export function useTaskMessagesRealtime(
  taskId: string | undefined,
  issueId: string | undefined,
) {
  const qc = useQueryClient();

  useWSSubscriptions(
    (ws, wsId) => {
      if (!taskId) return;

      const refreshTaskLists = () => {
        if (!issueId) return;
        qc.invalidateQueries({
          queryKey: issueKeys.activeTasks(wsId, issueId),
        });
        qc.invalidateQueries({ queryKey: issueKeys.tasks(wsId, issueId) });
      };

      return [
        ws.on("task:message", (payload) => {
          if (payload.task_id !== taskId) return;
          appendTaskMessage(qc, payload);
        }),
        ws.on("task:completed", (payload) => {
          if (payload.task_id !== taskId) return;
          refreshTaskLists();
        }),
        ws.on("task:failed", (payload) => {
          if (payload.task_id !== taskId) return;
          refreshTaskLists();
        }),
        ws.on("task:cancelled", (payload) => {
          if (payload.task_id !== taskId) return;
          refreshTaskLists();
        }),
        ws.onReconnect(() => {
          qc.invalidateQueries({
            queryKey: chatKeys.taskMessages(taskId),
          });
        }),
      ];
    },
    [taskId, issueId, qc],
  );
}
