from django.core.management.base import BaseCommand

from core.conversations.models import Conversation
from core.reminders.models import CommandLog, Reminder
from core.users.models import RefreshToken, User


class Command(BaseCommand):
    help = 'Initializes and builds MongoDB indexes defined in MongoEngine models.'

    def handle(self, *args, **options):
        self.stdout.write('Building MongoDB indexes...')
        
        models = [Conversation, CommandLog, Reminder, User, RefreshToken]
        
        for model in models:
            self.stdout.write(f'Ensuring indexes for {model.__name__} (Collection: {model._meta["collection"]})...')
            model.ensure_indexes()
            
        self.stdout.write(self.style.SUCCESS('Successfully built all MongoDB indexes!'))
