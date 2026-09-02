import os
import sys

from django.apps import AppConfig


class AgentConfig(AppConfig):
    name = 'core.agent'

    def ready(self):
        # Do not load ML models during administrative commands or migrations
        if any(cmd in sys.argv for cmd in ['migrate', 'makemigrations', 'test', 'check', 'showmigrations', 'collectstatic']):
            return
            
        # Only initialize in the main thread (skip Django's auto-reloader sub-process)
        is_run_main = os.environ.get('RUN_MAIN') == 'true'
        is_reloader = os.environ.get('RUN_MAIN') is not None and not is_run_main
        
        if not is_reloader:
            import threading

            from core.agent.state import init_models
            threading.Thread(target=init_models, daemon=True).start()
