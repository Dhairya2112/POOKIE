from rest_framework import serializers


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    username = serializers.CharField(required=True, max_length=150)
    password = serializers.CharField(required=True, write_only=True, min_length=8)

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, write_only=True)

class RefreshSerializer(serializers.Serializer):
    refresh_token = serializers.CharField(required=True)

class UserPreferencesSerializer(serializers.Serializer):
    preferred_name = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    ai_provider = serializers.ChoiceField(choices=["nvidia", "openrouter", "gemini"], required=False)
    privacy_consent_granted = serializers.BooleanField(required=False)
    llm_mode = serializers.ChoiceField(choices=["local", "cloud"], required=False)
    llm_model = serializers.CharField(required=False, allow_blank=True)
    tts_voice = serializers.CharField(required=False, allow_blank=True)
    tts_speed = serializers.FloatField(required=False)
    wake_word_sensitivity = serializers.FloatField(required=False)
    theme = serializers.ChoiceField(choices=["dark", "light"], required=False)
    language = serializers.CharField(required=False, allow_blank=True)
    tts_voice_gender = serializers.ChoiceField(choices=["female", "male"], required=False)
    screenshot_preference = serializers.ChoiceField(choices=["always", "ask", "never"], required=False)
    trust_mode = serializers.BooleanField(required=False)
    whitelisted_paths = serializers.ListField(child=serializers.CharField(), required=False)

    def validate_whitelisted_paths(self, value):
        from pathlib import Path
        for path_str in value:
            try:
                resolved = Path(path_str).resolve()
                # 1. Block root directories
                if len(resolved.parts) <= 1:
                    raise serializers.ValidationError("Cannot whitelist a root directory path.")
                
                # 2. Block system directories
                blocked_dirs = [
                    "C:\\Windows",
                    "C:\\Program Files",
                    "C:\\Program Files (x86)",
                    "C:\\ProgramData",
                    "/etc",
                    "/usr",
                    "/bin",
                    "/sbin",
                    "/var",
                    "/boot",
                    "/dev"
                ]
                resolved_str = str(resolved).lower()
                for sdir in blocked_dirs:
                    if resolved_str.startswith(sdir.lower()):
                        raise serializers.ValidationError(f"Whitelisting system directory '{sdir}' is prohibited.")
            except Exception as e:
                if isinstance(e, serializers.ValidationError):
                    raise e
                raise serializers.ValidationError(f"Invalid path structure: {e}")
        return value

class UserPermissionsSerializer(serializers.Serializer):
    level_2_granted = serializers.BooleanField(required=False)
    level_3_tools = serializers.ListField(child=serializers.CharField(), required=False)

class UserSerializer(serializers.Serializer):
    user_id = serializers.CharField()
    email = serializers.EmailField()
    username = serializers.CharField()
    created_at = serializers.DateTimeField()
    preferences = UserPreferencesSerializer()
    permissions = UserPermissionsSerializer()
