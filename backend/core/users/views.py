import hashlib
from datetime import datetime, timezone

import bcrypt
import jwt
import requests as http_requests
from django.conf import settings
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth import PyJWTAuthentication, generate_tokens
from .models import RefreshToken, User
from .serializers import (LoginSerializer, RefreshSerializer,
                          RegisterSerializer, UserPermissionsSerializer,
                          UserPreferencesSerializer, UserSerializer)


class RegisterView(APIView):
    throttle_scope = 'auth'
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            if User.objects(email=email).first():
                return Response({'error': {'code': 'VALIDATION_ERROR', 'message': 'Email already exists'}}, status=status.HTTP_400_BAD_REQUEST)
                
            password = serializer.validated_data['password'].encode('utf-8')
            password_hash = bcrypt.hashpw(password, bcrypt.gensalt()).decode('utf-8')
            user = User(
                email=email,
                username=serializer.validated_data['username'],
                password_hash=password_hash,
                auth_provider='local'
            ).save()
            
            tokens = generate_tokens(user, request.META.get('HTTP_USER_AGENT'))
            
            return Response({
                'user_id': user.user_id,
                'email': user.email,
                'access_token': tokens['access_token'],
                'refresh_token': tokens['refresh_token'],
                'token_type': 'Bearer',
                'expires_in': tokens['expires_in']
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class LoginView(APIView):
    throttle_scope = 'auth'
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = User.objects(email=serializer.validated_data['email']).first()
            if not user or not user.password_hash:
                return Response({'error': {'code': 'PERMISSION_DENIED', 'message': 'Invalid credentials'}}, status=status.HTTP_401_UNAUTHORIZED)
                
            password = serializer.validated_data['password'].encode('utf-8')
            if not bcrypt.checkpw(password, user.password_hash.encode('utf-8')):
                return Response({'error': {'code': 'PERMISSION_DENIED', 'message': 'Invalid credentials'}}, status=status.HTTP_401_UNAUTHORIZED)
                
            user.last_active = datetime.now(timezone.utc)
            user.save()
            
            tokens = generate_tokens(user, request.META.get('HTTP_USER_AGENT'))
            
            return Response({
                'access_token': tokens['access_token'],
                'refresh_token': tokens['refresh_token'],
                'token_type': 'Bearer',
                'expires_in': tokens['expires_in'],
                'user': UserSerializer(user).data
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class RefreshView(APIView):
    throttle_scope = 'auth'
    def post(self, request):
        serializer = RefreshSerializer(data=request.data)
        if serializer.is_valid():
            token_string = serializer.validated_data['refresh_token']
            
            try:
                payload = jwt.decode(token_string, settings.SECRET_KEY, algorithms=['HS256'])
                if payload.get('type') != 'refresh':
                    return Response({'error': {'code': 'INVALID_TOKEN', 'message': 'Invalid token type'}}, status=status.HTTP_401_UNAUTHORIZED)
                    
                token_hash = hashlib.sha256(token_string.encode()).hexdigest()
                rt = RefreshToken.objects(token_hash=token_hash, is_revoked=False).first()
                if not rt:
                    return Response({'error': {'code': 'INVALID_TOKEN', 'message': 'Token has been revoked or does not exist'}}, status=status.HTTP_401_UNAUTHORIZED)
                    
                user = User.objects(user_id=payload['user_id']).first()
                if not user or not user.is_active:
                    return Response({'error': {'code': 'INVALID_TOKEN', 'message': 'User not found'}}, status=status.HTTP_401_UNAUTHORIZED)
                    
                # BUG-7 FIX: Token Refresh Race Condition. Use atomic update to prevent duplicate issuance
                updated_count = RefreshToken.objects(token_hash=token_hash, is_revoked=False).update(set__is_revoked=True)
                if updated_count == 0:
                    return Response({'error': {'code': 'INVALID_TOKEN', 'message': 'Token has already been revoked or refreshed concurrently'}}, status=status.HTTP_401_UNAUTHORIZED)
                
                
                # Issue new tokens
                tokens = generate_tokens(user, request.META.get('HTTP_USER_AGENT'))
                
                return Response({
                    'access_token': tokens['access_token'],
                    'refresh_token': tokens['refresh_token'],
                    'expires_in': tokens['expires_in']
                })
                
            except jwt.ExpiredSignatureError:
                return Response({'error': {'code': 'INVALID_TOKEN', 'message': 'Refresh token expired'}}, status=status.HTTP_401_UNAUTHORIZED)
            except jwt.InvalidTokenError:
                return Response({'error': {'code': 'INVALID_TOKEN', 'message': 'Invalid token'}}, status=status.HTTP_401_UNAUTHORIZED)
                
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class UserProfileView(APIView):
    authentication_classes = [PyJWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        return Response(UserSerializer(request.user).data)
        
    def patch(self, request):
        # We allow updating username and preferences
        user = request.user
        if 'username' in request.data:
            import re
            new_username = str(request.data['username']).strip()
            if len(new_username) > 50:
                return Response({'error': 'Username too long (max 50 chars)'}, status=status.HTTP_400_BAD_REQUEST)
            # Basic XSS sanitization
            new_username = re.sub(r'[<>\'\"/]', '', new_username)
            if new_username:
                user.username = new_username
            
        if 'preferences' in request.data:
            if not user.preferences:
                from core.users.models import UserPreferences
                user.preferences = UserPreferences()
            pref_serializer = UserPreferencesSerializer(data=request.data['preferences'])
            if pref_serializer.is_valid():
                for k, v in pref_serializer.validated_data.items():
                    setattr(user.preferences, k, v)
            else:
                return Response(pref_serializer.errors, status=status.HTTP_400_BAD_REQUEST)
                
        user.save()
        try:
            from django.core.cache import cache
            cache.delete(f"user_prefs_{user.user_id}")
        except Exception:
            pass
        return Response(UserSerializer(user).data)

class UserPermissionsView(APIView):
    authentication_classes = [PyJWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        return Response(UserPermissionsSerializer(request.user.permissions).data)
        
    def patch(self, request):
        perm_serializer = UserPermissionsSerializer(data=request.data)
        if perm_serializer.is_valid():
            user = request.user
            for k, v in perm_serializer.validated_data.items():
                setattr(user.permissions, k, v)
                if k == 'level_2_granted' and v is True:
                    user.permissions.level_2_granted_at = datetime.now(timezone.utc)
            user.save()
            
            # Optimization Fix: Invalidate permission cache so the agent sees changes instantly
            try:
                from django.core.cache import cache
                cache.delete(f"user_permissions_{user.user_id}")
            except Exception:
                pass
                
            return Response(UserPermissionsSerializer(user.permissions).data)
        return Response(perm_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class MobilePairingView(APIView):
    authentication_classes = [PyJWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        import socket
        try:
            # BUG-4 FIX: Add a 0.5s timeout to prevent hanging the worker thread indefinitely if offline
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(0.5)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
        except Exception:
            local_ip = "127.0.0.1"
            
        tokens = generate_tokens(request.user, "mobile-pair")
        # BUG-5 FIX: Remove access token from query parameters. Send raw IP/URL.
        pairing_url = f"http://{local_ip}:5173/mobile"
        return Response({
            'url': pairing_url,
            'ip': local_ip,
            'token': tokens['access_token']
        })

class GoogleOAuthView(APIView):
    throttle_scope = 'auth'
    def post(self, request):
        token = request.data.get('id_token')
        if not token:
            return Response({'error': {'code': 'VALIDATION_ERROR', 'message': 'id_token is required'}}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            # BUG-8 FIX: Removed insecure debug `mock_` bypass backdoor
            idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), settings.GOOGLE_CLIENT_ID)
            if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
                raise ValueError('Wrong issuer.')
            email = idinfo['email']
            name = idinfo.get('name', 'Google User')
            sub = idinfo['sub']
        except Exception as e:
            return Response({'error': {'code': 'INVALID_TOKEN', 'message': f'Google token verification failed: {str(e)}'}}, status=status.HTTP_400_BAD_REQUEST)
            
        user = User.objects(email=email).first()
        if not user:
            user = User(
                email=email,
                username=name,
                auth_provider='google',
                oauth_provider_id=sub,
                is_active=True
            ).save()
        else:
            if not user.auth_provider:
                user.auth_provider = 'google'
            elif user.auth_provider != 'google':
                # BUG-6 FIX: Prevent OAuth Identity Clobbering
                return Response({'error': {'code': 'VALIDATION_ERROR', 'message': f'Email already registered via {user.auth_provider}. Please log in using that method.'}}, status=status.HTTP_400_BAD_REQUEST)
                
            if not user.oauth_provider_id:
                user.oauth_provider_id = sub
            user.last_active = datetime.now(timezone.utc)
            user.save()
            
        tokens = generate_tokens(user, request.META.get('HTTP_USER_AGENT'))
        return Response({
            'access_token': tokens['access_token'],
            'refresh_token': tokens['refresh_token'],
            'token_type': 'Bearer',
            'expires_in': tokens['expires_in'],
            'user': UserSerializer(user).data
        })

class GitHubOAuthView(APIView):
    throttle_scope = 'auth'
    def post(self, request):
        code = request.data.get('code')
        if not code:
            return Response({'error': {'code': 'VALIDATION_ERROR', 'message': 'code is required'}}, status=status.HTTP_400_BAD_REQUEST)
            
        # BUG-8 FIX: Removed insecure debug `mock_` bypass backdoor for GitHub
        try:
            token_res = http_requests.post(
                'https://github.com/login/oauth/access_token',
                headers={'Accept': 'application/json'},
                data={
                    'client_id': settings.GITHUB_CLIENT_ID,
                    'client_secret': settings.GITHUB_CLIENT_SECRET,
                    'code': code
                },
                timeout=10
            )
            token_res.raise_for_status()
            token_data = token_res.json()
            access_token = token_data.get('access_token')
            if not access_token:
                return Response({'error': {'code': 'INVALID_TOKEN', 'message': f'Failed to retrieve GitHub access token: {token_data.get("error_description", "Unknown error")}'}}, status=status.HTTP_400_BAD_REQUEST)
                
            user_res = http_requests.get(
                'https://api.github.com/user',
                headers={
                    'Authorization': f'token {access_token}',
                    'Accept': 'application/json'
                },
                timeout=10
            )
            user_res.raise_for_status()
            user_data = user_res.json()
            sub = str(user_data['id'])
            name = user_data.get('name') or user_data.get('login') or 'GitHub User'
            
            email = user_data.get('email')
            if not email:
                emails_res = http_requests.get(
                    'https://api.github.com/user/emails',
                    headers={
                        'Authorization': f'token {access_token}',
                        'Accept': 'application/json'
                    },
                    timeout=10
                )
                emails_res.raise_for_status()
                emails_data = emails_res.json()
                for email_entry in emails_data:
                    if email_entry.get('verified'):
                        email = email_entry.get('email')
                        break
                if not email and emails_data:
                    email = emails_data[0].get('email')
            
            if not email:
                return Response({'error': {'code': 'VALIDATION_ERROR', 'message': 'Could not retrieve verified email from GitHub account'}}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': {'code': 'INVALID_TOKEN', 'message': f'GitHub token exchange failed: {str(e)}'}}, status=status.HTTP_400_BAD_REQUEST)
                
        user = User.objects(email=email).first()
        if not user:
            user = User(
                email=email,
                username=name,
                auth_provider='github',
                oauth_provider_id=sub,
                is_active=True
            ).save()
        else:
            if not user.auth_provider:
                user.auth_provider = 'github'
            elif user.auth_provider != 'github':
                # BUG-6 FIX: Prevent OAuth Identity Clobbering
                return Response({'error': {'code': 'VALIDATION_ERROR', 'message': f'Email already registered via {user.auth_provider}. Please log in using that method.'}}, status=status.HTTP_400_BAD_REQUEST)
                
            if not user.oauth_provider_id:
                user.oauth_provider_id = sub
            user.last_active = datetime.now(timezone.utc)
            user.save()
            
        tokens = generate_tokens(user, request.META.get('HTTP_USER_AGENT'))
        return Response({
            'access_token': tokens['access_token'],
            'refresh_token': tokens['refresh_token'],
            'token_type': 'Bearer',
            'expires_in': tokens['expires_in'],
            'user': UserSerializer(user).data
        })

