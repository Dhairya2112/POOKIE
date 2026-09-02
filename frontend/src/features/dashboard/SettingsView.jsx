import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export function SettingsView({ profile, updatePreference, token, onLogout }) {
  const [auditLogs, setAuditLogs] = useState([]);

  useEffect(() => {
    if (token) {
      fetch(
        `${import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`}/api/v1/agent/audit-logs/`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      )
        .then((res) => res.json())
        .then((data) => {
          if (data && data.results) {
            setAuditLogs(data.results);
          }
        })
        .catch(console.error);
    }
  }, [token]);

  return (
    <motion.div
      key="Settings"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 overflow-y-auto custom-scrollbar w-full py-10 px-10 lg:px-14 bg-transparent font-sans"
    >
      <div className="w-full max-w-5xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-wide font-display">
            Settings
          </h2>
          <p className="text-sm text-zinc-400 mt-2">
            Configure system thresholds, providers, and integration rules.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Column 1: AI & Voice */}
          <div className="space-y-6">
            <div className="glass-panel rounded-3xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white mb-2 font-display">
                AI & Engine
              </h3>
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs text-zinc-400 block mb-1.5 font-medium">
                    Provider
                  </span>
                  <select
                    value={profile?.preferences?.ai_provider || "gemini"}
                    onChange={(e) =>
                      updatePreference("ai_provider", e.target.value)
                    }
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#8052ff]/40"
                  >
                    <option value="gemini">Google Gemini (Primary)</option>
                    <option value="openrouter">OpenRouter (Fallback)</option>
                    <option value="nvidia">NVIDIA NIM (Tertiary)</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs text-zinc-400 block mb-1.5 font-medium">
                    LLM Model Name
                  </span>
                  <input
                    type="text"
                    value={profile?.preferences?.llm_model || ""}
                    onChange={(e) =>
                      updatePreference("llm_model", e.target.value)
                    }
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#8052ff]/40"
                  />
                </label>
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white mb-2 font-display">
                Audio & Voice
              </h3>
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs text-zinc-400 block mb-1.5 font-medium">
                    Language
                  </span>
                  <select
                    value={profile?.preferences?.language || "en"}
                    onChange={(e) =>
                      updatePreference("language", e.target.value)
                    }
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#8052ff]/40"
                  >
                    <option value="en">English (US)</option>
                    <option value="hi">Hindi (India)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-zinc-400 block mb-1.5 font-medium">
                    Voice Gender
                  </span>
                  <select
                    value={profile?.preferences?.tts_voice_gender || "female"}
                    onChange={(e) =>
                      updatePreference("tts_voice_gender", e.target.value)
                    }
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#8052ff]/40"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-zinc-400 block mb-1.5 font-medium">
                    Speech Speed ({profile?.preferences?.tts_speed || 1.0}x)
                  </span>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={profile?.preferences?.tts_speed || 1.0}
                    onChange={(e) =>
                      updatePreference("tts_speed", parseFloat(e.target.value))
                    }
                    className="w-full accent-[#8052ff] h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-zinc-400 block mb-1.5 font-medium">
                    Wake Word Sensitivity (
                    {profile?.preferences?.wake_word_sensitivity || 0.5})
                  </span>
                  <input
                    type="range"
                    min="0.01"
                    max="1.0"
                    step="0.01"
                    value={profile?.preferences?.wake_word_sensitivity || 0.5}
                    onChange={(e) =>
                      updatePreference(
                        "wake_word_sensitivity",
                        parseFloat(e.target.value),
                      )
                    }
                    className="w-full accent-[#8052ff] h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Column 2: Security & Sandbox */}
          <div className="space-y-6">
            <div className="glass-panel rounded-3xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white mb-2 font-display">
                System Controls & Sandbox
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-0.5">
                      Trust Mode (By-pass Permission prompts)
                    </h4>
                    <p className="text-xs text-zinc-500">
                      Allow agent to run commands without prompting.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={profile?.preferences?.trust_mode || false}
                    onChange={(e) =>
                      updatePreference("trust_mode", e.target.checked)
                    }
                    className="w-4 h-4 accent-[#8052ff] rounded border-white/10"
                  />
                </div>
                <label className="block">
                  <span className="text-xs text-zinc-400 block mb-1.5 font-medium">
                    Screenshot Permission
                  </span>
                  <select
                    value={profile?.preferences?.screenshot_preference || "ask"}
                    onChange={(e) =>
                      updatePreference("screenshot_preference", e.target.value)
                    }
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#8052ff]/40"
                  >
                    <option value="always">Always Allow</option>
                    <option value="ask">Ask Every Time</option>
                    <option value="never">Never Allow</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white mb-2 font-display">
                Account & Authentication
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-0.5">
                      Active Session
                    </h4>
                    <p className="text-xs text-zinc-500">
                      Logged in as{" "}
                      <span className="font-mono text-[#8052ff]">
                        {profile?.username || "User"}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={onLogout}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors text-xs font-bold uppercase tracking-wider"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <polyline points="16 17 21 12 16 7"></polyline>
                      <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Audit Logs Section */}
        <div className="glass-panel rounded-3xl p-6 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h3 className="text-base font-bold text-white font-display">
                Activity & Security Audit Logs
              </h3>
              <p className="text-xs text-zinc-500">
                History of all OS actions executed by the agent.
              </p>
            </div>
            <button
              onClick={() => {
                if (token) {
                  fetch(
                    `${import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`}/api/v1/agent/audit-logs/`,
                    {
                      headers: { Authorization: `Bearer ${token}` },
                    },
                  )
                    .then((res) => res.json())
                    .then((data) => {
                      if (data && data.results) setAuditLogs(data.results);
                    })
                    .catch(console.error);
                }
              }}
              className="p-2 hover:bg-white/5 rounded-xl text-zinc-400 hover:text-white transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
            </button>
          </div>

          <div className="w-full overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                  <th className="pb-3 pr-4">Action</th>
                  <th className="pb-3 pr-4">Target / Input</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3">Time</th>
                </tr>
              </thead>
              <tbody className="text-xs text-zinc-300 divide-y divide-white/5">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12">
                      <div className="flex flex-col items-center justify-center text-zinc-500 opacity-60">
                        <svg
                          className="mb-3"
                          width="48"
                          height="48"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                        <span className="text-sm tracking-wide">
                          No activity logged yet
                        </span>
                        <span className="text-[10px] mt-1">
                          Your agent's automated actions will appear here.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => {
                    let statusColor = "text-green-400";
                    if (log.status === "BLOCKED" || log.status === "DENIED")
                      statusColor = "text-red-400";
                    else if (log.status === "ERROR")
                      statusColor = "text-amber-500";

                    return (
                      <tr key={log.log_id} className="hover:bg-white/[0.01]">
                        <td className="py-3 pr-4 font-semibold text-white">
                          {log.tool_name}
                        </td>
                        <td
                          className="py-3 pr-4 max-w-xs truncate font-mono text-zinc-400"
                          title={log.tool_input}
                        >
                          {log.tool_input}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`font-semibold ${statusColor}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 text-zinc-500">
                          {new Date(log.executed_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
