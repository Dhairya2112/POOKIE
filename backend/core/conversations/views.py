from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.users.auth import PyJWTAuthentication

from .models import Conversation


class ConversationListView(APIView):
    authentication_classes = [PyJWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        try:
            limit = int(request.GET.get('limit', 20))
            limit = max(1, min(100, limit))
        except ValueError:
            limit = 20

        try:
            skip = int(request.GET.get('skip', 0))
            skip = max(0, skip)
        except ValueError:
            skip = 0

        platform = request.GET.get('platform', None)
        
        query = Conversation.objects(user_id=request.user.user_id)
        if platform:
            query = query.filter(platform=platform)
            
        conversations = query.order_by('-started_at').skip(skip).limit(limit)
        
        # BUG-1 Fix: Use ConversationListSerializer to explicitly omit the 'messages' array, 
        # avoiding gigabytes of memory exhaustion on active users.
        from .serializers import ConversationListSerializer
        serializer = ConversationListSerializer(conversations, many=True)
        return Response({
            'count': query.count(),
            'results': serializer.data
        })

class ConversationDetailView(APIView):
    authentication_classes = [PyJWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, conversation_id):
        conversation = Conversation.objects(conversation_id=conversation_id, user_id=request.user.user_id).first()
        if not conversation:
            return Response({'error': {'code': 'NOT_FOUND', 'message': 'Conversation not found'}}, status=status.HTTP_404_NOT_FOUND)
            
        from .serializers import ConversationSerializer
        return Response(ConversationSerializer(conversation).data)
        
    def delete(self, request, conversation_id):
        conversation = Conversation.objects(conversation_id=conversation_id, user_id=request.user.user_id).first()
        if not conversation:
            return Response({'error': {'code': 'NOT_FOUND', 'message': 'Conversation not found'}}, status=status.HTTP_404_NOT_FOUND)
            
        conversation.delete()

        # BUG-3 Fix: Clean up orphaned LangGraph checkpoints in the BoundedMemorySaver
        from core.agent.state import get_agent
        agent = get_agent()
        if hasattr(agent, '_memory') and hasattr(agent._memory, 'storage'):
            keys_to_delete = [k for k in agent._memory.storage.keys() if (isinstance(k, tuple) and k[0] == conversation_id) or k == conversation_id]
            for k in keys_to_delete:
                agent._memory.storage.pop(k, None)

        return Response(status=status.HTTP_204_NO_CONTENT)
