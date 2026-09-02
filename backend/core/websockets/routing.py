from django.urls import path

from . import consumers

websocket_urlpatterns = [
    path('ws/stream/<str:conversation_id>/', consumers.AgentStreamConsumer.as_asgi()),
]
