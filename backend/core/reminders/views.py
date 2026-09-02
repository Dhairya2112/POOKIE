
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.users.auth import PyJWTAuthentication

from .models import Reminder
from .serializers import ReminderSerializer


class ReminderListView(APIView):
    authentication_classes = [PyJWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return all pending (not completed) reminders for the authenticated user."""
        reminders = Reminder.objects(
            user_id=request.user.user_id,
            is_completed=False
        ).order_by('trigger_at')

        serializer = ReminderSerializer(reminders, many=True)
        return Response({
            'count': reminders.count(),
            'results': serializer.data
        })

    def post(self, request):
        """Create a new reminder for the authenticated user."""
        serializer = ReminderSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        vd = serializer.validated_data
        reminder = Reminder(
            user_id=request.user.user_id,
            title=vd['title'],
            body=vd.get('body', ''),
            trigger_at=vd['trigger_at'],
            is_recurring=vd.get('is_recurring', False),
            recurrence_rule=vd.get('recurrence_rule'),
            platform_target=vd.get('platform_target', 'all'),
        )
        reminder.save()

        return Response(
            ReminderSerializer(reminder).data,
            status=status.HTTP_201_CREATED
        )


class ReminderDetailView(APIView):
    authentication_classes = [PyJWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, reminder_id):
        """Cancel a reminder by marking it as completed."""
        reminder = Reminder.objects(
            reminder_id=reminder_id,
            user_id=request.user.user_id  # Ownership check — never trust the client
        ).first()

        if not reminder:
            return Response(
                {'error': {'code': 'NOT_FOUND', 'message': 'Reminder not found.'}},
                status=status.HTTP_404_NOT_FOUND
            )

        reminder.is_completed = True
        reminder.save()

        return Response(status=status.HTTP_204_NO_CONTENT)
