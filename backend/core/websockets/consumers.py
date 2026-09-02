import json

from concurrent.futures import ThreadPoolExecutor

from channels.generic.websocket import AsyncWebsocketConsumer

active_mobile_connections = {}
_agent_executor = ThreadPoolExecutor(max_workers=10)

class AgentStreamConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        if not self.scope["user"]:
            await self.close(code=4001)  # Unauthorized
            return

        self.conversation_id = self.scope['url_route']['kwargs']['conversation_id']
        self.user_id = self.scope['user'].user_id

        # Ownership check: verify if conversation exists and belongs to another user
        from asgiref.sync import sync_to_async

        from core.conversations.models import Conversation

        @sync_to_async
        def verify_conversation_ownership(conversation_id, user_id):
            if conversation_id == 'mobile-remote-session':
                return True
            try:
                conv = Conversation.objects(conversation_id=conversation_id).only('user_id').first()
                if conv and conv.user_id != user_id:
                    return False
                return True
            except Exception as e:
                import logging
                logging.getLogger('core.websockets').error(f"DB Error verifying conversation ownership: {e}")
                return False

        if not await verify_conversation_ownership(self.conversation_id, self.user_id):
            await self.close(code=4003)  # Forbidden
            return

        # Conversation-scoped group — receives agent streaming messages
        import uuid
        self.connection_id = uuid.uuid4().hex
        self.room_group_name = f'chat_{self.conversation_id}'
        # User-scoped group — receives reminder notifications (any session)
        self.user_group_name = f'user_{self.user_id}'

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.channel_layer.group_add(self.user_group_name, self.channel_name)
        
        # Accept the connection with the required subprotocol to prevent browser 1006 aborts
        accepted_subprotocol = None
        subprotocols = self.scope.get("subprotocols", [])
        if subprotocols:
            if "access_token" in subprotocols:
                accepted_subprotocol = "access_token"
            elif any(sub.startswith("access_token,") for sub in subprotocols):
                accepted_subprotocol = next(sub for sub in subprotocols if sub.startswith("access_token,"))
                
        await self.accept(subprotocol=accepted_subprotocol)

        # Mark user online in cache for the reminder system
        import asyncio

        from django.core.cache import cache
        await asyncio.to_thread(cache.set, f"user_online_{self.user_id}", True, 86400)

        # Extract User-Agent for device name
        user_agent = ""
        ua_model = ""
        for header, value in self.scope.get('headers', []):
            if header == b'user-agent':
                user_agent = value.decode('utf-8')
            elif header == b'sec-ch-ua-model':
                ua_model = value.decode('utf-8').strip('"')
        
        device_name = "Mobile Remote"
        if "iPhone" in user_agent:
            device_name = "iPhone"
        elif "iPad" in user_agent:
            device_name = "iPad"
        elif "Android" in user_agent:
            device_name = "Android Device"
            if "Samsung" in user_agent or "SM-" in user_agent or "S2" in ua_model or "SM-" in ua_model or "Samsung" in ua_model:
                device_name = "Samsung Device"
            elif "Pixel" in user_agent or "Pixel" in ua_model:
                device_name = "Google Pixel"
            elif ua_model:
                device_name = f"Android ({ua_model})"
        
        self.device_name = device_name
        
        query_string = self.scope.get('query_string', b'').decode('utf-8')
        is_mobile = 'device=mobile' in query_string or any(m in user_agent for m in ["iPhone", "iPad", "Android", "Mobile", "Windows Phone"])
        self.is_mobile = is_mobile

        if is_mobile:
            active_mobile_connections[self.user_id] = self.connection_id

        # Broadcast device connection status
        await self.channel_layer.group_send(
            self.user_group_name,
            {
                'type': 'device_status',
                'device': 'mobile' if is_mobile else 'desktop',
                'status': 'connected',
                'device_name': self.device_name if is_mobile else 'Primary Desktop'
            }
        )

    async def disconnect(self, close_code):
        is_mobile = getattr(self, 'is_mobile', False)
        
        if is_mobile:
            if active_mobile_connections.get(self.user_id) == self.connection_id:
                del active_mobile_connections[self.user_id]
                
        if hasattr(self, 'user_group_name'):
            import asyncio

            from django.core.cache import cache
            await asyncio.to_thread(cache.delete, f"user_online_{self.user_id}")
            
            await self.channel_layer.group_send(
                self.user_group_name,
                {
                    'type': 'device_status',
                    'device': 'mobile' if is_mobile else 'desktop',
                    'status': 'disconnected',
                    'device_name': getattr(self, 'device_name', 'Mobile Remote') if is_mobile else 'Primary Desktop'
                }
            )

        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        if hasattr(self, 'user_group_name'):
            await self.channel_layer.group_discard(self.user_group_name, self.channel_name)
        
        # Signal cancellation to clear running threads/tasks on disconnect
        if hasattr(self, 'conversation_id'):
            # Only auto-cancel if it's a desktop session. Mobile networks are flaky and screens lock,
            # so we shouldn't kill long-running background tasks just because the phone screen went to sleep.
            if not is_mobile:
                from core.agent.state import cancel_active_command
                cancel_active_command(self.conversation_id)

    async def receive(self, text_data=None, bytes_data=None):
        is_mobile = getattr(self, 'is_mobile', False)
        if is_mobile and active_mobile_connections.get(self.user_id) != self.connection_id:
            await self.close(code=4009)
            return

        if text_data:
            data = json.loads(text_data)
            
            if data.get('action') == 'switch_conversation':
                await self.channel_layer.group_send(
                    self.user_group_name,
                    {
                        'type': 'switch_conversation',
                        'conversation_id': data['conversation_id']
                    }
                )
                return

            # Handle user cancellation request
            if data.get('type') == 'cancel' or data.get('action') == 'cancel':
                from core.agent.state import cancel_active_command
                cancel_active_command(self.conversation_id)
                # Reply immediately with cancelling status
                await self.send(text_data=json.dumps({
                    'chunk_type': 'status',
                    'message': 'cancelling'
                }))
                return

            # Handle interactive permission response
            if data.get('action') == 'permission_response':
                from core.agent.state import resolve_permission_request
                request_id = data.get('request_id')
                status = data.get('status')
                if request_id and status:
                    resolve_permission_request(request_id, status)
                return

            if data.get('action') == 'ping_devices':
                await self.channel_layer.group_send(
                    self.user_group_name,
                    {
                        'type': 'device_ping'
                    }
                )
                return

            command_text = data.get('text')
            audio_base64 = data.get('audio')

            if audio_base64:
                import base64
                import io
                import os

                import numpy as np
                import soundfile as sf

                try:
                    # Send instant acknowledgment
                    await self.send(text_data=json.dumps({
                        'chunk_type': 'status',
                        'message': 'acknowledged'
                    }))

                    # Decode base64 audio
                    audio_bytes = base64.b64decode(audio_base64)

                    # Load using soundfile from memory buffer
                    audio_io = io.BytesIO(audio_bytes)
                    data, samplerate = sf.read(audio_io)

                    # Convert to mono if stereo
                    if len(data.shape) > 1:
                        data = np.mean(data, axis=1)

                    if samplerate != 16000:
                        import torch
                        import torchaudio.transforms as T
                        tensor_audio = torch.from_numpy(data).float()
                        resampler = T.Resample(orig_freq=samplerate, new_freq=16000)
                        data = resampler(tensor_audio).numpy()

                    # Ensure float32 format
                    audio_float32 = data.astype(np.float32)

                    # Transcribe using pipeline (Run in thread to avoid blocking ASGI loop: BUG-14)
                    import asyncio

                    from core.agent.state import get_stt
                    
                    stt = get_stt()
                    text_command, _, avg_logprob = await asyncio.to_thread(
                        stt.transcribe, audio_float32
                    )
                    print(f"Websocket STT Transcribed: {text_command}")

                    # Confidence / length gate
                    import os
                    try:
                        min_logprob = float(os.getenv("STT_MIN_LOGPROB", "-1.50"))
                    except ValueError:
                        min_logprob = -1.50

                    is_valid = True
                    if not text_command.strip() or len(text_command.strip()) < 2:
                        is_valid = False
                    elif avg_logprob < min_logprob:
                        print(f"STT gate: Discarding low-confidence transcription '{text_command}' (avg_logprob={avg_logprob:.3f} < {min_logprob})")
                        is_valid = False

                    if not is_valid:
                        fallback_msg = "Sorry, I didn't catch that."
                        await self.send(text_data=json.dumps({
                            'chunk_type': 'status',
                            'message': 'thinking'
                        }))
                        await self.send(text_data=json.dumps({
                            'chunk_type': 'text',
                            'message': fallback_msg
                        }))
                        try:
                            from core.agent.pipeline import _get_user_prefs
                            from core.agent.state import get_tts
                            
                            def _generate_fallback():
                                prefs = _get_user_prefs(self.scope["user"].user_id)
                                return get_tts().generate_base64(fallback_msg, voice=prefs['voice'], speed=prefs['speed'])
                                
                            audio_b64 = await asyncio.to_thread(_generate_fallback)
                            
                            if audio_b64:
                                await self.send(text_data=json.dumps({
                                    'chunk_type': 'audio',
                                    'message': audio_b64
                                }))
                        except Exception as e:
                            print(f"Error generating fallback TTS: {e}")

                        await self.send(text_data=json.dumps({
                            'chunk_type': 'status',
                            'message': 'done'
                        }))
                        # Clean up file in finally
                        return

                    if text_command.strip():
                        # Broadcast transcribed command to all devices in this conversation
                        await self.channel_layer.group_send(
                            self.room_group_name,
                            {
                                'type': 'agent_message',
                                'chunk_type': 'text_user',
                                'message': text_command,
                                'sender_id': self.connection_id,
                                'is_audio_transcription': True,
                                'source': 'mobile' if is_mobile else 'desktop'
                            }
                        )

                        # Trigger agent command process task
                        import asyncio

                        from core.agent.pipeline import process_agent_command
                        loop = asyncio.get_running_loop()
                        asyncio.create_task(
                            loop.run_in_executor(
                                _agent_executor,
                                process_agent_command,
                                text_command,
                                self.conversation_id,
                                self.scope["user"].user_id,
                                self.room_group_name
                            )
                        )
                    else:
                        await self.send(text_data=json.dumps({
                            'chunk_type': 'status',
                            'message': 'done'
                        }))
                    # (No file cleanup needed for in-memory buffer)
                except Exception as e:
                    print(f"Error transcribing websocket audio: {e}")
                    await self.send(text_data=json.dumps({
                        'chunk_type': 'status',
                        'message': 'failed'
                    }))

            elif command_text:
                # ── Instant acknowledgment ──────────────────
                # Send immediately so the user knows Setu heard them (~200ms)
                await self.send(text_data=json.dumps({
                    'chunk_type': 'status',
                    'message': 'acknowledged'
                }))
                
                # Broadcast the typed command to other devices in the room
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'agent_message',
                        'chunk_type': 'text_user',
                        'message': command_text,
                        'sender_id': self.connection_id,
                        'is_audio_transcription': False,
                        'source': 'mobile' if is_mobile else 'desktop'
                    }
                )

                import asyncio

                from core.agent.pipeline import process_agent_command
                loop = asyncio.get_running_loop()
                asyncio.create_task(
                    loop.run_in_executor(
                        _agent_executor,
                        process_agent_command,
                        command_text,
                        self.conversation_id,
                        self.scope["user"].user_id,
                        self.room_group_name
                    )
                )

    # ── Handler: agent streaming chunks (text / audio / status) ──
    async def agent_message(self, event):
        # Prevent echoing text_user back to the sender who already appended it locally
        if event.get('chunk_type') == 'text_user':
            if event.get('sender_id') == self.connection_id and not event.get('is_audio_transcription'):
                return # Skip echoing back typed text to the sender

        await self.send(text_data=json.dumps({
            'chunk_type': event.get('chunk_type', 'text'),
            'message': event['message'],
            'source': event.get('source', 'desktop')
        }))

    # ── Handler: reminder fired by background scheduler ──
    async def reminder_notification(self, event):
        await self.send(text_data=json.dumps({
            'chunk_type': 'reminder',
            'reminder_id': event['reminder_id'],
            'title': event['title'],
            'body': event['body'],
        }))

    # ── Handler: device status broadcast ──
    async def device_status(self, event):
        await self.send(text_data=json.dumps({
            'chunk_type': 'device_status',
            'device': event['device'],
            'status': event['status'],
            'device_name': event.get('device_name', 'Mobile Remote')
        }))

    # ── Handler: ping request to broadcast status ──
    async def device_ping(self, event):
        is_mobile = getattr(self, 'is_mobile', False)
        await self.channel_layer.group_send(
            self.user_group_name,
            {
                'type': 'device_status',
                'device': 'mobile' if is_mobile else 'desktop',
                'status': 'connected',
                'device_name': getattr(self, 'device_name', 'Mobile Remote') if is_mobile else 'Primary Desktop'
            }
        )

    # ── Handler: switch conversation ──
    async def switch_conversation(self, event):
        await self.send(text_data=json.dumps({
            'chunk_type': 'switch_conversation',
            'conversation_id': event['conversation_id']
        }))

