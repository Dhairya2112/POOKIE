
from django.urls import path

from .views import ReminderDetailView, ReminderListView

urlpatterns = [
    path('', ReminderListView.as_view(), name='reminders_list'),
    path('<str:reminder_id>/', ReminderDetailView.as_view(), name='reminder_detail'),
]
