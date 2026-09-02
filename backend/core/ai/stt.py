import gc
import os

import numpy as np
import torch
from faster_whisper import WhisperModel


class STTPipeline:
    def __init__(self, model_size=None, device="cpu"):
        self.device = device
        self.model = None
        self.current_size = None
        
        # Load the model dynamically
        self.load_model(model_size)

    def _auto_detect_size(self) -> str:
        override = os.getenv("WHISPER_MODEL_SIZE")
        if override:
            return override
        return "large-v3-turbo"

    def load_model(self, model_size=None):
        if not model_size:
            model_size = self._auto_detect_size()

        if self.current_size == model_size:
            return

        # 1. Unload previous model to free RAM
        if self.model:
            print(f"Unloading STT model ({self.current_size}) to free RAM...")
            del self.model
            self.model = None
            
            # Force garbage collection
            gc.collect()
            
            # Clear CUDA cache if applicable
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            print("Memory cleared successfully.")

        # 2. Load the new Whisper model
        print(f"Loading Faster-Whisper model ({model_size})...")
        self.model = WhisperModel(model_size, device=self.device, compute_type="int8")
        self.current_size = model_size
        print(f"Faster-Whisper model ({model_size}) loaded.")

    def transcribe(self, audio_data: np.ndarray, sample_rate=16000) -> tuple[str, str, float]:
        # audio_data should be float32 array
        
        # Bilingual prompt priming Whisper for terminology, names, and code-switching
        bilingual_prompt = "Setu, open VS Code. मुझे खबरें बताओ। रिमाइंड मी। Aise tu, Setu."
        
        try:
            segments, info = self.model.transcribe(
                audio_data, 
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(
                    threshold=0.35, 
                    min_speech_duration_ms=200,
                    min_silence_duration_ms=400
                ),
                initial_prompt=bilingual_prompt,
                temperature=[0.0, 0.2, 0.4],
                hotwords="Setu setu"
            )
        except TypeError:
            # Fallback for older faster-whisper versions that don't support hotwords
            segments, info = self.model.transcribe(
                audio_data, 
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(
                    threshold=0.35, 
                    min_speech_duration_ms=200,
                    min_silence_duration_ms=400
                ),
                initial_prompt=bilingual_prompt,
                temperature=[0.0, 0.2, 0.4]
            )

        segment_list = list(segments)
        text = " ".join([segment.text for segment in segment_list]).strip()
        
        # Calculate average log probability (confidence)
        if segment_list:
            avg_logprob = sum(s.avg_logprob for s in segment_list) / len(segment_list)
        else:
            avg_logprob = 0.0
            
        print(f"STT: avg_logprob={avg_logprob:.3f} for transcribed text: '{text}'")
        
        # Phonetic correction for misheard "Setu" wake word variations (Whisper STT limits)
        lower = text.lower().strip()
        misheard_prefixes = [
            'hey say to', 'hey set to', 'hey c2', 'hey c two', 
            'hey seytu', 'hey sato', 'hey sito', 'hey statu',
            'hey center', 'hey sentry', 'hey satu', 'hey seutu', 
            'hey seeto', 'hey seetoo', 'hey sheto', 'hey sheeto', 
            'hey zeto', 'hey say two', 'hey set two', 'hey safe to', 
            'hey step to', 'hey send to', 'hey aise tu', 'aise tu', 
            'hey ai setu', 'hey ae setu', 'hey aye setu', 'hey ai se tu', 
            'hey ae se tu', 'hey aye se tu', 'hey siri', 'hey jarvis',
            'hey google', 'ok google', 'hey alexa'
        ]
        
        matched_prefix = next((p for p in misheard_prefixes if lower.startswith(p)), None)
        if matched_prefix:
            import re
            text = re.sub(f"^{matched_prefix}", "hey setu", text, flags=re.IGNORECASE)
        else:
            single_name_mishears = [
                'say to', 'set to', 'c2', 'c two', 'seytu', 'sato', 'sito', 
                'statu', 'center', 'sentry', 'satu', 'seutu', 'seeto', 
                'seetoo', 'sheto', 'sheeto', 'zeto', 'say two', 'set two', 
                'safe to', 'step to', 'send to', 'aise tu', 'ai setu', 
                'ae setu', 'aye setu', 'ai se tu', 'ae se tu', 'aye se tu', 
                'aise', 'siri', 'jarvis', 'google', 'alexa', 'jarvi'
            ]
            if lower in single_name_mishears:
                text = "setu"
                    
        return text, info.language, avg_logprob
