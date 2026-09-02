import { useState, useEffect, useRef, useCallback } from "react";
import { useAudioAnalyser } from "../hooks/useAudioAnalyser";
import { useAgentSocket } from "../hooks/useAgentSocket";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { SetuLogo } from "../components/SetuLogo";
import { deriveTasksFromMessages } from "../utils/taskUtils";
import { SettingsView } from "../features/dashboard/SettingsView";
import { QRCodeSVG } from "qrcode.react";

const getClientOS = () => {
  const ua = window.navigator.userAgent;
  if (ua.indexOf("Windows NT 10.0") !== -1) return "Windows 11/10 Host";
  if (ua.indexOf("Macintosh") !== -1) return "macOS Host";
  if (ua.indexOf("Linux") !== -1) return "Linux Host";
  if (ua.indexOf("Android") !== -1) return "Android Device";
  if (ua.indexOf("iPhone") !== -1 || ua.indexOf("iPad") !== -1)
    return "iOS Device";
  return "Local Host";
};

const getClientBrowser = () => {
  const ua = window.navigator.userAgent;
  if (ua.indexOf("Chrome") !== -1 && ua.indexOf("Edg") === -1)
    return "Chrome Browser";
  if (ua.indexOf("Safari") !== -1 && ua.indexOf("Chrome") === -1)
    return "Safari Browser";
  if (ua.indexOf("Firefox") !== -1) return "Firefox Browser";
  if (ua.indexOf("Edg") !== -1) return "Edge Browser";
  return "Web Client";
};

const formatProvider = (prov) => {
  if (!prov) return "Google Gemini";
  switch (prov.toLowerCase()) {
    case "gemini":
      return "Google Gemini";
    case "openrouter":
      return "OpenRouter";
    case "nvidia":
      return "NVIDIA NIM";
    default:
      return prov;
  }
};

export function Dashboard() {
  const navigate = useNavigate();
  const { token, conversationId, setConversationId, setUsername, logout } =
    useAppStore();
  const [activeTab, setActiveTabState] = useState(() => {
    return localStorage.getItem("setu_active_tab") || "TaskFeed";
  });

  const setActiveTab = (tab) => {
    localStorage.setItem("setu_active_tab", tab);
    setActiveTabState(tab);
  };

  const messagesContainerRef = useRef(null);

  // Reminders State
  const [toasts, setToasts] = useState([]);

  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [showTaskStream, setShowTaskStream] = useState(false);

  // Mobile Pairing State
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pairingData, setPairingData] = useState(null);

  const handlePairDevice = async () => {
    setShowPairingModal(true);
    setPairingData(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`}/api/v1/user/mobile-pairing/`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        return;
      }
      const data = await res.json();
      setPairingData(data);
    } catch (err) {
      console.error(err);
    }
  };

  const {
    messages,
    isThinking,
    isSpeaking,
    sendCommand,
    stopSpeaking,
    activeStatus,
    cancelTask,
    permissionRequest,
    resolvePermissionRequest,
    mobileConnected,
    connectedDeviceName,
  } = useAgentSocket({
    token,
    conversationId,
    onReminderFired: (reminder) => {
      try {
        const audioCtx = new (
          window.AudioContext || window.webkitAudioContext
        )();
        const playBeep = (freq, duration, startTime) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);

          osc.frequency.setValueAtTime(freq, startTime);
          gain.gain.setValueAtTime(0.15, startTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

          osc.start(startTime);
          osc.stop(startTime + duration);
        };
        const now = audioCtx.currentTime;
        playBeep(880, 0.1, now);
        playBeep(1200, 0.15, now + 0.1);
      } catch (e) {
        console.warn("Could not play audio notification:", e);
      }

      const toastId = Math.random().toString();
      setToasts((prev) => [
        ...prev,
        { id: toastId, title: reminder.title, body: reminder.body },
      ]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
      }, 8000);
    },
    onSwitchConversation: (newId) => {
      setConversationId(newId);
    },
  });

  const { startListening, stopListening, isActive, getNormalizedEnergy } =
    useAudioAnalyser();
  const [audioLevel, setAudioLevel] = useState(0);

  const handleLogout = useCallback(() => {
    logout();
    navigate("/auth");
  }, [logout, navigate]);

  useEffect(() => {
    if (mobileConnected) {
      setTimeout(() => setShowPairingModal(false), 0);
    }
  }, [mobileConnected]);

  // Poll audio level when listening
  useEffect(() => {
    let animationFrameId;

    const updateAudioLevel = () => {
      if (isActive) {
        setAudioLevel(getNormalizedEnergy());
        animationFrameId = requestAnimationFrame(updateAudioLevel);
      } else {
        setAudioLevel(0);
      }
    };

    if (isActive) {
      updateAudioLevel();
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isActive, getNormalizedEnergy]);

  // Autoscroll message container
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isThinking, activeTab]);

  const toggleListen = async () => {
    if (
      isSpeaking ||
      activeStatus === "running" ||
      activeStatus === "thinking"
    ) {
      stopSpeaking();
      cancelTask();
      return;
    }
    if (isActive) {
      stopListening();
    } else {
      await startListening((transcript) => {
        sendCommand(transcript);
      });
    }
  };

  const sidebarNavItems = [
    {
      id: "TaskFeed",
      icon: (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="22"></line>
        </svg>
      ),
      label: "Task Feed",
    },
    {
      id: "History",
      icon: (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      ),
      label: "History",
    },
    {
      id: "Devices",
      icon: (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
          <line x1="12" y1="18" x2="12.01" y2="18"></line>
        </svg>
      ),
      label: "Devices",
    },
    {
      id: "Memory",
      icon: (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
      ),
      label: "Memory",
    },
  ];

  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [profile, setProfile] = useState({
    username: "daved",
    email: "daved@setu.local",
    user_id: "usr_01j1wg5c82feae15ab00",
    preferences: {
      ai_provider: "gemini",
      llm_mode: "Cloud-Only",
      llm_model: "gemini-2.5-flash",
      theme: "Aether Obsidian",
      language: "English (US)",
    },
  });

  // Load history
  useEffect(() => {
    if (activeTab === "History" && token) {
      setTimeout(() => setIsLoadingHistory(true), 0);
      fetch(
        `${import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`}/api/v1/conversations/`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      )
        .then((res) => res.json())
        .then((data) => {
          if (data && data.results) {
            setHistory(data.results);
          }
        })
        .catch(console.error)
        .finally(() => setIsLoadingHistory(false));
    }
  }, [activeTab, token]);

  // Load profile
  useEffect(() => {
    if (token) {
      fetch(
        `${import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`}/api/v1/user/profile/`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      )
        .then((res) => res.json())
        .then((data) => {
          setProfile(data);
          if (data?.username) {
            setUsername(data.username);
          }
        })
        .catch(console.error);
    }
  }, [token, setUsername]);

  // Load audit logs

  const updatePreference = (key, value) => {
    if (!token) return;
    const updatedPreferences = {
      ...profile?.preferences,
      [key]: value,
    };
    fetch(
      `${import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`}/api/v1/user/profile/`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ preferences: updatedPreferences }),
      },
    )
      .then((res) => res.json())
      .then((data) => {
        setProfile(data);
      })
      .catch(console.error);
  };

  const getTasksFromMessages = () => {
    return deriveTasksFromMessages(
      messages,
      isThinking,
      isSpeaking,
      activeStatus,
    );
  };

  const hasActiveTask = getTasksFromMessages().some(
    (t) => t.status === "running" || t.status === "cancelling",
  );
  const isCancelling = getTasksFromMessages().some(
    (t) => t.status === "cancelling",
  );

  useEffect(() => {
    if (hasActiveTask) {
      const timer = setTimeout(() => {
        setShowTaskStream(true);
      }, 0);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        setShowTaskStream(false);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [hasActiveTask]);

  const aiProviderFormatted = formatProvider(profile?.preferences?.ai_provider);

  return (
    <div className="w-full h-full relative overflow-hidden bg-transparent">
      {/* Floating Translucent Icon Sidebar */}
      <aside className="brand-sidebar">
        {/* Brand Icon floating */}
        <div className="brand-logo-wrapper group/brand">
          <div className="w-12 h-12 flex items-center justify-center shrink-0">
            <SetuLogo size={20} />
          </div>
          <span className="whitespace-nowrap text-lg font-black tracking-widest text-white opacity-0 group-hover/brand:opacity-100 transition-opacity duration-300 ml-1 font-display">
            SETU
          </span>
        </div>

        {/* Navigation items */}
        <nav className="flex flex-col gap-3 pointer-events-auto">
          {sidebarNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex items-center h-12 rounded-2xl transition-all duration-300 group/btn overflow-hidden shadow-lg w-12 ${
                activeTab === item.id
                  ? "lg:w-48"
                  : "lg:hover:w-48 bg-white/5 border border-white/10 hover:bg-white/10 backdrop-blur-md"
              }`}
            >
              {activeTab === item.id && (
                <motion.div
                  layoutId="sidebarActiveTab"
                  className="absolute inset-0 bg-gradient-to-r from-[#8052ff]/20 to-[#592be8]/20 border border-[#8052ff]/40 rounded-2xl shadow-[inset_0_0_15px_rgba(128,82,255,0.1),0_0_15px_rgba(128,82,255,0.2)]"
                  initial={false}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <div
                className={`absolute left-0 w-12 h-12 flex items-center justify-center shrink-0 transition-colors z-10 ${activeTab === item.id ? "text-[#8052ff]" : "text-zinc-500 group-hover/btn:text-white"}`}
              >
                {item.icon}
              </div>
              <span
                className={`absolute left-12 whitespace-nowrap text-sm font-semibold tracking-wide transition-opacity duration-300 z-10 ${activeTab === item.id ? "text-white opacity-100 lg:opacity-100" : "text-zinc-300 opacity-0 lg:group-hover/btn:opacity-100"}`}
              >
                {item.label}
              </span>
            </button>
          ))}
        </nav>

        {/* Bottom Settings item */}
        <div className="mt-auto pointer-events-auto">
          <button
            onClick={() => setActiveTab("Settings")}
            className={`relative flex items-center h-12 rounded-2xl transition-all duration-300 group/btn overflow-hidden shadow-lg w-12 ${
              activeTab === "Settings"
                ? "lg:w-48"
                : "lg:hover:w-48 bg-white/5 border border-white/10 hover:bg-white/10 backdrop-blur-md"
            }`}
          >
            {activeTab === "Settings" && (
              <motion.div
                layoutId="sidebarActiveTab"
                className="absolute inset-0 bg-gradient-to-r from-[#8052ff]/20 to-[#592be8]/20 border border-[#8052ff]/40 rounded-2xl shadow-[inset_0_0_15px_rgba(128,82,255,0.1),0_0_15px_rgba(128,82,255,0.2)]"
                initial={false}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <div
              className={`absolute left-0 w-12 h-12 flex items-center justify-center shrink-0 transition-colors z-10 ${activeTab === "Settings" ? "text-[#8052ff]" : "text-zinc-500 group-hover/btn:text-white"}`}
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </div>
            <span
              className={`absolute left-12 whitespace-nowrap text-sm font-semibold tracking-wide transition-opacity duration-300 z-10 ${activeTab === "Settings" ? "text-white opacity-100 lg:opacity-100" : "text-zinc-300 opacity-0 lg:group-hover/btn:opacity-100"}`}
            >
              Settings
            </span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Area - Transparent everywhere to keep Neural Mesh visible */}
      <main className="main-content-area">
        {/* Content Tabs Wrapper */}
        <div className="flex-1 flex flex-col relative w-full h-full overflow-hidden">
          {/* TABS CONTAINER */}
          <AnimatePresence mode="wait">
            {/* 1. TASK FEED VIEW */}
            {activeTab === "TaskFeed" && (
              <motion.div
                key="TaskFeed"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="flex-1 flex flex-col w-full h-full relative overflow-hidden"
              >
                {/* Content Area */}
                {!showTaskStream ? (
                  /* Idle Centered State */
                  <div className="flex-1 flex flex-col items-center justify-center text-center relative p-6 lg:p-10 w-full max-w-4xl mx-auto min-h-0">
                    <div className="ambient-gradient"></div>

                    {/* Top Telemetry Badges Strip */}
                    <div className="flex flex-wrap items-center justify-center gap-3 mb-6 select-none z-20 relative">
                      <div
                        className="badge-status"
                        title={profile?.preferences?.llm_model || ""}
                      >
                        <span className="dot-indicator bg-[#8052ff]"></span>
                        <span className="text-zinc-500">LLM:</span>
                        <span className="font-semibold">
                          {aiProviderFormatted}
                        </span>
                      </div>
                      <div className="badge-status">
                        <span className="dot-indicator bg-purple-400"></span>
                        <span className="text-zinc-500">TTS:</span>
                        <span className="font-semibold">Kokoro</span>
                      </div>
                      <div className="badge-status">
                        <span className="dot-indicator bg-[var(--color-accent-mint)]"></span>
                        <span className="text-zinc-500">Mic Energy:</span>
                        <span className="font-semibold">
                          {Math.floor(audioLevel * 100)}%
                        </span>
                      </div>
                    </div>

                    <h2 className="title-display">
                      {isSpeaking
                        ? "Setu is speaking"
                        : isActive
                          ? "I'm listening..."
                          : "Awaiting Command"}
                    </h2>
                    <p className="text-zinc-400 text-sm max-w-sm mx-auto mb-10 select-none z-10 h-5 flex items-center justify-center">
                      {isSpeaking ? (
                        <span className="text-zinc-500 text-[10px] tracking-wide font-mono animate-pulse">
                          Tip: Wear headphones to prevent speaker feedback from
                          triggering barge-in
                        </span>
                      ) : (
                        "Speak naturally or click the core voice node to toggle listening."
                      )}
                    </p>

                    {/* Bioluminescent core orb */}
                    <div className="relative w-64 h-64 flex items-center justify-center mb-8">
                      <div
                        className={`absolute w-56 h-56 border border-dashed rounded-full animate-[spin_50s_linear_infinite] pointer-events-none transition-colors duration-1000 ${isSpeaking ? "border-emerald-500/30" : isThinking ? "border-blue-500/30" : "border-[#8052ff]/20"}`}
                      />
                      <div
                        className={`absolute w-44 h-44 border border-dashed rounded-full animate-[spin_25s_linear_infinite_reverse] pointer-events-none transition-colors duration-1000 ${isSpeaking ? "border-emerald-500/40" : isThinking ? "border-blue-500/40" : "border-[#8052ff]/30"}`}
                      />

                      <div className="relative group z-10">
                        <AnimatePresence>
                          {(isActive || isSpeaking) && (
                            <motion.div
                              initial={{ scale: 0.9, opacity: 0 }}
                              animate={{
                                scale: isSpeaking ? [1, 1.15, 1] : [1, 1.3, 1],
                                opacity: isSpeaking
                                  ? [0.4, 0.1, 0.4]
                                  : [0.6, 0, 0.6],
                              }}
                              exit={{ opacity: 0 }}
                              transition={{
                                repeat: Infinity,
                                duration: isSpeaking ? 1.2 : 2,
                                ease: "easeInOut",
                              }}
                              className={`absolute inset-0 rounded-full blur-xl pointer-events-none transition-colors duration-1000 ${isSpeaking ? "bg-emerald-500/40" : isThinking ? "bg-blue-500/40" : "bg-[#8052ff]/30"}`}
                            />
                          )}
                        </AnimatePresence>

                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={toggleListen}
                          disabled={isThinking}
                          className={`relative z-20 w-28 h-28 rounded-full flex flex-col items-center justify-center transition-all duration-500 border ${
                            isThinking
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                              : isSpeaking
                                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                                : isActive
                                  ? "bg-[#8052ff]/20 border-white text-white shadow-[inset_0_0_15px_rgba(128,82,255,0.2),0_0_20px_rgba(128,82,255,0.3)]"
                                  : "bg-white/5 border-white/10 hover:bg-white/10 text-white shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]"
                          }`}
                        >
                          <div className="relative z-10 flex flex-col items-center justify-center font-sans">
                            {isSpeaking ? (
                              <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <rect
                                  x="4"
                                  y="4"
                                  width="16"
                                  height="16"
                                  rx="2"
                                  ry="2"
                                ></rect>
                              </svg>
                            ) : isActive ? (
                              <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                              >
                                <rect x="6" y="4" width="4" height="16"></rect>
                                <rect x="14" y="4" width="4" height="16"></rect>
                              </svg>
                            ) : (
                              <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                <line x1="12" y1="19" x2="12" y2="22"></line>
                              </svg>
                            )}
                            <span className="text-[9px] font-mono font-semibold tracking-widest mt-2 uppercase text-zinc-300 select-none">
                              {isSpeaking
                                ? "STOP"
                                : isActive
                                  ? "LISTENING"
                                  : "TALK"}
                            </span>
                          </div>
                        </motion.button>
                      </div>
                    </div>

                    {/* Active Voice Speech Bubble */}
                    {messages.length > 0 &&
                      messages[messages.length - 1].role === "user" && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-zinc-300 text-xs bg-white/[0.02] border border-white/5 px-5 py-2.5 rounded-2xl backdrop-blur-md max-w-xs z-10 mt-4"
                        >
                          "{messages[messages.length - 1].text}"
                        </motion.div>
                      )}
                  </div>
                ) : (
                  /* Two-Column Cockpit Layout */
                  <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 p-6 lg:p-10 min-h-0 w-full overflow-hidden">
                    {/* Left Column - Voice Orb centerpiece (5 cols) */}
                    <div className="lg:col-span-5 flex flex-col items-center justify-center text-center relative min-h-0">
                      <div className="ambient-gradient"></div>

                      {/* Top Telemetry Badges Strip */}
                      <div className="flex flex-wrap items-center justify-center gap-3 mb-6 select-none z-20 relative">
                        <div
                          className="badge-status"
                          title={profile?.preferences?.llm_model || ""}
                        >
                          <span className="dot-indicator bg-[#8052ff]"></span>
                          <span className="text-zinc-500">LLM:</span>
                          <span className="font-semibold">
                            {aiProviderFormatted}
                          </span>
                        </div>
                        <div className="badge-status">
                          <span className="dot-indicator bg-purple-400"></span>
                          <span className="text-zinc-500">TTS:</span>
                          <span className="font-semibold">Kokoro</span>
                        </div>
                        <div className="badge-status">
                          <span className="dot-indicator bg-[var(--color-accent-mint)]"></span>
                          <span className="text-zinc-500">Mic Energy:</span>
                          <span className="font-semibold">
                            {Math.floor(audioLevel * 100)}%
                          </span>
                        </div>
                      </div>

                      <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight select-none font-display z-10">
                        {isSpeaking
                          ? "Setu is speaking"
                          : isActive
                            ? "I'm listening..."
                            : "Awaiting Command"}
                      </h2>
                      <p className="text-zinc-400 text-xs max-w-xs mx-auto mb-8 select-none z-10 h-5 flex items-center justify-center">
                        {isSpeaking ? (
                          <span className="text-zinc-500 text-[10px] tracking-wide font-mono animate-pulse">
                            🎧 Tip: Wear headphones to prevent speaker feedback
                            from triggering barge-in
                          </span>
                        ) : (
                          "Speak naturally or click the core voice node to toggle listening."
                        )}
                      </p>

                      {/* Bioluminescent core orb */}
                      <div className="relative w-60 h-60 flex items-center justify-center mb-6">
                        <div className="absolute w-52 h-52 border border-dashed border-[#8052ff]/20 rounded-full animate-[spin_50s_linear_infinite] pointer-events-none" />
                        <div className="absolute w-40 h-40 border border-dashed border-[var(--color-accent-purple)]/30 rounded-full animate-[spin_25s_linear_infinite_reverse] pointer-events-none" />

                        <div className="relative group z-10">
                          <AnimatePresence>
                            {(isActive || isSpeaking) && (
                              <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{
                                  scale: isSpeaking
                                    ? [1, 1.15, 1]
                                    : [1, 1.3, 1],
                                  opacity: isSpeaking
                                    ? [0.4, 0.1, 0.4]
                                    : [0.6, 0, 0.6],
                                }}
                                exit={{ opacity: 0 }}
                                transition={{
                                  repeat: Infinity,
                                  duration: isSpeaking ? 1.2 : 2,
                                  ease: "easeInOut",
                                }}
                                className={`absolute inset-0 rounded-full blur-xl pointer-events-none ${isSpeaking ? "bg-amber-500/20" : "bg-[#8052ff]/20"}`}
                              />
                            )}
                          </AnimatePresence>

                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={toggleListen}
                            disabled={isThinking}
                            className={`relative z-20 w-24 h-24 rounded-full flex flex-col items-center justify-center transition-all duration-500 border ${
                              isThinking
                                ? "bg-zinc-800/20 border-zinc-700 text-zinc-500 cursor-not-allowed"
                                : isSpeaking
                                  ? "bg-amber-500/10 border-amber-500/40 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                                  : isActive
                                    ? "bg-[#8052ff]/20 border-white text-white shadow-[0_0_20px_rgba(128,82,255,0.3)]"
                                    : "bg-white/5 border-white/10 hover:bg-white/10 text-white"
                            }`}
                          >
                            <div className="relative z-10 flex flex-col items-center justify-center font-sans">
                              {isSpeaking ? (
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <rect
                                    x="4"
                                    y="4"
                                    width="16"
                                    height="16"
                                    rx="2"
                                    ry="2"
                                  ></rect>
                                </svg>
                              ) : isActive ? (
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                >
                                  <rect
                                    x="6"
                                    y="4"
                                    width="4"
                                    height="16"
                                  ></rect>
                                  <rect
                                    x="14"
                                    y="4"
                                    width="4"
                                    height="16"
                                  ></rect>
                                </svg>
                              ) : (
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
                                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                  <line x1="12" y1="19" x2="12" y2="22"></line>
                                </svg>
                              )}
                              <span className="text-[8px] font-mono font-semibold tracking-widest mt-1.5 uppercase text-zinc-300 select-none">
                                {isSpeaking
                                  ? "STOP"
                                  : isActive
                                    ? "LISTENING"
                                    : "TALK"}
                              </span>
                            </div>
                          </motion.button>
                        </div>
                      </div>

                      {/* Active Voice Speech Bubble */}
                      {messages.length > 0 &&
                        messages[messages.length - 1].role === "user" && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-zinc-300 text-xs bg-white/[0.02] border border-white/5 px-5 py-2.5 rounded-2xl backdrop-blur-md max-w-xs z-10 mt-4"
                          >
                            "{messages[messages.length - 1].text}"
                          </motion.div>
                        )}
                    </div>

                    {/* Right Column - Scrolling Task Feed (7 cols) */}
                    <div className="lg:col-span-7 flex flex-col min-h-0 overflow-hidden relative">
                      <div className="flex justify-between items-center mb-4 shrink-0 pr-2">
                        <span className="text-xs font-bold tracking-widest text-[#8052ff] uppercase font-mono">
                          Synthesis Task Stream
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-zinc-500 font-mono">
                            Running tasks:{" "}
                            {
                              getTasksFromMessages().filter(
                                (t) => t.status === "running",
                              ).length
                            }
                          </span>
                          {hasActiveTask && (
                            <button
                              onClick={cancelTask}
                              disabled={isCancelling}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-colors uppercase flex items-center gap-1.5 shadow-sm border ${
                                isCancelling
                                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400 cursor-not-allowed opacity-80"
                                  : "bg-red-500/10 border-red-500/20 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                              }`}
                            >
                              {isCancelling ? (
                                <>
                                  <svg
                                    className="animate-spin"
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                  >
                                    <circle
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      strokeOpacity="0.25"
                                    ></circle>
                                    <path
                                      d="M12 2a10 10 0 0 1 10 10"
                                      strokeOpacity="1"
                                    ></path>
                                  </svg>
                                  Cancelling...
                                </>
                              ) : (
                                <>
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                  >
                                    <rect
                                      x="3"
                                      y="3"
                                      width="18"
                                      height="18"
                                      rx="2"
                                      ry="2"
                                    ></rect>
                                    <line x1="9" y1="9" x2="15" y2="15"></line>
                                    <line x1="15" y1="9" x2="9" y2="15"></line>
                                  </svg>
                                  Interrupt
                                </>
                              )}
                            </button>
                          )}
                          {!hasActiveTask && (
                            <button
                              onClick={() => setShowTaskStream(false)}
                              className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-mono text-zinc-400 hover:text-white hover:bg-white/10 transition-colors uppercase"
                            >
                              Close
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
                        {getTasksFromMessages().map((task) => (
                          <div
                            key={task.id}
                            className="border border-white/5 bg-white/[0.01] backdrop-blur-[2px] rounded-3xl p-5 shadow-lg space-y-3.5 transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-zinc-500">
                                  TASK IDENTIFIER
                                </span>
                                {task.source === "mobile" && (
                                  <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[9px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">
                                    <svg
                                      width="10"
                                      height="10"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <rect
                                        x="5"
                                        y="2"
                                        width="14"
                                        height="20"
                                        rx="2"
                                        ry="2"
                                      ></rect>
                                      <line
                                        x1="12"
                                        y1="18"
                                        x2="12.01"
                                        y2="18"
                                      ></line>
                                    </svg>
                                    Mobile Command
                                  </span>
                                )}
                              </div>
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                  task.status === "completed"
                                    ? "bg-[#15846e]/10 border border-[#15846e]/20 text-[#15846e]"
                                    : task.status === "cancelling"
                                      ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                                      : task.status === "cancelled" ||
                                          task.status === "failed"
                                        ? "bg-zinc-500/10 border border-zinc-500/20 text-zinc-400"
                                        : "bg-[#8052ff]/10 border border-[#8052ff]/20 text-[#8052ff] animate-pulse"
                                }`}
                              >
                                {task.status === "cancelling" ? (
                                  <span className="flex items-center gap-1">
                                    <svg
                                      className="animate-spin w-2.5 h-2.5"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                    >
                                      <circle
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        strokeOpacity="0.25"
                                      ></circle>
                                      <path
                                        d="M12 2a10 10 0 0 1 10 10"
                                        strokeOpacity="1"
                                      ></path>
                                    </svg>
                                    CANCELLING...
                                  </span>
                                ) : (
                                  task.status
                                )}
                              </span>
                            </div>
                            <h3 className="text-base font-bold text-white font-display leading-snug">
                              {task.command}
                            </h3>

                            {/* Steps list */}
                            {task.steps.length > 0 ? (
                              <div className="border-t border-white/5 pt-3.5 space-y-2">
                                <span className="text-[9px] font-mono text-zinc-500 block mb-1.5">
                                  EXECUTION TRACE
                                </span>
                                {task.steps.map((step, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-2.5 text-[11px] font-sans"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#8052ff] shrink-0" />
                                    <span className="text-zinc-400">
                                      {step.text}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : task.trace && task.trace.length > 0 ? (
                              <div className="border-t border-white/5 pt-3.5 space-y-2">
                                <span className="text-[9px] font-mono text-zinc-500 block mb-1.5">
                                  EXECUTION TRACE
                                </span>
                                {task.trace.map((tItem, idx) => (
                                  <div
                                    key={idx}
                                    className={`flex items-center gap-2.5 text-[11px] font-sans ${tItem.state === "active" ? "text-zinc-300" : tItem.state === "done" ? "text-[#8052ff]" : "text-zinc-500 opacity-40"}`}
                                  >
                                    {tItem.state === "active" ? (
                                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#8052ff]"></span>
                                      </span>
                                    ) : tItem.state === "done" ? (
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#8052ff] shrink-0" />
                                    ) : (
                                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                                    )}
                                    <span
                                      className={
                                        tItem.state === "active"
                                          ? "animate-pulse"
                                          : ""
                                      }
                                    >
                                      {tItem.text}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : task.status === "running" ||
                              task.status === "cancelling" ? (
                              <div className="border-t border-white/5 pt-3.5 space-y-2">
                                <span className="text-[9px] font-mono text-zinc-500 block mb-1.5">
                                  EXECUTION TRACE
                                </span>
                                <div className="flex items-center gap-2.5 text-[11px] font-sans text-zinc-300">
                                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#8052ff]"></span>
                                  </span>
                                  <span className="animate-pulse">
                                    Setu is reading command...
                                  </span>
                                </div>
                              </div>
                            ) : null}

                            {/* Result */}
                            {task.result && (
                              <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-3.5 mt-2 font-sans">
                                <span
                                  className={`text-[9px] font-mono block mb-1.5 font-bold ${task.status === "running" ? "text-amber-400 animate-pulse" : "text-[#8052ff]"}`}
                                >
                                  {task.status === "running"
                                    ? "➔ GENERATING RESPONSE..."
                                    : "➔ FINAL RESPONSE"}
                                </span>
                                <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                  {task.result}
                                  {task.status === "running" && (
                                    <span className="inline-block w-1.5 h-3 bg-amber-400 ml-1 animate-pulse align-middle" />
                                  )}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Floating Command Input Bar */}
                <div className="w-full max-w-2xl mx-auto px-6 pb-8 pt-2 z-20 shrink-0">
                  <div className="flex items-center gap-3 bg-white/[0.01] border border-white/5 rounded-2xl px-4 py-3 shadow-[0_4px_30px_rgba(0,0,0,0.15)] font-sans backdrop-blur-[2px]">
                    <button
                      onClick={toggleListen}
                      disabled={isThinking}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                        isThinking
                          ? "bg-zinc-800/10 border-zinc-700 text-zinc-500 cursor-not-allowed opacity-50"
                          : isSpeaking
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                            : isActive
                              ? "bg-[#8052ff]/20 border-white text-white shadow-[0_0_10px_rgba(128,82,255,0.3)] animate-pulse"
                              : "bg-white/5 border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {isActive ? (
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                        </span>
                      ) : (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                          <line x1="12" y1="19" x2="12" y2="22"></line>
                        </svg>
                      )}
                    </button>
                    <input
                      type="text"
                      placeholder={
                        isThinking
                          ? "Setu is thinking..."
                          : isSpeaking
                            ? "Setu is speaking..."
                            : isActive
                              ? "Listening to voice stream..."
                              : "Type system command..."
                      }
                      disabled={isThinking || isSpeaking || isActive}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.currentTarget.value.trim()) {
                          sendCommand(e.currentTarget.value);
                          e.currentTarget.value = "";
                        }
                      }}
                      className="flex-1 bg-transparent text-white text-sm outline-none placeholder-zinc-500 disabled:opacity-50 font-sans"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* CHAT / HISTORY VIEW */}
            {activeTab === "History" && (
              <motion.div
                key="Chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto custom-scrollbar w-full py-10 px-10 lg:px-14 bg-transparent"
              >
                <div className="w-full max-w-5xl mx-auto space-y-8">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-3xl font-bold text-white tracking-wide font-display">
                        History
                      </h2>
                      <p className="text-sm text-zinc-400 mt-2">
                        Review your previous discussions and synthesis sessions.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const newId =
                          "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
                            /[xy]/g,
                            (c) => {
                              const r = (Math.random() * 16) | 0;
                              const v = c === "x" ? r : (r & 0x3) | 0x8;
                              return v.toString(16);
                            },
                          );
                        setConversationId(newId);
                        setActiveTab("TaskFeed");
                      }}
                      className="px-4 py-2 bg-[#8052ff] hover:bg-[#916bff] text-white rounded-xl text-sm font-bold transition-colors shadow-[0_0_15px_rgba(128,82,255,0.3)] flex items-center gap-2"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                      New Session
                    </button>
                  </div>

                  <div className="space-y-4">
                    {isLoadingHistory ? (
                      Array.from({ length: 3 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="w-full bg-white/[0.02] border border-white/5 p-6 rounded-2xl animate-pulse flex flex-col gap-3"
                        >
                          <div className="h-5 w-1/3 bg-white/5 rounded-md" />
                          <div className="h-4 w-1/4 bg-white/5 rounded-md" />
                          <div className="h-4 w-1/2 bg-white/5 rounded-md mt-2" />
                        </div>
                      ))
                    ) : history.length === 0 ? (
                      <p className="text-zinc-500 text-sm">No history found.</p>
                    ) : (
                      history.map((conv, i) => {
                        const firstUserMsg = conv.messages?.find(
                          (m) => m.role === "user",
                        );
                        const isExpanded =
                          expandedSessionId === conv.conversation_id;

                        return (
                          <div
                            key={conv.conversation_id || i}
                            onClick={() =>
                              setExpandedSessionId((prev) =>
                                prev === conv.conversation_id
                                  ? null
                                  : conv.conversation_id,
                              )
                            }
                            className="glass-panel rounded-3xl p-6 hover:border-white/10 transition-colors cursor-pointer group"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-4 min-w-0">
                                <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center shrink-0 text-zinc-400 group-hover:text-white transition-colors">
                                  <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                  </svg>
                                </div>
                                <div className="min-w-0">
                                  <h3 className="text-base font-bold text-white mb-1 truncate pr-2 group-hover:text-[#8052ff] transition-colors font-display">
                                    {firstUserMsg
                                      ? firstUserMsg.content.length > 70
                                        ? firstUserMsg.content.substring(
                                            0,
                                            70,
                                          ) + "..."
                                        : firstUserMsg.content
                                      : `Session ${(conv.conversation_id || "").substring(0, 8) || "New"}`}
                                  </h3>
                                  <p className="text-[10px] text-zinc-500 font-mono">
                                    {conv.started_at
                                      ? new Date(
                                          conv.started_at,
                                        ).toLocaleString()
                                      : "Recent"}
                                    <span className="mx-2">•</span>
                                    {conv.messages
                                      ? conv.messages.length
                                      : 0}{" "}
                                    interactions
                                  </p>
                                </div>
                              </div>

                              <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors shrink-0">
                                <svg
                                  className={`transform transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                              </div>
                            </div>

                            {/* Collapsible log of commands and responses */}
                            {isExpanded && (
                              <div
                                className="mt-5 pt-5 border-t border-white/5 space-y-4"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-2">
                                  Conversation Log
                                </span>
                                {conv.messages && conv.messages.length > 0 ? (
                                  <div className="space-y-4 font-sans">
                                    {conv.messages.map((msg, mIdx) => {
                                      const isUser = msg.role === "user";
                                      return (
                                        <div
                                          key={msg.message_id || mIdx}
                                          className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                                        >
                                          <div className="flex items-center gap-1.5 mb-1">
                                            <span
                                              className={`text-[9px] font-mono font-bold uppercase tracking-wider ${isUser ? "text-[#8052ff]" : "text-amber-400"}`}
                                            >
                                              {isUser ? "User Command" : "Setu"}
                                            </span>
                                            <span className="text-[8px] text-zinc-600 font-mono">
                                              {msg.timestamp
                                                ? new Date(
                                                    msg.timestamp,
                                                  ).toLocaleTimeString([], {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                  })
                                                : ""}
                                            </span>
                                          </div>
                                          <div
                                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                                              isUser
                                                ? "bg-[#8052ff]/15 border border-[#8052ff]/30 text-white rounded-tr-none"
                                                : "bg-white/5 border border-white/10 text-zinc-300 rounded-tl-none shadow-md"
                                            }`}
                                          >
                                            {msg.content}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-xs text-zinc-500 italic">
                                    No messages recorded in this session.
                                  </p>
                                )}
                                <div className="mt-4 pt-4 border-t border-white/5 flex justify-end">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConversationId(conv.conversation_id);
                                      setActiveTab("TaskFeed");
                                    }}
                                    className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-colors"
                                  >
                                    Resume Session
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* VAULT / MEMORY CENTER VIEW */}
            {activeTab === "Memory" && profile && (
              <motion.div
                key="Vault"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto custom-scrollbar w-full py-10 px-10 lg:px-14 bg-transparent"
              >
                <div className="w-full max-w-5xl mx-auto space-y-8">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-3xl font-bold text-white tracking-wide font-display">
                        Memory Center
                      </h2>
                      <p className="text-sm text-zinc-400 mt-2">
                        Setu acts as a quiet extension of your mind. Here you
                        can review, adjust, and control the
                        <br />
                        contextual fabric of your assistant.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4">
                    <div className="col-span-1 lg:col-span-7 space-y-6">
                      {/* Real User Info */}
                      <div className="glass-panel rounded-3xl p-6">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-8 h-8 rounded-lg bg-[#8052ff]/10 flex items-center justify-center">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#a78bfa"
                              strokeWidth="2"
                            >
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                              <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                          </div>
                          <h3 className="text-lg font-bold text-white">
                            Identity
                          </h3>
                        </div>

                        <div className="space-y-4">
                          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex gap-4">
                            <div>
                              <h4 className="text-sm font-semibold text-white mb-1">
                                Username
                              </h4>
                              <p className="text-sm text-zinc-400">
                                {profile.username}
                              </p>
                            </div>
                          </div>
                          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex gap-4">
                            <div>
                              <h4 className="text-sm font-semibold text-white mb-1">
                                Email
                              </h4>
                              <p className="text-sm text-zinc-400">
                                {profile.email}
                              </p>
                            </div>
                          </div>
                          <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex gap-4">
                            <div>
                              <h4 className="text-sm font-semibold text-white mb-1">
                                User ID
                              </h4>
                              <p className="text-[11px] font-mono text-zinc-400">
                                {profile.user_id}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-1 lg:col-span-5 space-y-6">
                      {/* Real Preferences */}
                      <div className="glass-panel rounded-3xl p-6">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#3b82f6"
                              strokeWidth="2"
                            >
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            </svg>
                          </div>
                          <h3 className="text-lg font-bold text-white">
                            System Allowances
                          </h3>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-semibold text-white mb-0.5">
                                AI Provider
                              </h4>
                              <p className="text-[11px] text-zinc-500">
                                {formatProvider(
                                  profile.preferences?.ai_provider,
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-semibold text-white mb-0.5">
                                LLM Mode
                              </h4>
                              <p className="text-[11px] text-zinc-500">
                                {profile.preferences?.llm_mode === "cloud"
                                  ? "Cloud-Only"
                                  : profile.preferences?.llm_mode === "local"
                                    ? "Local-Only"
                                    : profile.preferences?.llm_mode ||
                                      "Not set"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-semibold text-white mb-0.5">
                                LLM Model
                              </h4>
                              <p className="text-[11px] text-zinc-500">
                                {profile.preferences?.llm_model || "Not set"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-semibold text-white mb-0.5">
                                Theme
                              </h4>
                              <p className="text-[11px] text-zinc-500">
                                {profile.preferences?.theme || "Not set"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-semibold text-white mb-0.5">
                                Language
                              </h4>
                              <p className="text-[11px] text-zinc-500">
                                {profile.preferences?.language || "Not set"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            {/* DEVICES VIEW */}
            {activeTab === "Devices" && (
              <motion.div
                key="Devices"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto custom-scrollbar w-full py-10 px-10 lg:px-14 bg-transparent font-sans"
              >
                <div className="w-full max-w-5xl mx-auto space-y-8">
                  <div>
                    <h2 className="text-3xl font-bold text-white tracking-wide font-display">
                      Connected Devices
                    </h2>
                    <p className="text-sm text-zinc-400 mt-2">
                      Manage your connected smartphones and laptops for
                      cross-device execution.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="glass-panel rounded-3xl p-6 flex flex-col justify-between min-h-[200px]">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                            Active
                          </span>
                          <span className="text-xs text-zinc-500">
                            Last synced: 1m ago
                          </span>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1 font-display">
                          {getClientOS()}
                        </h3>
                        <p className="text-xs text-zinc-400 font-mono">
                          {getClientBrowser()} ({window.location.hostname})
                        </p>
                      </div>
                      <div className="border-t border-white/5 pt-4 mt-6 flex justify-between items-center">
                        <span className="text-xs text-zinc-400">
                          Security L2 Permitted
                        </span>
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      </div>
                    </div>

                    {mobileConnected && (
                      <div className="glass-panel rounded-3xl p-6 flex flex-col justify-between min-h-[200px] border border-[#8052ff]/30 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#8052ff]/10 rounded-full blur-3xl group-hover:bg-[#8052ff]/20 transition-all pointer-events-none"></div>
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <span className="px-3 py-1 rounded-full bg-[#8052ff]/10 border border-[#8052ff]/20 text-[10px] font-bold text-[#8052ff] uppercase tracking-wider">
                              Active Remote
                            </span>
                          </div>
                          <h3 className="text-xl font-bold text-white mb-1 font-display">
                            {connectedDeviceName}
                          </h3>
                          <p className="text-xs text-zinc-400 font-mono">
                            Web Client (LAN Access)
                          </p>
                        </div>
                        <div className="border-t border-white/5 pt-4 mt-6 flex justify-between items-center">
                          <span className="text-xs text-zinc-400 flex items-center gap-2">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            </svg>
                            Voice & Command Armed
                          </span>
                          <span className="w-2.5 h-2.5 rounded-full bg-[#8052ff] animate-pulse shadow-[0_0_10px_rgba(128,82,255,0.8)]"></span>
                        </div>
                      </div>
                    )}

                    {!mobileConnected && (
                      <div
                        onClick={handlePairDevice}
                        className="glass-panel rounded-3xl p-6 border-dashed border-white/10 hover:border-white/20 transition-all cursor-pointer flex flex-col items-center justify-center min-h-[200px] text-center group"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 group-hover:border-[#8052ff]/30 group-hover:bg-[#8052ff]/5 transition-all text-zinc-400 group-hover:text-white">
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </div>
                        <h3 className="text-base font-bold text-white mb-1">
                          Pair Mobile Device
                        </h3>
                        <p className="text-xs text-zinc-500 max-w-[200px]">
                          Scan QR code or enter a 6-digit PIN on your phone to
                          link it to Setu.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* SETTINGS VIEW */}
            {activeTab === "Settings" && (
              <SettingsView
                profile={profile}
                updatePreference={updatePreference}
                token={token}
                onLogout={handleLogout}
              />
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Minimal Top-Center Permission Pill */}
      <AnimatePresence>
        {permissionRequest && (
          <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[10000] pointer-events-none w-full max-w-2xl px-4 flex justify-center">
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{
                opacity: 0,
                y: -10,
                scale: 0.95,
                transition: { duration: 0.15 },
              }}
              className="pointer-events-auto bg-[#0a0a0a]/90 backdrop-blur-2xl border border-white/10 rounded-full p-2 pl-5 pr-2 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-center gap-6"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-2 h-2 rounded-full bg-[#8052ff] animate-pulse shrink-0 shadow-[0_0_8px_rgba(128,82,255,0.8)]"></div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-white leading-tight flex gap-1">
                    Setu wants to{" "}
                    <span className="font-bold text-[#8052ff]">
                      {permissionRequest.action}
                    </span>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[250px] sm:max-w-[350px]">
                    {permissionRequest.path}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() =>
                    resolvePermissionRequest(
                      permissionRequest.request_id,
                      "denied",
                    )
                  }
                  className="px-4 py-1.5 bg-transparent hover:bg-white/10 text-zinc-400 hover:text-white rounded-full text-xs font-semibold transition-colors"
                >
                  Deny
                </button>
                <button
                  onClick={() =>
                    resolvePermissionRequest(
                      permissionRequest.request_id,
                      "allowed",
                    )
                  }
                  className="px-4 py-1.5 bg-white text-black hover:bg-zinc-200 rounded-full text-xs font-bold transition-colors shadow-sm"
                >
                  Allow
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Toast Notification Container */}
      <div className="fixed top-6 right-6 z-[9999] space-y-3 pointer-events-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
              key={toast.id}
              className="pointer-events-auto w-full bg-[#0c0919]/95 backdrop-blur-md border border-[var(--color-accent-mint)]/30 rounded-2xl p-4 shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(130,242,168,0.1)] flex items-start gap-3 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-[var(--color-accent-mint)]" />
              <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-mint)]/10 border border-[var(--color-accent-mint)]/20 flex items-center justify-center text-[var(--color-accent-mint)] shrink-0">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h4 className="text-sm font-bold text-white leading-tight">
                    Reminder Triggered
                  </h4>
                  <button
                    onClick={() =>
                      setToasts((prev) => prev.filter((t) => t.id !== toast.id))
                    }
                    className="text-gray-500 hover:text-white transition-colors"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
                <h5 className="text-xs font-semibold text-[var(--color-accent-mint)] mt-1">
                  {toast.title}
                </h5>
                {toast.body && (
                  <p className="text-xs text-gray-300 mt-1">{toast.body}</p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Mobile Pairing Modal */}
      <AnimatePresence>
        {showPairingModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-black border border-white/10 rounded-3xl p-8 max-w-sm w-full relative flex flex-col items-center text-center shadow-2xl"
            >
              <button
                onClick={() => setShowPairingModal(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>

              <div className="w-12 h-12 rounded-2xl bg-[#8052ff]/10 border border-[#8052ff]/20 flex items-center justify-center text-[#8052ff] mb-4">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">Pair Phone</h2>
              <p className="text-zinc-400 text-sm mb-8">
                Scan this code with your phone's camera to use it as a remote
                control.
              </p>

              <div className="bg-white p-4 rounded-2xl shadow-inner mb-6">
                {pairingData && pairingData.url ? (
                  <QRCodeSVG
                    value={`${pairingData.url}?conversationId=${conversationId || ""}#token=${pairingData.token}`}
                    size={200}
                    level="H"
                    includeMargin={true}
                  />
                ) : (
                  <div className="w-[200px] h-[200px] flex items-center justify-center bg-zinc-100 rounded-xl">
                    <div className="w-8 h-8 border-2 border-[#8052ff] border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>

              {pairingData && (
                <div className="bg-white/5 border border-white/10 rounded-xl py-3 px-4 w-full mb-6 text-left">
                  <p className="text-xs text-zinc-500 mb-1 uppercase tracking-wider font-bold">
                    Local IP Address
                  </p>
                  <p className="text-sm text-white font-mono">
                    {pairingData.ip}
                  </p>
                </div>
              )}

              <div className="w-full">
                <button
                  onClick={() => setShowPairingModal(false)}
                  className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-semibold transition-colors text-white"
                >
                  Close Window
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
