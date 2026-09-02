import uuid
from datetime import datetime, timezone

import mongoengine as me


class MessageMetadata(me.EmbeddedDocument):
    intent = me.StringField(null=True)
    tool_used = me.StringField(null=True)
    llm_model = me.StringField(null=True, default=None)
    processing_time_ms = me.IntField(null=True)
    input_type = me.StringField(choices=["voice", "text"], default="text")

class Message(me.EmbeddedDocument):
    message_id = me.StringField(default=lambda: str(uuid.uuid4()))
    role = me.StringField(choices=["user", "assistant"], required=True)
    content = me.StringField(required=True)
    timestamp = me.DateTimeField(default=lambda: datetime.now(timezone.utc))
    metadata = me.EmbeddedDocumentField(MessageMetadata, default=MessageMetadata)

class Conversation(me.Document):
    conversation_id = me.StringField(default=lambda: str(uuid.uuid4()), unique=True)
    user_id = me.StringField(required=True)  # Foreign key reference to User
    started_at = me.DateTimeField(default=lambda: datetime.now(timezone.utc))
    last_updated = me.DateTimeField(default=lambda: datetime.now(timezone.utc))
    platform = me.StringField(choices=["windows", "android", "linux", "web"], default="windows")
    messages = me.EmbeddedDocumentListField(Message)
    
    meta = {
        'collection': 'conversations',
        'indexes': [
            'conversation_id',
            ('user_id', '-started_at')
        ]
    }
