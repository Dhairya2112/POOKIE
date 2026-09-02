
import uuid
from datetime import datetime, timezone

import mongoengine as me


class CommandLog(me.Document):
    log_id = me.StringField(default=lambda: str(uuid.uuid4()), unique=True)
    user_id = me.StringField(required=True)
    conversation_id = me.StringField(required=True)
    tool_name = me.StringField(required=True)        # e.g., "open_application"
    tool_input = me.StringField()                     # e.g., "chrome"
    tool_output = me.StringField()                    # e.g., "Chrome opened successfully"
    status = me.StringField(
        choices=["success", "denied", "error", "blocked"],
        default="success"
    )
    executed_at = me.DateTimeField(default=lambda: datetime.now(timezone.utc))

    meta = {
        'collection': 'command_logs',
        'indexes': [
            ('user_id', '-executed_at'),
            {'fields': ['executed_at'], 'expireAfterSeconds': 90 * 24 * 3600}
        ]
    }

    def __str__(self):
        return f"[{self.status}] {self.tool_name}({self.tool_input}) @ {self.executed_at}"
