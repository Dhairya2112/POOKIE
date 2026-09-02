"""
Setu Reminder Scanner

Runs every 30 seconds via background daemon thread (core.reminders.apps.py).
Scans for due reminders and pushes them to the user's active WebSocket session.

Push target: user_{user_id} channel group
  → handled by AgentStreamConsumer.reminder_notification()
"""

import logging
from datetime import datetime, timezone

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .models import Reminder

logger = logging.getLogger('core.reminders')


def check_and_fire_reminders() -> int:
    """
    Periodic task: scan for due reminders and push them to connected clients.

    A reminder is "due" when:
      - trigger_at <= now (UTC)
      - is_completed is False
      - has not been fired, or was fired >= 2 minutes ago (retry delivery if offline)

    Returns:
        Number of reminders fired in this run.
    """
    from datetime import timedelta

    import mongoengine as me

    now = datetime.now(timezone.utc)
    channel_layer = get_channel_layer()

    # Retry delivery every 2 minutes until acknowledged (deleted)
    retry_cutoff = now - timedelta(minutes=2)
    due_reminders = Reminder.objects(
        trigger_at__lte=now,
        is_completed=False
    ).filter(
        me.Q(last_fired_at=None) | me.Q(last_fired_at__lte=retry_cutoff)
    )

    fired_count = 0
    for reminder in due_reminders:
        group_name = f'user_{reminder.user_id}'
        
        # Check if the user is online using the central cache (works on both Memory and Redis layers).
        from django.core.cache import cache
        is_online = cache.get(f"user_online_{reminder.user_id}", False)
        
        # Fallback to true if cache is cleared but we want to attempt delivery anyway
        if not is_online and hasattr(channel_layer, 'groups'):
            if channel_layer.groups.get(group_name):
                is_online = True
                
        if not is_online:
            continue

        try:
            async_to_sync(channel_layer.group_send)(
                group_name,
                {
                    'type': 'reminder_notification',
                    'reminder_id': reminder.reminder_id,
                    'title': reminder.title,
                    'body': reminder.body or '',
                }
            )
            # Only mark last_fired_at after a successful push attempt
            reminder.last_fired_at = now
            reminder.save()
            fired_count += 1
            logger.info("Fired reminder '%s' for user %s", reminder.title, reminder.user_id)
        except Exception as e:
            logger.warning(
                "Could not push reminder %s to user %s: %s",
                reminder.reminder_id, reminder.user_id, e
            )

    if fired_count:
        logger.info("Reminder scanner: fired %d reminder(s) at %s", fired_count, now.isoformat())

    return fired_count
