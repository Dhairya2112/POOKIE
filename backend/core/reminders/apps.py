import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone

import mongoengine
import pymongo
from django.apps import AppConfig

logger = logging.getLogger('core.reminders')

def run_reminder_scheduler():
    # Only run in the main process (skip Django's auto-reloader sub-process)
    # Under Daphne, RUN_MAIN will not be set, but DJANGO_DEBUG might be True/False.
    # If running with runserver, RUN_MAIN is 'true' in the actual execution thread.
    is_run_main = os.environ.get('RUN_MAIN') == 'true'
    is_reloader = os.environ.get('RUN_MAIN') is not None and not is_run_main
    
    if not is_reloader:
        time.sleep(5)  # Wait for Django setup
        logger.info("Background reminder scheduler thread started.")
        from datetime import datetime, timedelta, timezone

        import mongoengine
        import pymongo

        from core.reminders.tasks import check_and_fire_reminders
        
        while True:
            try:
                db = mongoengine.get_db()
                now = datetime.now(timezone.utc)
                timeout = now - timedelta(seconds=25)
                
                acquired = False
                try:
                    result = db.scheduler_lock.update_one(
                        {
                            "_id": "singleton",
                            "$or": [
                                {"last_active": {"$lt": timeout}},
                                {"last_active": {"$exists": False}}
                            ]
                        },
                        {"$set": {"last_active": now}},
                        upsert=True
                    )
                    acquired = result.modified_count > 0 or result.upserted_id is not None
                except pymongo.errors.DuplicateKeyError:
                    acquired = False
                    
                if acquired:
                    check_and_fire_reminders()
            except Exception as e:
                logger.error("Error in reminder scheduler: %s", e)
            time.sleep(10)

class RemindersConfig(AppConfig):
    name = 'core.reminders'

    def ready(self):
        import sys

        # Do not start scheduler thread during Django administrative or testing commands
        if any(cmd in sys.argv for cmd in ['migrate', 'makemigrations', 'test', 'check', 'showmigrations', 'collectstatic']):
            return

        t = threading.Thread(target=run_reminder_scheduler, daemon=True)
        t.start()
