/**
 * Derives task states and execution steps from conversation messages
 * and active task socket status.
 *
 * @param {Array} messages - The list of messages in the conversation
 * @param {boolean} isThinking - Socket thinking state
 * @param {boolean} isSpeaking - Socket speaking state
 * @param {string} activeStatus - The current socket status
 * @returns {Array} The derived tasks
 */
export function deriveTasksFromMessages(
  messages,
  isThinking,
  isSpeaking,
  activeStatus,
) {
  const tasks = [];
  let currentTask = null;

  messages.forEach((msg, index) => {
    if (msg.role === "user") {
      if (currentTask) {
        currentTask.status = "completed";
        tasks.push(currentTask);
      }
      currentTask = {
        id: `task-${index}`,
        command: msg.text,
        source: msg.source,
        status: "completed",
        steps: [],
        result: "",
      };
    } else if (
      (msg.role === "assistant" || msg.role === "agent") &&
      currentTask
    ) {
      currentTask.steps = [];
      currentTask.result = "";
      const lines = msg.text.split("\n");
      lines.forEach((line) => {
        if (
          line.trim().startsWith("-") ||
          line.trim().startsWith("*") ||
          line.trim().match(/^\d+\./)
        ) {
          currentTask.steps.push({
            text: line.replace(/^[-*\d.\s]+/, "").trim(),
            status: "completed",
          });
        } else {
          currentTask.result =
            (currentTask.result ? currentTask.result + "\n" : "") + line;
        }
      });
    }
  });

  if (currentTask) {
    tasks.push(currentTask);
  }

  if (tasks.length === 0) return [];

  const lastTask = tasks[tasks.length - 1];

  if (activeStatus === "cancelled") {
    lastTask.status = "cancelled";
  } else if (activeStatus === "cancelling") {
    lastTask.status = "cancelling";
  } else if (activeStatus === "failed") {
    lastTask.status = "failed";
  } else if (activeStatus === "done" && !isSpeaking) {
    lastTask.status = "completed";
  } else if (activeStatus === "done" && isSpeaking) {
    lastTask.status = "running";
  } else if (
    isThinking ||
    isSpeaking ||
    activeStatus === "running" ||
    activeStatus === "acknowledged" ||
    activeStatus === "thinking" ||
    activeStatus === "understanding"
  ) {
    lastTask.status = "running";
  } else if (activeStatus === "idle" || activeStatus === "done") {
    lastTask.status =
      lastTask.result || lastTask.steps.length ? "completed" : lastTask.status;
  } else {
    lastTask.status =
      lastTask.result || lastTask.steps.length > 0 ? "completed" : "running";
  }

  // Synthetic execution-trace steps while waiting / streaming (no bullet list yet)
  if (lastTask.status === "running" && lastTask.steps.length === 0) {
    const phase =
      activeStatus === "understanding" || activeStatus === "thinking"
        ? "analyze"
        : lastTask.result
          ? "execute"
          : activeStatus === "acknowledged" || activeStatus === "running"
            ? "read"
            : "read";

    lastTask.trace = [
      { text: "Setu is reading command...", state: "done" },
      {
        text: "Analyzing system environment...",
        state:
          phase === "read"
            ? "pending"
            : phase === "analyze"
              ? "active"
              : "done",
      },
      {
        text: "Executing request...",
        state: phase === "execute" || lastTask.result ? "active" : "pending",
      },
    ];

    if (phase === "read") {
      lastTask.trace[0].state = "active";
    }
  } else if (
    lastTask.status === "completed" ||
    lastTask.status === "failed" ||
    lastTask.status === "cancelled"
  ) {
    lastTask.trace = [
      { text: "Setu is reading command...", state: "done" },
      { text: "Analyzing system environment...", state: "done" },
      {
        text:
          lastTask.status === "cancelled"
            ? "Execution interrupted."
            : lastTask.status === "failed"
              ? "Execution failed."
              : "Executing request...",
        state: "done",
      },
    ];
  }

  // Show recent completed tasks + the latest (so chat doesn't "vanish")
  const recent = tasks.slice(-5);
  return recent;
}
