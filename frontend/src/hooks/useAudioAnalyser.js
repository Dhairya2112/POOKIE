import { useEffect, useRef, useState, useCallback } from "react";

export function useAudioAnalyser() {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const dataArrayRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const smoothedEnergyRef = useRef(0.0);

  const startListening = useCallback(async (onTranscript) => {
    setError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          "Web Audio API not supported in this browser environment.",
        );
      }

      // Initialize Speech Recognition if available
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onresult = (event) => {
          let transcript = event.results[0][0].transcript;

          // Phonetic correction for misheard "Setu" wake word variations (Google/browser STT limits)
          const lower = transcript.toLowerCase().trim();
          const misheardPrefixes = [
            "hey say to",
            "hey set to",
            "hey c2",
            "hey c two",
            "hey seytu",
            "hey sato",
            "hey sito",
            "hey statu",
            "hey center",
            "hey sentry",
          ];

          const matchedPrefix = misheardPrefixes.find((p) =>
            lower.startsWith(p),
          );
          if (matchedPrefix) {
            const regex = new RegExp(`^${matchedPrefix}`, "i");
            transcript = transcript.replace(regex, "hey setu");
          } else {
            const singleNameMishears = [
              "say to",
              "set to",
              "c2",
              "c two",
              "seytu",
              "sato",
              "sito",
              "statu",
              "center",
              "sentry",
            ];
            if (singleNameMishears.includes(lower)) {
              transcript = "setu";
            }
          }

          if (onTranscript && transcript.trim() !== "") {
            onTranscript(transcript);
          }
        };

        recognition.onerror = (event) => {
          console.warn("Speech recognition error", event.error);
        };

        recognition.onend = () => {
          // Auto-stop the visualizer when speech recognition ends naturally (e.g. silence)
          setIsActive(false);
        };

        speechRecognitionRef.current = recognition;
        recognition.start();
      } else {
        console.warn(
          "Speech Recognition not supported in this browser. Fallback to manual typing.",
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      streamRef.current = stream;

      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      // Handle typical browser interactive autoplay blocks
      if (ctx.state === "suspended") {
        const resumeContext = async () => {
          await ctx.resume();
          window.removeEventListener("click", resumeContext);
          window.removeEventListener("keydown", resumeContext);
        };
        window.addEventListener("click", resumeContext);
        window.addEventListener("keydown", resumeContext);
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128; // Small bin size = minimal processing latency
      analyser.smoothingTimeConstant = 0.65; // High responsiveness hardware filter

      source.connect(analyser);
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      setIsActive(true);
    } catch (err) {
      console.warn("Microphone configuration error:", err);
      setError(err.message || "Microphone activation blocked.");
      setIsActive(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    }
    analyserRef.current = null;
    dataArrayRef.current = null;
    smoothedEnergyRef.current = 0.0;
    setIsActive(false);
  }, []);

  const getNormalizedEnergy = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return 0.0;

    const analyser = analyserRef.current;
    const buffer = dataArrayRef.current;
    analyser.getByteFrequencyData(buffer);

    // Focus analysis tightly on the vocal range: 250Hz - 2000Hz (bins 6 to 48)
    const vocalRange = buffer.slice(6, 48);
    const sum = vocalRange.reduce((acc, val) => acc + val, 0);
    const rawAverage =
      vocalRange.length > 0 ? sum / vocalRange.length / 255.0 : 0.0;

    // Apply Exponential Moving Average (EMA) to prevent visual vertex stutter
    const alpha = 0.35; // Custom filter coefficient (high values increase reactivity)
    smoothedEnergyRef.current =
      alpha * rawAverage + (1.0 - alpha) * smoothedEnergyRef.current;

    return smoothedEnergyRef.current;
  }, []);

  /**
   * Continuous validation during Speaking state (State 3).
   * Triggers callback instantly to interrupt TTS and return to Listening State.
   * @param sensitivityThreshold - Derived from Settings Slider (0.0 - 1.0)
   * @param onBargeIn - Callback to execute on interruption
   */
  const monitorBargeIn = useCallback(
    (sensitivityThreshold, onBargeIn) => {
      if (!analyserRef.current) return;
      const currentVolume = getNormalizedEnergy();

      // Scale sensitivity threshold so that a lower sensitivity value in UI requires a higher acoustic burst
      const mappedThreshold = (1.0 - sensitivityThreshold) * 0.85 + 0.1;

      if (currentVolume > mappedThreshold) {
        onBargeIn();
      }
    },
    [getNormalizedEnergy],
  );

  useEffect(() => {
    return () => stopListening();
  }, [stopListening]);

  return {
    startListening,
    stopListening,
    getNormalizedEnergy,
    monitorBargeIn,
    isActive,
    error,
  };
}
