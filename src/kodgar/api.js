// Kodgar Terminal — real Task API client.
// One backend, one contract: everything here talks to the same
// /api/v1/tasks surface the CLI uses. No local execution, no fake
// progress: every field rendered comes from the API response.

const BASE = (() => {
  const override = new URLSearchParams(window.location.search).get("api");
  if (override) return override.replace(/\/+$/, "");
  if (window.KODGAR_API_URL) return String(window.KODGAR_API_URL).replace(/\/+$/, "");
  return "http://127.0.0.1:8844";
})();

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    let detail = `${response.status}`;
    try {
      const body = await response.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* keep status code */
    }
    throw new Error(detail);
  }
  return response.json();
}

export const api = {
  base: BASE,

  submitTask(goal, { repo, executor = "auto", projectId } = {}) {
    const payload = { goal, preferences: { executor } };
    if (repo) payload.repo = repo;
    if (projectId) payload.project_id = projectId;
    return request("/api/v1/tasks", { method: "POST", body: JSON.stringify(payload) });
  },

  listTasks(limit = 50) {
    return request(`/api/v1/tasks?limit=${limit}`);
  },

  getTask(id) {
    return request(`/api/v1/tasks/${encodeURIComponent(id)}`);
  },

  getDiff(id) {
    return request(`/api/v1/tasks/${encodeURIComponent(id)}/diff`);
  },

  getLogs(id) {
    return request(`/api/v1/tasks/${encodeURIComponent(id)}/logs`);
  },

  cancelTask(id) {
    return request(`/api/v1/tasks/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  },

  listExecutors() {
    return request("/api/v1/executors");
  },

  // SSE with exact reconnect: on error we reopen with ?after=<lastSeq>
  // so no event is lost across a reload or a dropped connection.
  streamEvents(id, { onEvent, onOpen, onDone, signal }) {
    let lastSeq = 0;
    let stopped = false;
    let attempt = 0;

    const connect = async () => {
      while (!stopped) {
        try {
          const url = `${BASE}/api/v1/tasks/${encodeURIComponent(id)}/events?after=${lastSeq}`;
          const response = await fetch(url, { signal, headers: { Accept: "text/event-stream" } });
          if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`);
          attempt = 0;
          if (onOpen) onOpen();
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let boundary;
            while ((boundary = buffer.indexOf("\n\n")) !== -1) {
              const rawFrame = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const event = parseFrame(rawFrame);
              if (!event) continue;
              if (event.type === "task.stream_end") {
                stopped = true;
                if (onDone) onDone(event.data?.state);
                return;
              }
              if (Number.isFinite(event.seq)) lastSeq = Math.max(lastSeq, event.seq);
              if (onEvent) onEvent(event);
            }
          }
        } catch (error) {
          if (signal?.aborted || stopped) return;
          attempt += 1;
          await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * attempt, 4000)));
        }
      }
    };

    connect();
    return () => {
      stopped = true;
      // Callers may hand us either an AbortController-style handle
      // (with .abort()) or an AbortSignal (abort via its controller).
      // Cleanup must never throw either way.
      try {
        if (typeof signal?.abort === "function") signal.abort();
      } catch {
        /* ignore */
      }
    };
  },
};

function parseFrame(raw) {
  const lines = raw.split("\n");
  let type = "message";
  let id = null;
  let data = "";
  for (const line of lines) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) type = line.slice(6).trim();
    else if (line.startsWith("id:")) id = line.slice(3).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    if (id !== null && Number.isFinite(Number(id)) && !Number.isFinite(parsed.seq)) {
      parsed.seq = Number(id);
    }
    return parsed;
  } catch {
    return null;
  }
}
