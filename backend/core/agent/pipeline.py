"""
Setu Agent Command Processing (Step 8.5 + Step 14.6)

This module contains the main command processing function that:
  1. Checks Tier 0 fast-path for instant responses
  2. Runs the LLM agent on complex commands
  3. Streams the response word-by-word to the WebSocket channel
  4. Generates TTS audio (cached for fast responses) and sends it to the client
  5. Persists the conversation to MongoDB

The agent, TTS engine, fast router, and TTS cache are initialized once at
module level (singleton pattern) to avoid reloading heavy models on every
function call.
"""

import logging
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from core.conversations.models import Conversation, Message, MessageMetadata

logger = logging.getLogger('core.agent')

# ── User preference cache ──────────────────────────────────
# Avoids a MongoDB lookup on every single command.
from django.core.cache import cache

from core.agent.state import (get_agent, get_fast_router, get_tts,
                              get_tts_cache, is_cancelled,
                              register_cancellation, unregister_cancellation)

_PREF_CACHE_TTL  = 300  # 5 minutes


def _get_user_prefs(user_id: str) -> dict:
    """
    Get user display name + TTS preferences, with a 5-minute in-memory cache.
    Falls back to safe defaults if the user is not found (e.g. user_id='local').
    """
    cache_key = f"user_prefs_{user_id}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    # Defaults (used for local listener or if DB is unreachable)
    prefs = {
        'name': 'there',
        'voice': 'af_heart',
        'speed': 1.0,
        'lang': 'en',
    }

    try:
        from core.users.models import User
        user = User.objects(user_id=user_id).first()
        if user:
            prefs['name'] = user.username or 'there'
            if user.preferences:
                pref = user.preferences
                prefs['lang'] = pref.language or 'en'
                gender = pref.tts_voice_gender or 'female'
                prefs['speed'] = pref.tts_speed or 1.0
                if prefs['lang'] == 'hi':
                    prefs['voice'] = 'hf_alpha' if gender == 'female' else 'hm_omega'
                else:
                    prefs['voice'] = 'af_heart' if gender == 'female' else 'am_echo'
    except Exception as e:
        logger.warning("Failed to load user prefs for %s: %s", user_id, e)

    cache.set(cache_key, prefs, _PREF_CACHE_TTL)
    return prefs


def clear_user_pref_cache(user_id: str) -> None:
    """Clear the cached preferences for a specific user to force a database reload."""
    cache.delete(f"user_prefs_{user_id}")
    logger.info("Cleared user preference cache for: %s", user_id)


def _push(channel_layer, group: str, chunk_type: str, message: str) -> None:
    """Helper: synchronously push a message to a WebSocket channel group."""
    async_to_sync(channel_layer.group_send)(
        group,
        {'type': 'agent_message', 'chunk_type': chunk_type, 'message': message}
    )


def _persist_conversation(
    conversation_id: str, user_id: str,
    user_text: str, assistant_text: str
) -> None:
    """Helper: save a user→assistant exchange to MongoDB."""
    try:
        msg1 = Message(role='user', content=user_text, metadata=MessageMetadata(input_type='text'))
        msg2 = Message(role='assistant', content=assistant_text, metadata=MessageMetadata(input_type='text'))

        updated = Conversation.objects(conversation_id=conversation_id).update_one(
            set__last_updated=datetime.now(timezone.utc),
            push_all__messages=[msg1, msg2]
        )
        
        if not updated:
            conv = Conversation(
                conversation_id=conversation_id,
                user_id=user_id,
                messages=[msg1, msg2]
            )
            conv.save()
    except Exception as e:
        logger.error("Failed to save conversation %s to MongoDB: %s", conversation_id, e)


def process_agent_command(text: str, conversation_id: str, user_id: str, channel_group_name: str = None) -> bool:
    """
    Process a user command through the Setu agent pipeline.

    Pipeline order:
      1. Tier 0 fast-path (regex match → cached TTS → instant response)
      2. Full LLM pipeline (LangGraph agent → streaming TTS)

    Args:
        text:            The user's text command.
        conversation_id: UUID for the active conversation (WebSocket group key).
        user_id:         UUID of the requesting user.
    """
    channel_layer = get_channel_layer()
    group = channel_group_name if channel_group_name else f'chat_{conversation_id}'
    has_error = False

    try:
        register_cancellation(conversation_id)

        # ── Load cached user preferences ──────────────────────────────────────
        prefs = _get_user_prefs(user_id)
        voice = prefs['voice']
        speed = prefs['speed']

        if is_cancelled(conversation_id):
            _push(channel_layer, group, 'status', 'cancelled')
            return True

        # ── TIER 0: Fast-path check (< 0.3s) ─────────────────────────────────
        start_time = time.time()
        fast = get_fast_router().check(text, user_name=prefs['name'], language=prefs['lang'])
        if fast:
            duration = time.time() - start_time
            logger.info("Tier 0 fast response [%s] matched in %.4fs: '%s' → '%s'", fast.category, duration, text, fast.text)

            if is_cancelled(conversation_id):
                _push(channel_layer, group, 'status', 'cancelled')
                return True

            _push(channel_layer, group, 'text', fast.text)

            # Use cached TTS audio (generates on first hit, instant on subsequent)
            tts_start = time.time()
            try:
                audio_b64 = get_tts_cache().get_or_generate(fast.text, voice, get_tts(), speed)
                tts_duration = time.time() - tts_start
                logger.info("Tier 0 TTS cache lookup/generation took %.4fs", tts_duration)
                if audio_b64 and not is_cancelled(conversation_id):
                    _push(channel_layer, group, 'audio', audio_b64)
            except Exception as e:
                logger.warning("TTS cache lookup/generation failed for fast-path: %s", e)

            if is_cancelled(conversation_id):
                _push(channel_layer, group, 'status', 'cancelled')
                return True

            # Persist to conversation history
            _persist_conversation(conversation_id, user_id, text, fast.text)

            # Prevent frontend race condition where instant audio + status:done interrupts playback
            time.sleep(0.2)

            _push(channel_layer, group, 'status', 'done')
            return True

        # ── TIER 2: Full LLM pipeline ─────────────────────────────────────────
        # (Tier 1 — Intent Classifier — will be inserted here in Step 15)

        if is_cancelled(conversation_id):
            _push(channel_layer, group, 'status', 'cancelled')
            return True

        # Notify client: thinking / understanding
        _push(channel_layer, group, 'status', 'understanding')

        # ── Run agent & stream response tokens in real-time ──────────────────
        response_text = ""
        sentence_buffer = ""
        audio_buffer = ""
        has_error = False

        try:
            def handle_status(status_msg):
                _push(channel_layer, group, 'status', status_msg)
                
            def generate_and_push_tts(sentence):
                try:
                    if not is_cancelled(conversation_id):
                        audio_b64 = get_tts().generate_base64(sentence, voice=voice, speed=speed)
                        if audio_b64 and not is_cancelled(conversation_id):
                            _push(channel_layer, group, 'audio', audio_b64)
                except Exception as e:
                    logger.warning("TTS chunk failed: %s", e)

            # Max workers=1 ensures TTS chunks are generated and sent in spoken order
            tts_executor = ThreadPoolExecutor(max_workers=1)
            try:
                for token in get_agent().run_stream(
                    text, 
                    user_id=user_id, 
                    conversation_id=conversation_id, 
                    status_callback=handle_status
                ):
                    if is_cancelled(conversation_id):
                        logger.info("Command processing cancelled for %s", conversation_id)
                        _push(channel_layer, group, 'status', 'cancelled')
                        tts_executor.shutdown(wait=False)
                        return True
                    if token:
                        _push(channel_layer, group, 'text', token)
                        response_text += token
                        sentence_buffer += token
                        
                        match = re.search(r'([.?!]\s+|\n+)', sentence_buffer)
                        if match:
                            split_idx = match.end()
                            complete_sentence = sentence_buffer[:split_idx].strip()
                            sentence_buffer = sentence_buffer[split_idx:]
                            
                            if complete_sentence:
                                audio_buffer += complete_sentence + " "
                                if len(audio_buffer.split()) >= 8 or '\n' in complete_sentence:
                                    tts_executor.submit(generate_and_push_tts, audio_buffer.strip())
                                    audio_buffer = ""
                
                final_audio = audio_buffer + sentence_buffer
                if final_audio.strip():
                    tts_executor.submit(generate_and_push_tts, final_audio.strip())
                
                tts_executor.shutdown(wait=True)
            except Exception as e:
                try:
                    tts_executor.shutdown(wait=False, cancel_futures=True)
                except TypeError:
                    tts_executor.shutdown(wait=False)
                raise e

        except Exception as e:
            logger.error("LLM stream failed for conversation %s: %s", conversation_id, e)
            if is_cancelled(conversation_id):
                _push(channel_layer, group, 'status', 'cancelled')
                return True
            error_msg = "\n[Response generation interrupted due to a system error.]"
            _push(channel_layer, group, 'text', error_msg)
            response_text += error_msg
            has_error = True
            # Generate and push TTS synchronously so it finishes before 'failed' status is sent
            try:
                generate_and_push_tts("Sorry, I ran into a system error.")
            except Exception as e:
                logger.error("Failed to push error TTS: %s", e)

        if is_cancelled(conversation_id):
            _push(channel_layer, group, 'status', 'cancelled')
            return True

        # ── Persist conversation to MongoDB ───────────────────────────────────
        _persist_conversation(conversation_id, user_id, text, response_text)

        # ── Notify client: done or failed ─────────────────────────────────────
        if has_error:
            _push(channel_layer, group, 'status', 'failed')
        else:
            _push(channel_layer, group, 'status', 'done')

    except Exception as e:
        logger.error("System error processing command: %s", e)
        try:
            _push(channel_layer, group, 'status', 'failed')
        except Exception:
            pass
        return False
    finally:
        unregister_cancellation(conversation_id)

    return True
