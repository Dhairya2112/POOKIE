import base64
import io
import re

import numpy as np
import soundfile as sf
from kokoro import KPipeline


class TTSEngine:
    def __init__(self):
        self.pipelines = {}
        self.default_voice = 'af_heart'
        print("Kokoro TTSEngine initialized (models will load lazily).")

    @staticmethod
    def _clean_text(text: str) -> str:
        """Strip markdown symbols so TTS reads naturally."""
        if not text:
            return ""
        # Remove markdown bold/italic asterisks and underscores
        text = re.sub(r'[*_]{1,3}([^*_]+)[*_]{1,3}', r'\1', text)
        # Remove headers
        text = re.sub(r'#+\s*', '', text)
        # Remove links [text](url) -> text
        text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
        # Remove inline code blocks
        text = re.sub(r'`([^`]+)`', r'\1', text)
        # Remove stray asterisks, underscores, or hash marks
        text = re.sub(r'[*_#`]', '', text)
        
        text = text.strip()
        # Kokoro hangs in an infinite loop on purely non-alphanumeric text
        if not any(c.isalnum() for c in text):
            return ""
            
        return text

    def _get_pipeline(self, voice: str):
        lang = 'a'
        if voice and voice.startswith('h'):
            lang = 'h'
            
        if lang not in self.pipelines:
            print(f"Lazy-loading Kokoro TTS pipeline for language '{lang}'...")
            self.pipelines[lang] = KPipeline(lang_code=lang)
            
        return self.pipelines[lang]

    def speak(self, text: str, voice: str = 'af_heart', speed: float = 1.0):
        text = self._clean_text(text)
        print(f"Setu (TTS): {text}")
        pipeline = self._get_pipeline(voice)
        generator = pipeline(
            text, voice=voice,
            speed=speed
        )
        
        audio_chunks = []
        for i, (gs, ps, audio) in enumerate(generator):
            if audio is not None:
                audio_chunks.append(audio)
                
        if audio_chunks:
            np.concatenate(audio_chunks)
            # Local playback removed for cross-device automation

    def generate_base64(self, text: str, voice: str = 'af_heart', speed: float = 1.0) -> str:
        """Generates TTS audio and returns it as a Base64 encoded WAV string for WebSockets."""
        text = self._clean_text(text)
        if not text:
            return ""
            
        pipeline = self._get_pipeline(voice)
        generator = pipeline(
            text, voice=voice,
            speed=speed
        )
        
        audio_chunks = []
        for i, (gs, ps, audio) in enumerate(generator):
            if audio is not None:
                audio_chunks.append(audio)
                
        if not audio_chunks:
            return ""
            
        full_audio = np.concatenate(audio_chunks)
        
        # Normalize/clip audio to prevent PCM_16 wrap-around distortion
        full_audio = np.clip(full_audio, -1.0, 1.0)
        
        # Convert numpy array to WAV bytes in memory
        wav_io = io.BytesIO()
        sf.write(wav_io, full_audio, 24000, format='WAV', subtype='PCM_16')
        wav_io.seek(0)
        
        # Encode to Base64 string
        return base64.b64encode(wav_io.read()).decode('utf-8')
