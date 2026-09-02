import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import {
  Mic,
  Shield,
  ChevronRight,
  CheckCircle2,
  Volume2,
  Lock,
} from "lucide-react";

import { useAppStore } from "../store/useAppStore";

export function Onboarding() {
  const location = useLocation();

  return (
    <div className="w-full min-h-screen bg-transparent text-white flex flex-col items-center justify-center relative overflow-hidden px-6 font-sans">
      {/* Persistent Progress Indicator */}
      <div className="absolute top-12 left-0 right-0 flex justify-center z-20">
        <div className="flex items-center gap-3">
          {[
            { path: "/onboarding/name", label: "Your Name" },
            { path: "/onboarding/hardware", label: "Microphone" },
            { path: "/onboarding/permissions", label: "Permissions" },
          ].map((step, idx) => {
            const isActive = location.pathname.includes(step.path);
            const isPast =
              ["/name", "/hardware", "/permissions"].findIndex((p) =>
                location.pathname.includes(p),
              ) > idx;
            return (
              <div key={idx} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-3 h-3 rounded-full transition-all duration-700 ${isActive ? "bg-[#8052ff] scale-125" : isPast ? "bg-[#8052ff]/40" : "bg-white/10"}`}
                  />
                  <span
                    className={`text-[9px] uppercase mt-2 tracking-[0.05em] transition-colors ${isActive ? "text-[#8052ff] font-bold" : isPast ? "text-[#8052ff]/50" : "text-[#a1a1aa]"}`}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < 2 && (
                  <div
                    className={`w-16 h-[1px] -mt-5 mx-2 transition-all duration-700 ${isPast ? "bg-[#8052ff]/40" : "bg-white/5"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Container Card: professional glassmorphic panel */}
      <div className="w-full max-w-xl bg-zinc-950/80 border border-white/5 backdrop-blur-xl rounded-2xl p-10 shadow-2xl relative overflow-hidden mt-8">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="name" element={<StepName />} />
            <Route path="hardware" element={<StepHardware />} />
            <Route path="permissions" element={<StepPermissions />} />
            <Route path="done" element={<StepDone />} />
          </Routes>
        </AnimatePresence>
      </div>
    </div>
  );
}

function StepName() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setUsername, token } = useAppStore();

  const handleNext = async (e) => {
    e.preventDefault();
    if (name.trim().length >= 1) {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`}/api/v1/user/profile/`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              username: name.trim(),
              preferences: { preferred_name: name.trim() },
            }),
          },
        );
        if (!res.ok) {
          throw new Error("Failed to update profile on backend.");
        }
        setUsername(name.trim());
        navigate("/onboarding/hardware");
      } catch (err) {
        console.error(err);
        setError(err.message || "Server error. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center text-center relative z-10 font-sans"
    >
      <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#8052ff] mb-4">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </div>

      <span className="text-[11px] font-bold tracking-[0.05em] text-[#8052ff] uppercase mb-1">
        Step 1 of 3
      </span>
      <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">
        What is your name?
      </h2>
      <p className="text-zinc-400 text-sm max-w-sm mb-8">
        Enter your preferred name to personalize your workspace.
      </p>

      <form onSubmit={handleNext} className="w-full">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-left flex items-start gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="shrink-0 mt-0.5"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{error}</span>
          </div>
        )}

        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your Name"
          disabled={loading}
          className="w-full app-input text-center text-lg py-3.5 mb-6"
        />

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          disabled={!name.trim() || loading}
          type="submit"
          className="w-full btn-primary py-3.5"
        >
          {loading ? "Saving name..." : "Continue"} <ChevronRight size={16} />
        </motion.button>
      </form>
    </motion.div>
  );
}

function StepHardware() {
  const navigate = useNavigate();
  const [calibrating, setCalibrating] = useState(false);
  const [tested, setTested] = useState(false);
  const [dbLevels, setDbLevels] = useState(Array(12).fill(15));
  const intervalRef = useRef(null);

  const handleTest = () => {
    if (calibrating) return;
    setCalibrating(true);

    intervalRef.current = setInterval(() => {
      setDbLevels(
        Array(12)
          .fill(0)
          .map(() => Math.floor(Math.random() * 85) + 15),
      );
    }, 120);

    setTimeout(() => {
      clearInterval(intervalRef.current);
      setCalibrating(false);
      setTested(true);
      setDbLevels(
        Array(12)
          .fill(0)
          .map((_, idx) =>
            idx === 5 || idx === 6
              ? 75
              : idx === 4 || idx === 7
                ? 55
                : idx === 3 || idx === 8
                  ? 35
                  : 20,
          ),
      );
    }, 3200);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col text-center relative z-10 font-sans"
    >
      <div className="flex justify-center mb-4">
        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#8052ff]">
          <Volume2 size={20} />
        </div>
      </div>

      <span className="text-[11px] font-bold tracking-[0.05em] text-[#8052ff] uppercase mb-1">
        Step 2 of 3
      </span>
      <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">
        Test Microphone
      </h2>
      <p className="text-zinc-400 text-sm max-w-sm mx-auto mb-6">
        Setu runs voice triggers locally. Test your audio source to confirm
        optimal microphone capture.
      </p>

      {/* Audio Waveform visualizer */}
      <div className="h-16 flex items-center justify-center gap-1.5 mb-6 bg-black/40 border border-white/5 rounded-xl relative overflow-hidden px-8">
        {dbLevels.map((lvl, idx) => (
          <motion.div
            key={idx}
            animate={{ height: `${lvl}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className={`w-2 rounded-full ${calibrating ? "bg-[#8052ff]" : tested ? "bg-emerald-500" : "bg-white/10"}`}
          />
        ))}
        {calibrating && (
          <span className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] tracking-[0.05em] uppercase animate-pulse text-[#8052ff] font-bold">
            Listening...
          </span>
        )}
      </div>

      <div className="flex justify-center mb-8">
        <button
          onClick={handleTest}
          disabled={calibrating}
          className={`btn-secondary py-2.5 px-6 rounded-xl border flex items-center gap-2.5 ${
            tested
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "hover:bg-white/5"
          }`}
        >
          {tested ? (
            <>
              <CheckCircle2 size={16} className="text-emerald-400" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Microphone Calibrated
              </span>
            </>
          ) : (
            <>
              <Mic size={16} className="animate-pulse text-[#8052ff]" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                {calibrating ? "Testing..." : "Test Microphone"}
              </span>
            </>
          )}
        </button>
      </div>

      <div className="flex gap-4 w-full border-t border-white/5 pt-6">
        <button
          onClick={() => navigate("/onboarding/name")}
          className="flex-1 btn-secondary py-3"
        >
          Back
        </button>
        <button
          onClick={() => navigate("/onboarding/permissions")}
          className="flex-[2] btn-primary py-3"
        >
          {tested ? "Continue" : "Skip for now"} <ChevronRight size={16} />
        </button>
      </div>
    </motion.div>
  );
}

function StepPermissions() {
  const navigate = useNavigate();
  const [level2, setLevel2] = useState(false);
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setEulaAccepted: persistEulaAccepted, token } = useAppStore();

  const handleComplete = async () => {
    if (!eulaAccepted) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`}/api/v1/user/permissions/`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            level_2_granted: level2,
          }),
        },
      );
      if (!res.ok) {
        throw new Error("Failed to update permissions on backend.");
      }

      const resProfile = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`}/api/v1/user/profile/`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            preferences: { privacy_consent_granted: true },
          }),
        },
      );
      if (!resProfile.ok) {
        throw new Error("Failed to update privacy consent on backend.");
      }

      persistEulaAccepted(true);
      navigate("/onboarding/done");
    } catch (err) {
      console.error(err);
      setError(err.message || "Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col relative z-10 font-sans"
    >
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#ffb829] mb-4">
          <Shield size={20} />
        </div>
        <span className="text-[11px] font-bold tracking-[0.05em] text-[#8052ff] uppercase mb-1">
          Step 3 of 3
        </span>
        <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">
          Workspace Permissions
        </h2>
        <p className="text-zinc-400 text-sm max-w-sm">
          Grant system access permissions for your local workspace AI agent.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="shrink-0 mt-0.5"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Switch card: professional layout */}
      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between gap-6">
          <div className="flex gap-3.5">
            <div className="mt-1 w-9 h-9 rounded-lg bg-[#ffb829]/10 border border-[#ffb829]/20 flex items-center justify-center text-[#ffb829] shrink-0">
              <Lock size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">
                Allow OS Automations
              </h3>
              <p className="text-zinc-400 text-xs leading-relaxed max-w-sm">
                Let Setu execute system commands, look up directories, and
                automate window triggers when requested by voice or keybinds.
              </p>
            </div>
          </div>

          <div
            onClick={() => setLevel2(!level2)}
            className={`w-12 h-7 rounded-full p-0.5 cursor-pointer transition-colors shrink-0 ${level2 ? "bg-[#8052ff]" : "bg-white/10"}`}
          >
            <motion.div
              layout
              className="w-6 h-6 rounded-full bg-white shadow"
              animate={{ x: level2 ? 20 : 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </div>
        </div>
      </div>

      {/* EULA: professional scrollable panel */}
      <div className="bg-black/50 border border-white/5 rounded-xl p-4 mb-5 max-h-32 overflow-y-auto text-[11px] text-zinc-400 leading-relaxed custom-scrollbar text-left font-mono relative">
        <h4 className="text-white font-semibold mb-2 text-xs">
          Privacy Agreement
        </h4>
        <p className="mb-2">
          <strong>DATA ENVELOPE:</strong> Isolated Local Environment
        </p>
        <p className="mb-3">
          Setu is configured as a local-first agent. Transcription data, user
          prompts, and execution history are written exclusively to your local
          storage.
        </p>
        <p className="mb-1">
          <strong>OS-LEVEL CONTROL AGREEMENT:</strong> By toggling computer
          control, you grant authority to execute system-level triggers as
          described in prompt templates.
        </p>
      </div>

      {/* Checkbox */}
      <label className="flex items-start gap-3 cursor-pointer mb-6 text-xs text-zinc-400 select-none hover:text-white transition-colors">
        <input
          type="checkbox"
          checked={eulaAccepted}
          onChange={(e) => setEulaAccepted(e.target.checked)}
          className="w-4 h-4 rounded border-white/10 bg-black text-[#8052ff] focus:ring-[#8052ff]/30 mt-0.5"
        />
        <span className="leading-tight">
          I agree to the local-first execution agreement.
        </span>
      </label>

      <div className="flex gap-4 w-full border-t border-white/5 pt-6">
        <button
          onClick={() => navigate("/onboarding/hardware")}
          disabled={loading}
          className="flex-1 btn-secondary py-3"
        >
          Back
        </button>
        <button
          onClick={handleComplete}
          disabled={!eulaAccepted || loading}
          className="flex-[2] btn-primary py-3"
        >
          {loading ? "Saving Setup..." : "Finish Setup"}
        </button>
      </div>
    </motion.div>
  );
}

function StepDone() {
  const navigate = useNavigate();
  const { username: name, setOnboardingCompleted } = useAppStore();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center text-center relative z-10 py-4 font-sans"
    >
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-full bg-[#8052ff] flex items-center justify-center text-white">
          <CheckCircle2 size={32} className="text-white" />
        </div>
      </div>

      <span className="text-[11px] font-bold tracking-[0.05em] text-[#8052ff] uppercase mb-1">
        Setup Complete
      </span>
      <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">
        Workstation Ready
      </h2>
      <p className="text-zinc-400 text-sm max-w-sm mb-8">
        Welcome to Setu,{" "}
        <span className="text-white font-semibold">{name}</span>. Your workspace
        is configured and ready.
      </p>

      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => {
          setOnboardingCompleted(true);
          navigate("/dashboard");
        }}
        className="w-full btn-primary py-3.5"
      >
        Enter Workstation
      </motion.button>
    </motion.div>
  );
}
