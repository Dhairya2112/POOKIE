import os
import sys
import uuid

from dotenv import load_dotenv

load_dotenv()

# Ensure the agent modules can be found
sys.path.append(os.path.join(os.path.dirname(__file__), 'core'))

import numpy as np
import sounddevice as sd
from agent.fast_responses import FastResponseRouter
from agent.llm_agent import SetuAgent
from ai.stt import STTPipeline
from ai.tts import TTSEngine


def capture_audio_dynamic(sample_rate=16000, silence_threshold=0.015, min_silence_duration=1.5):
    """Captures audio until silence is detected, returning a float32 numpy array."""
    print("\n[Listening... Speak now]")
    audio_data = []
    chunk_duration = 0.1
    chunk_samples = int(sample_rate * chunk_duration)
    
    stream = sd.InputStream(samplerate=sample_rate, channels=1, dtype='float32')
    with stream:
        silent_chunks = 0
        has_spoken = False
        while True:
            chunk, _ = stream.read(chunk_samples)
            chunk = chunk.flatten()
            audio_data.append(chunk)
            
            volume = np.max(np.abs(chunk))
            if volume > silence_threshold:
                has_spoken = True
                silent_chunks = 0
            elif has_spoken:
                silent_chunks += 1
                if silent_chunks * chunk_duration >= min_silence_duration:
                    break
    
    return np.concatenate(audio_data)

import argparse


def main():
    parser = argparse.ArgumentParser(description="Setu Local Listener")
    parser.add_argument("--user", type=str, default="local", help="User ID to load preferences for (defaults to first user if 'local')")
    args = parser.parse_args()
    
    print("--- Starting Setu Agent ---")

    # Initialize all components
    stt = STTPipeline()
    agent = SetuAgent()
    tts = TTSEngine()
    fast_router = FastResponseRouter()

    LOCAL_USER_ID = args.user
    session_conversation_id = str(uuid.uuid4())
    
    # Defaults
    silence_threshold = 0.015
    user_name = os.getenv("SETU_USER_NAME", "User")
    voice_en = 'af_heart'
    voice_hi = 'hf_alpha'
    speed = 1.0

    try:
        from core.users.models import User
        if LOCAL_USER_ID == "local":
            user = User.objects().first()
            if user:
                LOCAL_USER_ID = user.user_id
        else:
            user = User.objects(user_id=LOCAL_USER_ID).first()
            
        if user:
            user_name = user.username or user_name
            if user.preferences:
                pref = user.preferences
                if pref.tts_voice_gender == 'male':
                    voice_en = 'am_echo'
                    voice_hi = 'hm_omega'
                speed = pref.tts_speed or 1.0
                # Map wake word sensitivity to silence threshold (0.01 to 0.1)
                silence_threshold = pref.wake_word_sensitivity or 0.015
            print(f"[Config] Loaded preferences for {user_name} (Threshold: {silence_threshold}, Speed: {speed})")
        else:
            print("[Config] No user found in DB. Using default local settings.")
    except Exception as e:
        print(f"[Config] DB Error, using defaults: {e}")

    print("\n===============================================")
    print("Setu is now online and listening continuously.")
    print("Speak naturally. The agent will respond to you directly.")
    print("===============================================\n")

    try:
        tts.speak("Hello! I am Setu. I am now listening.")
        
        silence_count = 0
        detected_lang = 'en'
        
        # Continuous conversation loop
        while True:
            # 1. Capture audio command
            audio_data = capture_audio_dynamic(silence_threshold=silence_threshold)

            # 3. Speech to Text
            print("Transcribing...")
            text_command, detected_lang, avg_logprob = stt.transcribe(audio_data)
            print(f"USER ({detected_lang}): {text_command}")

            # Confidence / length gate
            min_logprob = float(os.getenv("STT_MIN_LOGPROB", "-1.50"))
            is_valid = True
            if not text_command.strip() or len(text_command.strip()) < 2:
                is_valid = False
            elif avg_logprob < min_logprob:
                print(f"STT gate: Discarding low-confidence transcription '{text_command}' (avg_logprob={avg_logprob:.3f} < {min_logprob})")
                is_valid = False

            if not is_valid:
                voice = 'hf_alpha' if detected_lang == 'hi' else 'af_heart'
                tts.speak("Sorry, I didn't catch that.", voice=voice)
                continue

            # Clean punctuation and check for exit commands
            clean_command = text_command.lower()
            for p in ".,!?":
                clean_command = clean_command.replace(p, "")
            clean_command = clean_command.strip()

            words = clean_command.split()

            # If empty, or a short phrase containing exit words
            is_exit = False
            if not clean_command:
                silence_count += 1
                if silence_count >= 2:
                    is_exit = True
                else:
                    print("No speech detected. Prompting user...")
                    voice = voice_hi if detected_lang == 'hi' else voice_en
                    tts.speak("Are you still there?", voice=voice, speed=speed)
                    continue
            elif len(words) <= 3 and any(w in ["no", "nope", "bye", "goodbye", "thanks", "thank", "stop", "nothing"] for w in words):
                is_exit = True
            else:
                silence_count = 0

            if is_exit:
                print("Goodbye requested. Exiting...")
                tts.speak("Goodbye!")
                break

            # Determine voice based on detected language
            voice = voice_hi if detected_lang == 'hi' else voice_en

            # 3.5. Tier 0 fast-path — instant response for greetings, etc.
            fast = fast_router.check(text_command, user_name=user_name, language=detected_lang)
            if fast:
                print(f"[Tier 0 — {fast.category}] {fast.text}")
                tts.speak(fast.text, voice=voice, speed=speed)
                print("\nListening for follow-up...")
                continue

            # 4. Agent Execution — pass user_id and conversation_id
            print("Agent is thinking...")
            response = agent.run(
                text_command,
                user_id=LOCAL_USER_ID,
                conversation_id=session_conversation_id
            )

            # 5. Text to Speech
            tts.speak(response, voice=voice, speed=speed)

            # Follow up prompt
            if not response.strip().endswith('?'):
                tts.speak("Anything else?", voice=voice, speed=speed)

            print("\nListening for follow-up...")

        print("\nReady for next command...")

    except KeyboardInterrupt:
        print("\nSetu Shutting down.")

if __name__ == "__main__":
    main()
