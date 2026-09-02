# pyrefly: ignore [missing-import]
import uuid

# pyrefly: ignore [missing-import]
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
# pyrefly: ignore [missing-import]
from rest_framework.response import Response
from rest_framework.views import APIView

from core.users.auth import PyJWTAuthentication


class CommandView(APIView):
    authentication_classes = [PyJWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        text = request.data.get('text')
        conversation_id = request.data.get('conversation_id')

        if not text or not text.strip():
            return Response(
                {'error': {'code': 'VALIDATION_ERROR', 'message': 'text field is required and cannot be empty.'}},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not conversation_id:
            conversation_id = str(uuid.uuid4())

        import threading

        from django.core.cache import cache

        from .pipeline import process_agent_command
        task_id = str(uuid.uuid4())
        
        # BUG-2 FIX: Initialize task state in the central cache before launching thread
        cache.set(f"task_status_{task_id}", {"status": "processing", "result": None}, timeout=3600)

        def run_task():
            try:
                process_agent_command(text, conversation_id, request.user.user_id)
                cache.set(f"task_status_{task_id}", {"status": "completed", "result": "Task finished successfully"}, timeout=3600)
            except Exception as e:
                cache.set(f"task_status_{task_id}", {"status": "failed", "result": str(e)}, timeout=3600)

        threading.Thread(
            target=run_task,
            daemon=True
        ).start()
        
        host = request.get_host()
        ws_protocol = "wss" if request.is_secure() else "ws"
        websocket_channel = f"{ws_protocol}://{host}/ws/stream/{conversation_id}/"

        return Response({
            "task_id": task_id,
            "conversation_id": conversation_id,
            "message_id": str(uuid.uuid4()),
            "status": "processing",
            "websocket_channel": websocket_channel
        }, status=status.HTTP_202_ACCEPTED)

class StatusView(APIView):
    authentication_classes = [PyJWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, task_id):
        from django.core.cache import cache

        # BUG-2 FIX: Retrieve actual task state from cache instead of hardcoded mock
        task_info = cache.get(f"task_status_{task_id}")
        
        if not task_info:
            return Response({'error': {'code': 'NOT_FOUND', 'message': 'Task not found or expired.'}}, status=status.HTTP_404_NOT_FOUND)
            
        return Response({
            "task_id": task_id,
            "status": task_info["status"],
            "result": task_info.get("result")
        })

class CommandLogListView(APIView):
    authentication_classes = [PyJWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import CommandLog
        logs = CommandLog.objects(user_id=request.user.user_id).order_by('-executed_at')[:50]
        serialized_logs = []
        for log in logs:
            serialized_logs.append({
                "log_id": log.log_id,
                "tool_name": log.tool_name,
                "tool_input": log.tool_input,
                "tool_output": log.tool_output,
                "status": log.status.upper(),
                "executed_at": log.executed_at.isoformat() if log.executed_at else None
            })
        return Response({"results": serialized_logs}, status=status.HTTP_200_OK)
