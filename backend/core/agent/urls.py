from django.urls import path

from .views import CommandLogListView, CommandView, StatusView

urlpatterns = [
    path('command/', CommandView.as_view(), name='agent_command'),
    path('status/<str:task_id>/', StatusView.as_view(), name='agent_status'),
    path('audit-logs/', CommandLogListView.as_view(), name='audit_logs'),
]
