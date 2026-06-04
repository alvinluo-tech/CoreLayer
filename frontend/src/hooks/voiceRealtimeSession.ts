import type { VoiceState } from './useVoiceFSM';
import { logger } from '@/lib/logger';

interface RealtimeRefs {
  peerConnectionRef: React.MutableRefObject<RTCPeerConnection | null>;
  localStreamRef: React.MutableRefObject<MediaStream | null>;
  remoteAudioRef: React.MutableRefObject<HTMLAudioElement | null>;
  dataChannelRef: React.MutableRefObject<RTCDataChannel | null>;
  isActiveRef: React.MutableRefObject<boolean>;
}

interface RealtimeCallbacks {
  setState: (state: VoiceState) => void;
  setAssistantText: (text: string) => void;
  setFinalTranscript: (text: string) => void;
  setLastError: (msg: string | null) => void;
}

export function createConnectRealtimeSession(refs: RealtimeRefs, callbacks: RealtimeCallbacks) {
  return async () => {
    // 1. Clean up any existing connection first
    if (refs.peerConnectionRef.current) {
      try {
        refs.peerConnectionRef.current.close();
      } catch (e) {
        logger.debug('[VoiceConversation] peer connection close ignored:', e);
      }
      refs.peerConnectionRef.current = null;
    }
    if (refs.localStreamRef.current) {
      try {
        refs.localStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch (e) {
        logger.debug('[VoiceConversation] local stream stop ignored:', e);
      }
      refs.localStreamRef.current = null;
    }

    try {
      // 2. Fetch ephemeral key from daemon
      const daemonUrl = 'http://127.0.0.1:3001';
      const sessionResp = await fetch(`${daemonUrl}/api/voice/realtime-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!sessionResp.ok) {
        throw new Error(`Failed to get realtime session: ${sessionResp.status}`);
      }

      const { clientSecret } = (await sessionResp.json()) as { clientSecret: string };
      if (!clientSecret) {
        throw new Error('No ephemeral key received from daemon');
      }

      const ephemeralKey = clientSecret;

      // 3. Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      refs.peerConnectionRef.current = pc;

      // 4. Handle incoming audio track from OpenAI
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      refs.remoteAudioRef.current = audioEl;

      pc.ontrack = (event) => {
        logger.debug('[VoiceConversation:Realtime] Received remote audio track');
        if (audioEl && event.streams[0]) {
          audioEl.srcObject = event.streams[0];
        }
      };

      // 5. Add local microphone track
      logger.debug('[VoiceConversation:Realtime] Requesting microphone stream...');
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      refs.localStreamRef.current = localStream;

      const track = localStream.getTracks()[0];
      if (track) {
        pc.addTrack(track, localStream);
      } else {
        throw new Error('未能捕获麦克风音频轨道');
      }

      // 6. Setup DataChannel for text/state events
      const dc = pc.createDataChannel('oai-events');
      refs.dataChannelRef.current = dc;

      dc.onopen = () => {
        logger.debug('[VoiceConversation:Realtime] Data channel established');
        callbacks.setAssistantText('连线上啦！主人，随时可以对我说任何话。');
        setTimeout(() => {
          if (refs.isActiveRef.current) {
            callbacks.setAssistantText('主人，请讲，我在听。');
          }
        }, 1500);
      };

      let realtimeAssistantBuffer = '';

      dc.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          logger.debug('[VoiceConversation:Realtime] Message:', msg.type, msg);

          switch (msg.type) {
            case 'response.created':
              callbacks.setState('streaming');
              realtimeAssistantBuffer = '';
              callbacks.setAssistantText('');
              break;
            case 'response.audio_transcript.delta':
              if (msg.delta) {
                realtimeAssistantBuffer += msg.delta;
                callbacks.setState('speaking');
                callbacks.setAssistantText(realtimeAssistantBuffer);
              }
              break;
            case 'response.audio_transcript.done':
              callbacks.setState('listening');
              break;
            case 'conversation.item.input_audio_transcription.completed':
              if (msg.transcript) {
                callbacks.setFinalTranscript(msg.transcript);
              }
              break;
            case 'input_audio_buffer.speech_started':
              logger.debug('[VoiceConversation:Realtime] Speech started (VAD barge-in)');
              callbacks.setState('listening');
              break;
            case 'error':
              console.error('[VoiceConversation:Realtime] Error event:', msg.error);
              callbacks.setAssistantText(`实时连接异常: ${msg.error?.message || '未知错误'}`);
              break;
          }
        } catch (err) {
          console.warn('[VoiceConversation:Realtime] Failed to parse event:', err);
        }
      };

      // 7. Exchange SDP Offer / Answer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=gpt-4o-realtime-preview`,
        {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp',
          },
        }
      );

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        throw new Error(`OpenAI SDP Exchange failed: ${errText}`);
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      logger.debug('[VoiceConversation:Realtime] WebRTC Connection fully established!');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '连接 ChatGPT Realtime 失败，请检查网络或配置';
      console.error('[VoiceConversation:Realtime] Initialization error:', error);
      callbacks.setState('error');
      callbacks.setLastError(message);
      callbacks.setAssistantText(message);
      setTimeout(() => {
        if (refs.isActiveRef.current) callbacks.setState('idle');
      }, 4000);
    }
  };
}
