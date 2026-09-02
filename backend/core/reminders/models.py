"""
core/tasks/models.py — Step 13 Models

NOTE: CommandLog is defined in core/agent/models.py (single source of truth).
      Do NOT redefine it here — that would create a duplicate class writing
      to the same MongoDB collection with a different schema.

This file contains only the Reminder model.
"""

import uuid
from datetime import datetime, timezone

import mongoengine as me


class Reminder(me.Document):
    reminder_id     = me.StringField(default=lambda: str(uuid.uuid4()))
    user_id         = me.StringField(required=True)
    title           = me.StringField(required=True)
    body            = me.StringField(default="")
    trigger_at      = me.DateTimeField(required=True)
    is_recurring    = me.BooleanField(default=False)
    recurrence_rule = me.StringField(null=True)   # iCal RRULE format
    is_completed    = me.BooleanField(default=False)
    created_at      = me.DateTimeField(default=lambda: datetime.now(timezone.utc))
    platform_target = me.StringField(default="all")
    last_fired_at   = me.DateTimeField(null=True, default=None)

    meta = {
        'collection': 'reminders',
        'indexes': [
            ('user_id', 'trigger_at'),
            ('trigger_at', 'is_completed')
        ]
    }
