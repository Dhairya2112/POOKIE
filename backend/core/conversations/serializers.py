from rest_framework import serializers


class MessageMetadataSerializer(serializers.Serializer):
    intent = serializers.CharField(required=False, allow_null=True)
    tool_used = serializers.CharField(required=False, allow_null=True)
    llm_model = serializers.CharField(required=False, allow_null=True)
    processing_time_ms = serializers.IntegerField(required=False, allow_null=True)
    input_type = serializers.CharField()

class MessageSerializer(serializers.Serializer):
    message_id = serializers.CharField()
    role = serializers.CharField()
    content = serializers.CharField()
    timestamp = serializers.DateTimeField()
    metadata = MessageMetadataSerializer()

class ConversationSerializer(serializers.Serializer):
    conversation_id = serializers.CharField()
    user_id = serializers.CharField()
    started_at = serializers.DateTimeField()
    last_updated = serializers.DateTimeField()
    platform = serializers.CharField()
    messages = MessageSerializer(many=True)

class ConversationListSerializer(serializers.Serializer):
    conversation_id = serializers.CharField()
    user_id = serializers.CharField()
    started_at = serializers.DateTimeField()
    last_updated = serializers.DateTimeField()
    platform = serializers.CharField()
    # Explicitly omitted `messages` to prevent memory exhaustion
