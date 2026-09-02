import logging
import threading

logger = logging.getLogger('core.agent')

_agent_instance = None
_tts_engine = None
_fast_router = None
_tts_cache = None
_stt_pipeline = None

_models_ready = threading.Event()

def init_models():
    global _agent_instance, _tts_engine, _fast_router, _tts_cache, _stt_pipeline
    
    if _models_ready.is_set():
        return  # Already initialized
        
    logger.info("Starting centralized ML model initialization (App Config) in background...")
    
    try:
        from core.agent.fast_responses import FastResponseRouter
        from core.agent.llm_agent import SetuAgent
        from core.agent.tts_cache import TTSCache
        from core.ai.stt import STTPipeline
        from core.ai.tts import TTSEngine

        _agent_instance = SetuAgent()
        _tts_engine = TTSEngine()
        _fast_router = FastResponseRouter()
        _tts_cache = TTSCache()
        _stt_pipeline = STTPipeline()
        
        # Pre-warm common greetings asynchronously at server boot
        _tts_cache.warm_cache(_tts_engine, user_names=["there", "User", "dost", "daved"])
        logger.info("Centralized ML model initialization complete.")
    except Exception as e:
        logger.error(f"FATAL: ML model initialization failed: {e}", exc_info=True)
    finally:
        _models_ready.set()

def get_agent():
    _models_ready.wait()
    return _agent_instance

def get_tts():
    _models_ready.wait()
    return _tts_engine

def get_fast_router():
    _models_ready.wait()
    return _fast_router

def get_tts_cache():
    _models_ready.wait()
    return _tts_cache

def get_stt():
    _models_ready.wait()
    return _stt_pipeline

# --- Cancellation State ---
_cancellation_registry = {}  # { conversation_id: threading.Event }
_lock = threading.Lock()

def register_cancellation(conversation_id: str) -> threading.Event:
    with _lock:
        event = threading.Event()
        _cancellation_registry[conversation_id] = event
        logger.debug("Registered cancellation event for conversation: %s", conversation_id)
        return event

def unregister_cancellation(conversation_id: str):
    with _lock:
        _cancellation_registry.pop(conversation_id, None)
        logger.debug("Unregistered cancellation event for conversation: %s", conversation_id)

def cancel_active_command(conversation_id: str):
    with _lock:
        event = _cancellation_registry.get(conversation_id)
        if event:
            event.set()
            logger.info("Signalled cancellation for conversation: %s", conversation_id)
        else:
            logger.info("No active cancellation event found for conversation: %s", conversation_id)

def is_cancelled(conversation_id: str) -> bool:
    with _lock:
        event = _cancellation_registry.get(conversation_id)
        if event:
            return event.is_set()
        return False

# --- Interactive Permissions State ---
_permission_registry = {}  # { request_id: {"event": threading.Event(), "status": "pending"} }

def register_permission_request(request_id: str) -> threading.Event:
    with _lock:
        event = threading.Event()
        _permission_registry[request_id] = {"event": event, "status": "pending"}
        return event

def resolve_permission_request(request_id: str, status: str):
    with _lock:
        entry = _permission_registry.get(request_id)
        if entry:
            entry["status"] = status
            entry["event"].set()

def get_permission_status(request_id: str) -> str:
    with _lock:
        entry = _permission_registry.get(request_id)
        if entry:
            return entry["status"]
        return "denied"  # default deny if not found

def clear_permission_request(request_id: str):
    with _lock:
        _permission_registry.pop(request_id, None)
