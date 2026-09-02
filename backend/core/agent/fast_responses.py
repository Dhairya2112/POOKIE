"""
Setu Tier 0 — Fast Response Router

Regex/keyword matcher that intercepts trivial commands (greetings, farewells,
thanks, etc.) BEFORE the LLM pipeline. Returns a pre-defined response in < 0.3s.

This is the first layer of the 3-tier response architecture:
  Tier 0 (this) → Tier 1 (Intent Classifier, Step 15) → Tier 2 (LLM)
"""

import random
import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class FastResponse:
    """A pre-defined response that bypasses the LLM pipeline."""
    text: str
    category: str


# ── Pattern definitions ─────────────────────────────────────────────────────
# Each category maps to:
#   patterns     — list of regex strings (matched against cleaned input)
#   responses    — English response templates ({name} placeholder)
#   responses_hi — Hindi/Hinglish response templates

_PATTERNS = {
    'GREETING': {
        'patterns': [
            # English greetings
            r'^(hey|hi|hello|hiya|howdy|yo|sup|whats\s*up|what\'s\s*up|yo\s+what\'s\s*up)(\s+(setu|sidhu|situ|there|buddy|bro|friend|guy))?$',
            r'^good\s+(morning|afternoon|evening|day)(\s+(setu|sidhu|situ|there|buddy|bro|friend))?$',
            # Hindi / Hinglish greetings
            r'^(namaste|namaskar|pranam|ram\s+ram|radhe\s+radhe|jai\s+shree\s+krishna)(\s+(setu|sidhu|situ|bhai|bhaiya|babu))?$',
            r'^(suno|suniye)(\s+(setu|sidhu|situ))?$',
            # Just the wake word by itself = greeting
            r'^(setu|sidhu|situ)$',
        ],
        'responses': [
            "Hey {name}! What can I do for you?",
            "Hi {name}! How can I help?",
            "Hello {name}! What's on your mind?",
            "Hey {name}! Ready when you are.",
        ],
        'responses_hi': [
            "Namaste {name}! Kya kar sakta hoon aapke liye?",
            "Hello {name}! Batao, kya karna hai?",
            "Hey {name}! Main hoon, batao!",
        ],
    },
    'FAREWELL': {
        'patterns': [
            r'^(bye|goodbye|good\s*bye|see\s+you|later|cya|peace\s+out|peace)(\s+(bye|setu|buddy|bro|friend|for\s+now))?$',
            r'^good\s*night(\s+(setu|buddy|bro|friend))?$',
            r'^(alvida|phir\s+milte\s+hain|chalta\s+hoon|chal\s+bye|tata|bye\s+bye)(\s+setu)?$',
        ],
        'responses': [
            "Goodbye {name}! I'll be right here when you need me.",
            "See you later {name}! Take care.",
            "Bye {name}! Have a great one!",
        ],
        'responses_hi': [
            "Alvida {name}! Jab zaroorat ho, bula lena.",
            "Bye {name}! Apna khayal rakhna!",
        ],
    },
    'THANKS': {
        'patterns': [
            r'^(thanks|thank\s+you|thx|ty|cheers)(\s+(setu|buddy|bro|friend|a\s+lot|so\s+much|very\s+much))?$',
            r'^(appreciate\s+it|much\s+appreciated)$',
            r'^(shukriya|dhanyavaad|dhanyawad|bahut\s+shukriya|shukriya\s+bhai|dhanyawad\s+bhai)(\s+setu)?$',
        ],
        'responses': [
            "You're welcome! Need anything else?",
            "Happy to help! Anything else?",
            "Anytime! What's next?",
            "No problem! Let me know if you need more.",
        ],
        'responses_hi': [
            "Koi baat nahi! Aur kuch karna hai?",
            "Khushi hui madad karke! Aur batao?",
        ],
    },
    'HOW_ARE_YOU': {
        'patterns': [
            r'^how\s+(are\s+you|r\s+u|are\s+ya)(\s+(doing|feeling))?(\s+(today|now|setu|buddy|bro|friend))?$',
            r'^how\'s\s+(it\s+going|everything|life|it|things)(\s+(setu|buddy|bro|friend))?$',
            r'^how\s+is\s+(it\s+going|everything|life|it|things)(\s+(setu|buddy|bro|friend))?$',
            r'^(what\'s\s+good|you\s+good|all\s+good|are\s+you\s+good)(\s+setu)?$',
            r'^how\s+do\s+you\s+do(\s+setu)?$',
            # Hindi / Hinglish
            r'^(kaise\s+ho|kaisa\s+hai|sab\s+theek|sab\s+theek\s+thak|sab\s+theek\s+hai)(\s+setu)?$',
            r'^(tum\s+kaise\s+ho|aap\s+kaise\s+hain|aap\s+kaise\s+ho)(\s+setu)?$',
            r'^(kaise\s+ho\s+aap|kaise\s+hain\s+aap|kaise\s+ho\s+tum)(\s+setu)?$',
            r'^(kya\s+haal\s+hai|kya\s+chal\s+raha\s+hai|kya\s+haal\s+chaal|aur\s+batao|kya\s+samachar)(\s+setu)?$',
        ],
        'responses': [
            "I'm great, {name}! Ready to help. What do you need?",
            "Doing well! What can I do for you?",
            "All systems running smoothly! How can I help?",
        ],
        'responses_hi': [
            "Main bilkul theek hoon, {name}! Batao kya karna hai?",
            "Sab badhiya! Aapke liye kya kar sakta hoon?",
        ],
    },
    'WHAT_ARE_YOU': {
        'patterns': [
            r'^(what|who)\s+(are\s+you|r\s+u|is\s+setu)(\s+(exactly|setu|buddy))?$',
            r'^what\s+can\s+you\s+do(\s+for\s+me)?(\s+setu)?$',
            r'^what\s+do\s+you\s+do(\s+setu)?$',
            r'^introduce\s+(yourself|you)(\s+setu)?$',
            # Hindi / Hinglish
            r'^(tum\s+kaun\s+ho|aap\s+kaun\s+hain|tu\s+kaun\s+hai)(\s+setu)?$',
            r'^(tum\s+kya\s+kar\s+sakte\s+ho|aap\s+kya\s+kar\s+sakte\s+hain|tum\s+kya\s+karte\s+ho)(\s+setu)?$',
        ],
        'responses': [
            "I'm Setu — your AI assistant! I can open apps, search the web, manage files, set reminders, and automate tasks on your computer. Just tell me what you need!",
        ],
        'responses_hi': [
            "Main Setu hoon — aapka AI assistant! Apps kholna, web search, files manage karna, reminders set karna — sab kar sakta hoon. Batao kya karna hai!",
        ],
    },
}


# ── Pre-compile all regex patterns once at import time ──────────────────────
_COMPILED_PATTERNS = {}
for _cat, _data in _PATTERNS.items():
    _COMPILED_PATTERNS[_cat] = {
        'regexes': [re.compile(p, re.IGNORECASE) for p in _data['patterns']],
        'responses': _data['responses'],
        'responses_hi': _data.get('responses_hi', _data['responses']),
    }


class FastResponseRouter:
    """
    Tier 0 response router. Checks if a command matches a trivial pattern
    and returns an instant response without touching the LLM.

    Usage:
        router = FastResponseRouter()
        fast = router.check("hey setu", user_name="Dhairya")
        if fast:
            print(fast.text)      # "Hey Dhairya! What can I do for you?"
            print(fast.category)  # "GREETING"
    """

    # Wake word prefixes that STT might prepend — stripped before matching
    _WAKE_PREFIXES = re.compile(
        r'^(hey\s+setu|hi\s+setu|hello\s+setu|setu)\s*[,:]?\s+',
        re.IGNORECASE
    )

    def check(
        self, text: str, user_name: str = None, language: str = 'en'
    ) -> Optional[FastResponse]:
        """
        Check if the text matches a Tier 0 fast response pattern.

        Args:
            text:      The transcribed user command.
            user_name: The user's display name (for personalization).
            language:  Detected language code ('en', 'hi', etc.)

        Returns:
            FastResponse if matched, None otherwise (pass to Tier 1/2).
        """
        if not text or not text.strip():
            return None

        name = user_name or "there"

        # Normalize: lowercase, strip extra whitespace and trailing punctuation
        cleaned = text.lower().strip()
        cleaned = re.sub(r'[!?.,:;]+$', '', cleaned).strip()
        cleaned = re.sub(r'\s+', ' ', cleaned)  # collapse multiple spaces

        # Strip wake word prefix to isolate the actual command
        # "hey setu how are you" → "how are you"
        # "hey setu" → "" (just the wake word, no command)
        stripped = self._WAKE_PREFIXES.sub('', cleaned).strip()

        # If entire text was just the wake word (nothing after it), treat as greeting
        if not stripped:
            stripped = cleaned  # Will match "setu" or "hey setu" greeting patterns

        # Try matching against each category
        for category, data in _COMPILED_PATTERNS.items():
            for regex in data['regexes']:
                if regex.match(stripped):
                    # Select response pool based on detected language
                    if language == 'hi':
                        pool = data['responses_hi']
                    else:
                        pool = data['responses']

                    response_text = random.choice(pool).format(name=name)
                    return FastResponse(text=response_text, category=category)

        return None
