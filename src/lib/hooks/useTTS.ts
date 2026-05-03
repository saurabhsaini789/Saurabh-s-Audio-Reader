import { useState, useEffect, useCallback, useRef } from 'react';
import { AppSettings } from '../types';

export const useTTS = (onChunkEnd?: () => void) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentVoice, setCurrentVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    voiceName: null,
    rate: 1,
    pitch: 1,
    volume: 1,
    cleanReadingMode: true,
  });

  const synth = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synth.current = window.speechSynthesis;
      
      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
        
        // Try to find a good default voice
        const savedVoiceName = localStorage.getItem('tts-voice');
        const savedCleanMode = localStorage.getItem('pref-clean-mode');

        const defaultVoice = availableVoices.find(v => v.name === savedVoiceName) || 
                       availableVoices.find(v => v.name === 'Google UK English Female (en-GB)') ||
                       availableVoices.find(v => v.name.includes('Google') && v.lang.includes('en')) ||
                       availableVoices.find(v => v.lang.includes('en')) ||
                       availableVoices[0];
        
        if (defaultVoice) {
          setCurrentVoice(defaultVoice);
          setSettings(prev => ({ 
            ...prev, 
            voiceName: defaultVoice.name,
            cleanReadingMode: savedCleanMode !== null ? savedCleanMode === 'true' : true
          }));
        }
      };

      loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  }, []);

  const stop = useCallback(() => {
    if (synth.current) {
      synth.current.cancel();
      setIsPlaying(false);
    }
  }, []);
  const speak = useCallback((text: string) => {
    if (!synth.current) return;

    stop();

    // Fix: Prevent TTS from spelling out ALL CAPS words by converting them to lowercase for the voice engine
    // We only do this for words with 2 or more letters to keep small acronyms correct
    const normalizedText = text.replace(/\b([A-Z]{2,})\b/g, (match) => match.toLowerCase());
    
    const utterance = new SpeechSynthesisUtterance(normalizedText);
    if (currentVoice) utterance.voice = currentVoice;
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;

    utterance.onend = () => {
      setIsPlaying(false);
      if (onChunkEnd) onChunkEnd();
    };

    utterance.onerror = (event) => {
      if (event.error === 'interrupted' || event.error === 'canceled') return;
      console.error('TTS Error:', event.error, event);
      setIsPlaying(false);
    };

    utteranceRef.current = utterance;
    synth.current.speak(utterance);
    setIsPlaying(true);
  }, [currentVoice, settings, stop, onChunkEnd]);

  // Chrome 15s timeout fix
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && synth.current) {
      interval = setInterval(() => {
        if (synth.current?.speaking) {
          synth.current.pause();
          synth.current.resume();
        }
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const pause = useCallback(() => {
    if (synth.current && isPlaying) {
      synth.current.pause();
      setIsPlaying(false);
    }
  }, [isPlaying]);

  const resume = useCallback(() => {
    if (synth.current && !isPlaying) {
      synth.current.resume();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      if (newSettings.voiceName) {
        const voice = voices.find(v => v.name === newSettings.voiceName);
        if (voice) setCurrentVoice(voice);
        localStorage.setItem('tts-voice', newSettings.voiceName);
      }
      if (newSettings.cleanReadingMode !== undefined) {
        localStorage.setItem('pref-clean-mode', newSettings.cleanReadingMode.toString());
      }
      return updated;
    });
  }, [voices]);

  return {
    voices,
    currentVoice,
    isPlaying,
    settings,
    speak,
    pause,
    resume,
    stop,
    updateSettings
  };
};
