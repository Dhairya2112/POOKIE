import { useState, useEffect, useCallback, useRef } from "react";

export function useAgentSocket({
  token,
  conversationId,
  onReminderFired,
  isMobileClient = false,
  onSwitchConversation,
}) {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeStatus, setActiveStatus] = useState("idle");
  const [permissionRequest, setPermissionRequest] = useState(null);

  const [mobileConnected, setMobileConnected] = useState(false);
  const [connectedDeviceName, setConnectedDeviceName] =
    useState("Mobile Remote");

  const socketRef = useRef(null);
  const currentAudioRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isStreamingRef = useRef(false);
  const isInterruptedRef = useRef(false);
  const lastCommandSourceRef = useRef("desktop");
  const pingIntervalRef = useRef(null);

  const onReminderFiredRef = useRef(onReminderFired);
  const isMobileClientRef = useRef(isMobileClient);
  const onSwitchConversationRef = useRef(onSwitchConversation);

  useEffect(() => {
    onReminderFiredRef.current = onReminderFired;
  }, [onReminderFired]);

  useEffect(() => {
    isMobileClientRef.current = isMobileClient;
  }, [isMobileClient]);

  useEffect(() => {
    onSwitchConversationRef.current = onSwitchConversation;
  }, [onSwitchConversation]);

  const playNextAudio = useCallback(function playNext() {
    if (audioQueueRef.current.length === 0) {
      setIsSpeaking(false);
      currentAudioRef.current = null;
      return;
    }

    const nextAudioUrl = audioQueueRef.current.shift();
    const audio = new Audio(nextAudioUrl);
    currentAudioRef.current = audio;

    audio.onplay = () => setIsSpeaking(true);
    audio.onended = () => playNext();
    audio.onerror = (e) => {
      console.error("Audio playback error:", e);
      playNext();
    };

    audio.play().catch((e) => {
      console.error("Browser blocked audio playback:", e);
      playNext();
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    isInterruptedRef.current = true;
    audioQueueRef.current = [];
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  // Load existing conversation history from MongoDB on mount
  useEffect(() => {
    if (!token || !conversationId) return;

    fetch(
      `${import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`}/api/v1/conversations/${conversationId}/`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data?.messages?.length > 0) {
          const restored = data.messages.map((msg) => ({
            role: msg.role === "user" ? "user" : "agent",
            text: msg.content,
          }));
          setMessages(restored);
        }
      })
      .catch((err) =>
        console.warn("Could not load conversation history:", err),
      );
  }, [token, conversationId]);

  useEffect(() => {
    if (!token || !conversationId) return;

    let reconnectTimeoutId;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    let isManualCleanup = false;

    const connect = () => {
      if (isManualCleanup) return;

      const wsUrl = `${import.meta.env.VITE_WS_BASE_URL || `ws://${window.location.hostname}:8000`}/ws/stream/${conversationId}/${isMobileClientRef.current ? "?device=mobile" : ""}`;
      console.log(
        `Attempting WebSocket connection... (Attempt ${reconnectAttempts + 1})`,
      );

      // Pass token securely via subprotocols to prevent URL logging leaks
      const ws = new WebSocket(wsUrl, ["access_token", token]);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket Connected");
        setIsConnected(true);
        reconnectAttempts = 0; // Reset connection attempts on success

        // Request connected devices status upon connecting
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ action: "ping_devices" }));
        }

        // BUG-16 fix: Start ping interval to keep WS alive and store ref to prevent memory leak
        pingIntervalRef.current = setInterval(() => {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ action: "ping_devices" }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.chunk_type === "text") {
          setIsThinking(false);
          setMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            if (isStreamingRef.current && lastMsg && lastMsg.role === "agent") {
              return [
                ...prev.slice(0, -1),
                { role: "agent", text: lastMsg.text + data.message },
              ];
            } else {
              isStreamingRef.current = true;
              return [...prev, { role: "agent", text: data.message }];
            }
          });
        } else if (data.chunk_type === "text_user") {
          setIsThinking(false);
          isInterruptedRef.current = false; // BUG-15 fix: Reset on new command from ANY device
          lastCommandSourceRef.current = data.source || "desktop";
          setMessages((prev) => [
            ...prev,
            { role: "user", text: data.message, source: data.source },
          ]);
        } else if (data.chunk_type === "switch_conversation") {
          if (
            onSwitchConversationRef.current &&
            data.conversation_id &&
            data.conversation_id !== conversationId
          ) {
            onSwitchConversationRef.current(data.conversation_id);
          }
        } else if (data.chunk_type === "audio") {
          if (isInterruptedRef.current) return;

          if (!isMobileClientRef.current && lastCommandSourceRef.current === "mobile") {
            return;
          }

          const audioUrl = `data:audio/wav;base64,${data.message}`;
          audioQueueRef.current.push(audioUrl);

          if (
            !currentAudioRef.current ||
            currentAudioRef.current.ended ||
            currentAudioRef.current.paused
          ) {
            playNextAudio();
          }
        } else if (data.chunk_type === "reminder") {
          fetch(
            `${import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`}/api/v1/reminders/${data.reminder_id}/`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          ).catch((err) => console.error("Error acknowledging reminder:", err));

          if (onReminderFiredRef.current) {
            onReminderFiredRef.current({
              id: data.reminder_id,
              title: data.title,
              body: data.body,
            });
          }
        } else if (data.chunk_type === "permission_request") {
          setPermissionRequest(data.message);
        } else if (data.chunk_type === "device_status") {
          if (data.device === "mobile") {
            setMobileConnected(data.status === "connected");
            if (data.device_name) {
              setConnectedDeviceName(data.device_name);
            }
          }
        } else if (data.chunk_type === "status") {
          setActiveStatus(data.message);
          if (
            [
              "acknowledged",
              "thinking",
              "done",
              "cancelled",
              "failed",
            ].includes(data.message)
          ) {
            setIsThinking(
              data.message === "acknowledged" || data.message === "thinking",
            );
            isStreamingRef.current = false;

            // BUG-15 fix: Reset interrupt flag when a new command officially starts processing
            if (
              data.message === "acknowledged" ||
              data.message === "thinking"
            ) {
              isInterruptedRef.current = false;
            }
          }
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket Error:", error);
      };

      ws.onclose = (event) => {
        console.log(
          `WebSocket Disconnected: Code ${event.code}, Reason: ${event.reason}`,
        );
        setIsConnected(false);

        if (isManualCleanup) return;

        if (event.code === 4001) {
          console.warn(
            "WebSocket closed due to unauthorized token (4001). Reconnection skipped.",
          );
          return;
        }

        if (reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
          console.log(`Reconnecting WebSocket in ${delay}ms...`);
          reconnectTimeoutId = setTimeout(() => {
            reconnectAttempts++;
            connect();
          }, delay);
        } else {
          console.error("Max WebSocket reconnection attempts reached.");
        }
      };
    };

    connect();

    return () => {
      isManualCleanup = true;
      audioQueueRef.current = [];
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      clearTimeout(reconnectTimeoutId);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current); // BUG-16 fix
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [token, conversationId, playNextAudio]);

  const sendCommand = useCallback((text) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      stopSpeaking();
      isInterruptedRef.current = false;
      lastCommandSourceRef.current = isMobileClientRef.current ? "mobile" : "desktop";
      setMessages((prev) => [...prev, { role: "user", text }]);
      setIsThinking(true);
      setActiveStatus("running");
      socketRef.current.send(JSON.stringify({ text }));
    } else {
      console.error("WebSocket is not open.");
    }
  }, [stopSpeaking]);

  const cancelTask = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "cancel" }));
    }
  }, []);

  const resolvePermissionRequest = useCallback((requestId, status) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          action: "permission_response",
          request_id: requestId,
          status: status,
        }),
      );
      setPermissionRequest(null);
    }
  }, []);

  const switchConversation = useCallback((newId) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          action: "switch_conversation",
          conversation_id: newId,
        }),
      );
    }
  }, []);

  return {
    isConnected,
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
    switchConversation,
  };
}
