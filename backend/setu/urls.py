from django.contrib import admin
from django.urls import include, path

from core.agent.views import CommandView
from core.conversations.views import ConversationListView
from core.users.views import UserProfileView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include('core.users.urls')),
    path('api/v1/conversations/', include('core.conversations.urls')),
    path('api/v1/agent/', include('core.agent.urls')),
    path('api/v1/reminders/', include('core.reminders.urls')),
    
    # Auth Routes
    path('api/v1/auth/', include('dj_rest_auth.urls')),
    path('api/v1/auth/registration/', include('dj_rest_auth.registration.urls')),
    path('accounts/', include('allauth.urls')),
    
    # STEP_BY_STEP_GUIDE.md Exact Routes
    path('api/chat/', CommandView.as_view(), name='api_chat'),
    path('api/history/', ConversationListView.as_view(), name='api_history'),
    path('api/settings/', UserProfileView.as_view(), name='api_settings'),
]
