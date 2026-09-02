import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAgentSocket } from "../hooks/useAgentSocket";
import { useAudioAnalyser } from "../hooks/useAudioAnalyser";

export function MobileChat() {
  const [searchParams] = useSearchParams();
  const token =
    searchParams.get("token") ||
    new URLSearchParams(window.location.hash.substring(1)).get("token");
  const queryConversationId = searchParams.get("conversationId");
  const navigate = useNavigate();

  const [inputText, setInputText] = useState("");
  const [liveText, setLiveText] = useState("");

  // Connect to the desktop's active conversation to sync messages in real-time
  const conversationId = queryConversationId || "mobile-remote-session";

  const {
    messages,
    isThinking,
    isSpeaking,
    sendCommand: rawSendCommand,
    stopSpeaking,
    isConnected,
    switchConversation,
  } = useAgentSocket({
    token,
    conversationId,
    isMobileClient: true,
    onReminderFired: () => {},
    onSwitchConversation: (newId) => {
      const newParams = new URLSearchParams(searchParams);
      newParams.set("conversationId", newId);
      navigate(`/mobile?${newParams.toString()}`);
    },
  });

  const sendCommand = useCallback(
    (text) => {
      rawSendCommand(text);
    },
    [rawSendCommand],
  );

  const liveTextRef = useRef(liveText);
  useEffect(() => {
    liveTextRef.current = liveText;
  }, [liveText]);

  const sendCommandRef = useRef(sendCommand);
  useEffect(() => {
    sendCommandRef.current = sendCommand;
  }, [sendCommand]);

  const {
    startListening,
    stopListening,
    isActive,
    error: micError,
  } = useAudioAnalyser();

  const armVoice = useCallback(async () => {
    await startListening((text) => {
      const trimmed = (text || "").trim();
      setLiveText("");
      if (trimmed) sendCommandRef.current(trimmed);
    });
  }, [startListening]);

  useEffect(() => {
    if (!token) {
      navigate("/auth");
      return;
    }

    armVoice().catch((err) => console.warn("Mobile mic arming error:", err));

    return () => {
      stopListening();
    };
  }, [token, navigate, armVoice, stopListening]);

  const handleSend = () => {
    if (inputText.trim()) {
      sendCommand(inputText.trim());
      setInputText("");
    }
  };

  return (
    <div className="fixed inset-0 w-full h-[100dvh] text-white font-sans bg-[#050505] flex flex-col overflow-hidden overscroll-none">
      {/* Dynamic Background Glow */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div
          className={`absolute top-[-10%] left-[-10%] w-[120%] h-[120%] bg-[radial-gradient(circle_at_50%_50%,_rgba(128,82,255,0.08)_0%,_transparent_60%)] transition-opacity duration-1000 ${isThinking || isSpeaking ? "opacity-100" : "opacity-40"}`}
        ></div>
      </div>

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 z-10 bg-black/40 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#8052ff] to-[#592be8] flex items-center justify-center font-bold text-sm shadow-[0_0_20px_rgba(128,82,255,0.4)]">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wider text-white">
              SETU REMOTE
            </h1>
            <p
              className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${isConnected ? "text-[#8052ff]" : "text-amber-500"}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-500"}`}
              ></span>
              {isConnected ? "Connected to PC" : "Connecting..."}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            const newId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
              /[xy]/g,
              (c) => {
                const r = (Math.random() * 16) | 0;
                const v = c === "x" ? r : (r & 0x3) | 0x8;
                return v.toString(16);
              },
            );
            switchConversation(newId);
          }}
          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
          title="Start New Session"
        >
          <svg
            width="18"
            height="18"
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
        </button>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 z-10 flex flex-col scroll-smooth">
        {micError && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs text-center backdrop-blur-md">
            <p className="font-bold mb-1">Microphone Access Blocked</p>
            <p className="opacity-80">
              Local development (HTTP) restricts microphone. Use text chat, or
              enable secure origins flag in your mobile browser.
            </p>
          </div>
        )}

        {messages.length === 0 && !liveText && !isThinking && (
          <div className="flex-1 flex flex-col items-center justify-center opacity-40 pb-10">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mb-4 text-white/50"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="22"></line>
            </svg>
            <p className="text-sm font-medium tracking-wide">
              Ready for commands
            </p>
          </div>
        )}

        <div className="flex flex-col space-y-5 pb-8">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className={`max-w-[85%] rounded-3xl p-4 shadow-xl backdrop-blur-md ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-[#8052ff] to-[#592be8] text-white rounded-tr-sm"
                    : "bg-white/5 border border-white/10 text-zinc-200 rounded-tl-sm"
                }`}
              >
                <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap font-medium">
                  {msg.text || msg.content}
                </p>
              </motion.div>
            </div>
          ))}

          {/* Live Transcript */}
          {liveText && (
            <div className="flex justify-end w-full">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-[85%] rounded-3xl rounded-tr-sm p-4 bg-[#8052ff]/30 border border-[#8052ff]/30 text-white/90 italic backdrop-blur-md"
              >
                <p className="text-sm leading-relaxed">"{liveText}"</p>
              </motion.div>
            </div>
          )}

          {/* Agent Activity Indicators */}
          {(isThinking || isSpeaking) && (
            <div className="flex justify-start w-full">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl rounded-tl-sm px-5 py-4 flex flex-col items-start gap-3 shadow-xl"
              >
                {isThinking ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-[#8052ff] border-t-transparent animate-spin"></div>
                    <p className="text-[#8052ff] text-xs font-bold tracking-widest uppercase">
                      Executing Task...
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-6 w-full">
                    <div className="flex items-center gap-1.5 h-6">
                      {[...Array(5)].map((_, i) => (
                        <motion.div
                          key={i}
                          animate={{ height: ["20%", "100%", "20%"] }}
                          transition={{
                            repeat: Infinity,
                            duration: 0.5,
                            delay: i * 0.1,
                          }}
                          className="w-1 bg-emerald-400 rounded-full"
                        />
                      ))}
                    </div>
                    <button
                      onClick={stopSpeaking}
                      className="px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/20 active:scale-95 transition-all"
                    >
                      Stop
                    </button>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </div>
      </div>

      {/* Input Area (Bottom Bar) */}
      <div className="shrink-0 p-4 md:p-6 z-20 bg-black/80 backdrop-blur-xl border-t border-white/10 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 max-w-2xl mx-auto w-full">
          {/* Voice Button */}
          <button
            onClick={() => {
              if (isActive) stopListening();
              else armVoice();
            }}
            className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all shrink-0 shadow-lg ${
              isActive
                ? "bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] scale-105"
                : "bg-white/10 hover:bg-white/20 text-white"
            }`}
          >
            {isActive ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect>
              </svg>
            ) : (
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="22"></line>
              </svg>
            )}
          </button>

          {/* Text Input */}
          <div className="flex-1 relative flex items-center">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a command..."
              className="w-full bg-white/10 border border-white/20 rounded-full py-4 pl-5 pr-14 text-sm text-white placeholder-white/50 focus:outline-none focus:border-[#8052ff]/70 focus:bg-white/15 transition-all shadow-inner"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isThinking}
              className="absolute right-1.5 w-10 h-10 rounded-full bg-[#8052ff] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(128,82,255,0.4)] transition-transform active:scale-95"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
