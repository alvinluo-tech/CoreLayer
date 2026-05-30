import type { AudioQueueManager } from "@/lib/audioQueue";
import type { WebSpeechASR } from "@/lib/webSpeechASR";
import { logger } from "@/lib/logger";

export interface VoiceConversationRefs {
  postListenTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  breathingTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  webAsrRef: React.MutableRefObject<WebSpeechASR | null>;
  listeningSafetyTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  audioQueueRef: React.MutableRefObject<AudioQueueManager | null>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  peerConnectionRef: React.MutableRefObject<RTCPeerConnection | null>;
  localStreamRef: React.MutableRefObject<MediaStream | null>;
  remoteAudioRef: React.MutableRefObject<HTMLAudioElement | null>;
  dataChannelRef: React.MutableRefObject<RTCDataChannel | null>;
  greetingSourceRef: React.MutableRefObject<AudioBufferSourceNode | null>;
  greetingAudioCtxRef: React.MutableRefObject<AudioContext | null>;
  bargeInMonitorRef: React.MutableRefObject<{ stop: () => void } | null>;
}

export function createCleanup(refs: VoiceConversationRefs) {
  return () => {
    if (refs.postListenTimerRef.current) {
      clearTimeout(refs.postListenTimerRef.current);
      refs.postListenTimerRef.current = null;
    }
    if (refs.breathingTimerRef.current) {
      clearTimeout(refs.breathingTimerRef.current);
      refs.breathingTimerRef.current = null;
    }
    if (refs.webAsrRef.current) {
      refs.webAsrRef.current.stop();
      refs.webAsrRef.current = null;
    }
    if (refs.listeningSafetyTimerRef.current) {
      clearTimeout(refs.listeningSafetyTimerRef.current);
      refs.listeningSafetyTimerRef.current = null;
    }
    if (refs.audioQueueRef.current) {
      refs.audioQueueRef.current.dispose();
      refs.audioQueueRef.current = null;
    }
    if (refs.abortControllerRef.current) {
      refs.abortControllerRef.current.abort();
      refs.abortControllerRef.current = null;
    }

    // Stop any active Realtime WebSocket socket
    const win = window as unknown as Record<string, unknown>;
    if (win._realtimeSocket) {
      try {
        (win._realtimeSocket as WebSocket).close();
      } catch (e) { logger.debug("[VoiceConversation] realtime socket close ignored:", e); }
      win._realtimeSocket = null;
    }

    // Stop WebRTC peer connection & media resources
    if (refs.peerConnectionRef.current) {
      try {
        refs.peerConnectionRef.current.close();
      } catch (e) { logger.debug("[VoiceConversation] peer connection close ignored:", e); }
      refs.peerConnectionRef.current = null;
    }
    if (refs.localStreamRef.current) {
      try {
        refs.localStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch (e) { logger.debug("[VoiceConversation] local stream stop ignored:", e); }
      refs.localStreamRef.current = null;
    }
    if (refs.remoteAudioRef.current) {
      try {
        refs.remoteAudioRef.current.pause();
        refs.remoteAudioRef.current.srcObject = null;
        refs.remoteAudioRef.current.remove();
      } catch (e) { logger.debug("[VoiceConversation] remote audio cleanup ignored:", e); }
      refs.remoteAudioRef.current = null;
    }
    if (refs.dataChannelRef.current) {
      try {
        refs.dataChannelRef.current.close();
      } catch (e) { logger.debug("[VoiceConversation] data channel close ignored:", e); }
      refs.dataChannelRef.current = null;
    }

    // Stop any active greeting audio playback immediately
    if (refs.greetingSourceRef.current) {
      try {
        refs.greetingSourceRef.current.stop();
      } catch (e) { logger.debug("[VoiceConversation] greeting source stop ignored:", e); }
      refs.greetingSourceRef.current = null;
    }
    if (refs.greetingAudioCtxRef.current) {
      try {
        refs.greetingAudioCtxRef.current.close();
      } catch (e) { logger.debug("[VoiceConversation] greeting audio context close ignored:", e); }
      refs.greetingAudioCtxRef.current = null;
    }
  };
}

export function createCleanupStreaming(refs: VoiceConversationRefs) {
  return () => {
    if (refs.bargeInMonitorRef.current) {
      refs.bargeInMonitorRef.current.stop();
      refs.bargeInMonitorRef.current = null;
    }
    if (refs.audioQueueRef.current) {
      refs.audioQueueRef.current.dispose();
      refs.audioQueueRef.current = null;
    }
    if (refs.abortControllerRef.current) {
      refs.abortControllerRef.current.abort();
      refs.abortControllerRef.current = null;
    }
  };
}
