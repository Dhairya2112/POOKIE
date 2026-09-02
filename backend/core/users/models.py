import uuid
from datetime import datetime, timezone

import mongoengine as me


class UserPreferences(me.EmbeddedDocument):
    meta = {'strict': False}
    preferred_name = me.StringField(null=True, default=None)
    ai_provider = me.StringField(choices=["nvidia", "openrouter", "gemini"], default="nvidia")
    privacy_consent_granted = me.BooleanField(default=False)
    llm_mode = me.StringField(choices=["local", "cloud"], default="cloud")
    llm_model = me.StringField(default="meta/llama-3.3-70b-instruct")
    tts_voice = me.StringField(default="default")
    tts_speed = me.FloatField(default=1.0)
    wake_word_sensitivity = me.FloatField(default=0.06)
    theme = me.StringField(choices=["dark", "light"], default="dark")
    language = me.StringField(default="en")
    
    # Specified fields for settings/onboarding
    tts_voice_gender = me.StringField(choices=["female", "male"], default="female")
    screenshot_preference = me.StringField(choices=["always", "ask", "never"], default="ask")
    trust_mode = me.BooleanField(default=False)
    whitelisted_paths = me.ListField(me.StringField(), default=list)

class UserPermissions(me.EmbeddedDocument):
    meta = {'strict': False}
    level_2_granted = me.BooleanField(default=False)
    level_2_granted_at = me.DateTimeField(null=True)
    level_3_tools = me.ListField(me.StringField(), default=list)

class User(me.Document):
    user_id = me.StringField(default=lambda: str(uuid.uuid4()), unique=True)
    email = me.EmailField(unique=True, required=True)
    username = me.StringField(required=True)
    password_hash = me.StringField(null=True)
    auth_provider = me.StringField(choices=["local", "google", "github"], default="local")
    oauth_provider_id = me.StringField(null=True)
    
    created_at = me.DateTimeField(default=lambda: datetime.now(timezone.utc))
    last_active = me.DateTimeField(default=lambda: datetime.now(timezone.utc))
    is_active = me.BooleanField(default=True)
    
    preferences = me.EmbeddedDocumentField(UserPreferences, default=UserPreferences)
    permissions = me.EmbeddedDocumentField(UserPermissions, default=UserPermissions)
    
    meta = {
        'collection': 'users',
        'strict': False,
        'indexes': [
            'email',
            'user_id'
        ]
    }

class RefreshToken(me.Document):
    token_hash = me.StringField(unique=True, required=True)
    user_id = me.StringField(required=True)
    issued_at = me.DateTimeField(default=lambda: datetime.now(timezone.utc))
    expires_at = me.DateTimeField(required=True)
    device_info = me.StringField(null=True)
    is_revoked = me.BooleanField(default=False)
    
    meta = {
        'collection': 'refresh_tokens',
        'indexes': [
            {'fields': ['expires_at'], 'expireAfterSeconds': 0},
            'token_hash'
        ]
    }
