// Kodgar Terminal — live task state hook.
// Restores real state on mount (task list + per-task detail), then
// keeps it fresh over the SSE stream with exact reconnect. Nothing
// here invents progress: the store mirrors the API.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const TERMINAL_STATES = new Set(["COMPLETED", "FAILED", "BLOCKED", "CANCELLED"]);
const MAX_HISTORY = 800;

export function useKodgarTasks() {
  const [tasks, setTasks] = useState([]);
  const [counts, setCounts] = useState({});
  const [executors, setExecutors] = useState({});
  const [connectionError, setConnectionError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [listData, executorStatus] = await Promise.all([
        api.listTasks(100),
        api.listExecutors().catch(() => ({})),
      ]);
      setTasks(listData.tasks || []);
      setCounts(listData.counts || {});
      // /executors returns { executors: {id: health, ...} } — unwrap
      // so consumers see the per-id health map directly.
      setExecutors(executorStatus?.executors || executorStatus || {});
      setConnectionError("");
    } catch (error) {
      setConnectionError(error.message || "Kodgar API unreachable");
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { tasks, counts, executors, connectionError, refresh };
}

export function useTaskStream(taskId) {
  const [task, setTask] = useState(null);
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const lastStateRef = useRef(null);

  // Restore the real state snapshot first (covers reload/reconnect),
  // then replay the stored events after it.
  useEffect(() => {
    if (!taskId) {
      setTask(null);
      setEvents([]);
      return undefined;
    }
    let cancelled = false;
    setTask(null);
    setEvents([]);
    lastStateRef.current = null;

    api
      .getTask(taskId)
      .then((detail) => {
        if (!cancelled) setTask(detail);
      })
      .catch((error) => {
        if (!cancelled) setTask({ id: taskId, error: error.message, state: "UNKNOWN" });
      });

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return undefined;
    const controller = new AbortController();
    const stop = api.streamEvents(taskId, {
      signal: controller.signal,
      onOpen: () => setConnected(true),
      onDone: () => setConnected(false),
      onEvent: (event) => {
        setEvents((prev) => {
          const next = [...prev, event];
          return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
        });
        if (event.type === "task.state") {
          const state = event.data?.state;
          if (state) {
            lastStateRef.current = state;
            setTask((prev) => (prev ? { ...prev, state, progress: event.data?.progress ?? prev.progress, current_step: event.data?.current_step ?? prev.current_step } : prev));
          }
        } else if (event.type === "task.completed" || event.type === "task.failed" || event.type === "task.cancelled" || event.type === "task.blocked") {
          // Refetch the authoritative snapshot so the result page shows
          // the real commit, tests and verification — not a guess.
          api
            .getTask(taskId)
            .then((detail) => setTask(detail))
            .catch(() => {});
        }
      },
    });
    return () => {
      stop();
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
    };
  }, [taskId]);

  return { task, events, connected };
}

export function isTerminal(state) {
  return TERMINAL_STATES.has(String(state || "").toUpperCase());
}
