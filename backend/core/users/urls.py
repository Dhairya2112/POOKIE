from django.urls import path

from .views import (GitHubOAuthView, GoogleOAuthView, LoginView,
                    MobilePairingView, RefreshView, RegisterView,
                    UserPermissionsView, UserProfileView)

urlpatterns = [
    path('auth/register/', RegisterView.as_view(), name='auth_register'),
    path('auth/login/', LoginView.as_view(), name='auth_login'),
    path('auth/refresh/', RefreshView.as_view(), name='auth_refresh'),
    path('auth/google/', GoogleOAuthView.as_view(), name='auth_google'),
    path('auth/github/', GitHubOAuthView.as_view(), name='auth_github'),
    path('user/profile/', UserProfileView.as_view(), name='user_profile'),
    path('user/permissions/', UserPermissionsView.as_view(), name='user_permissions'),
    path('user/mobile-pairing/', MobilePairingView.as_view(), name='mobile_pairing'),
]

