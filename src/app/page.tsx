'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePDF } from '@/lib/hooks/usePDF';
import { useTTS } from '@/lib/hooks/useTTS';
import { TextChunk } from '@/lib/types';
import { get, set } from 'idb-keyval';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Upload as UploadIcon, 
  Settings as SettingsIcon,
  BookOpen,
  Volume2,
  FileText,
  RotateCcw,
  Star,
  Copy,
  Check,
  PlusCircle,
  Moon,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
  const { processPDF, chunks, setChunks, isProcessing, extractionProgress, fileName } = usePDF();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHighlightsOpen, setIsHighlightsOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [savedSession, setSavedSession] = useState<{ name: string; index: number; progress: number } | null>(null);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null); // in minutes
  const [error, setError] = useState<string | null>(null);
  const activeChunkRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const handleChunkEnd = useCallback(() => {
    setCurrentIndex(prev => {
      const next = prev + 1;
      if (next < chunks.length) {
        return next;
      }
      setIsAutoPlaying(false);
      return prev;
    });
  }, [chunks.length]);

  const { 
    speak, 
    pause, 
    resume, 
    stop, 
    isPlaying, 
    voices, 
    settings, 
    updateSettings,
    currentVoice
  } = useTTS(handleChunkEnd);

  // Persistence: Load last session
  useEffect(() => {
    const loadSession = async () => {
      const savedFileName = localStorage.getItem('last-pdf-name');
      const savedIndex = localStorage.getItem('last-chunk-index');
      
      // Load chunks from IndexedDB (safer for large files)
      const savedChunks = await get('last-chunks');

      if (savedFileName && savedChunks) {
        setChunks(savedChunks);
        const index = savedIndex ? parseInt(savedIndex) : 0;
        setSavedSession({
          name: savedFileName,
          index: index,
          progress: Math.round(((index + 1) / savedChunks.length) * 100)
        });
      }

      // Load preferences
      const savedAutoScroll = localStorage.getItem('pref-auto-scroll');
      if (savedAutoScroll !== null) setIsAutoScrollEnabled(savedAutoScroll === 'true');

      // Try to recover file from IndexedDB
      const fileData = await get('last-pdf-file');
      if (fileData && !savedChunks) {
        const savedCleanMode = localStorage.getItem('pref-clean-mode');
        processPDF(fileData, savedFileName || 'Restored PDF', savedCleanMode !== null ? savedCleanMode === 'true' : true);
      }
    };
    loadSession();
  }, [setChunks, processPDF]);

  // Persistence: Save session
  useEffect(() => {
    if (chunks.length > 0) {
      // Save large data to IndexedDB
      set('last-chunks', chunks).catch(err => console.error('Failed to save chunks:', err));
      
      // Save small metadata to localStorage
      localStorage.setItem('last-chunk-index', currentIndex.toString());
      if (fileName) localStorage.setItem('last-pdf-name', fileName);
    }
  }, [chunks, currentIndex, fileName]);

  // Handle auto-play when index changes
  useEffect(() => {
    if (isAutoPlaying && chunks[currentIndex]) {
      speak(chunks[currentIndex].text);
    }
  }, [currentIndex, isAutoPlaying, chunks, speak]);

  // Auto-scroll logic: Triple-Reliability version
  useEffect(() => {
    if (!isAutoScrollEnabled || chunks.length === 0) return;

    const performScroll = () => {
      const container = scrollContainerRef.current;
      // Directly find the active element in the DOM to bypass any ref sync issues
      const element = container?.querySelector('.chunk-active') as HTMLElement;
      
      if (container && element) {
        // Precise centering calculation
        const elementTop = element.offsetTop;
        const elementHeight = element.offsetHeight;
        const containerHeight = container.offsetHeight;
        
        const scrollTo = elementTop - (containerHeight / 2) + (elementHeight / 2);
        
        container.scrollTo({
          top: scrollTo,
          behavior: 'smooth'
        });
      }
    };

    // Small delay to ensure the DOM has finished applying the .chunk-active class
    const timeoutId = setTimeout(performScroll, 100);
    
    return () => clearTimeout(timeoutId);
  }, [currentIndex, isAutoScrollEnabled, chunks.length]);
 
  // Sleep Timer Countdown
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (sleepTimer !== null && sleepTimer > 0 && isAutoPlaying) {
      interval = setInterval(() => {
        setSleepTimer(prev => {
          if (prev === null || prev <= 1) {
            pause();
            setIsAutoPlaying(false);
            return null;
          }
          return prev - 1;
        });
      }, 60000); // Check every minute
    }
    return () => clearInterval(interval);
  }, [sleepTimer, isAutoPlaying, pause]);

  const handleResume = async () => {
    const savedChunks = await get('last-chunks');
    const savedIndex = localStorage.getItem('last-chunk-index');
    if (savedChunks) {
      setChunks(savedChunks);
      if (savedIndex) setCurrentIndex(parseInt(savedIndex));
    }
  };

  const jumpToChunk = (index: number) => {
    setCurrentIndex(index);
    setIsHighlightsOpen(false);
    if (isAutoPlaying) {
      speak(chunks[index].text);
    }
  };

  const handleCopy = (text: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleImportant = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedChunks = [...chunks];
    updatedChunks[index] = {
      ...updatedChunks[index],
      isImportant: !updatedChunks[index].isImportant
    };
    setChunks(updatedChunks);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setError(null);
        setChunks([]);
        setCurrentIndex(0);
        
        // Pass the file object directly to processPDF so it can show the loading state immediately
        // processPDF handles the arrayBuffer conversion internally
        await processPDF(file, file.name, settings.cleanReadingMode);
        
        // After processing starts/finishes, we can save to IndexedDB in the background
        const buffer = await file.arrayBuffer();
        await set('last-pdf-file', buffer);
        await set('last-chunks', []); // Clear old chunks from storage
      } catch (error: any) {
        console.error('File upload/process error:', error);
        setError(error.message || 'Failed to process PDF. Please try a different file.');
      }
    }
  };

  const togglePlayback = () => {
    if (isAutoPlaying) {
      pause();
      setIsAutoPlaying(false);
    } else {
      if (chunks[currentIndex]) {
        // Just setting isAutoPlaying to true will trigger the useEffect to call speak()
        setIsAutoPlaying(true);
      }
    }
  };

  const skipForward = () => {
    setCurrentIndex(prev => Math.min(prev + 1, chunks.length - 1));
  };

  const skipBackward = () => {
    setCurrentIndex(prev => Math.max(prev - 1, 0));
  };

  const handleChunkClick = (index: number) => {
    setCurrentIndex(index);
    if (isAutoPlaying) {
      speak(chunks[index].text);
    } else {
      speak(chunks[index].text);
      setIsAutoPlaying(true);
    }
  };

  return (
    <main className="flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-10 glass px-4 py-3 flex items-center justify-between border-b shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <BookOpen className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">AudioReader</h1>
            {fileName && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
                {fileName}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <label className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer group">
            <PlusCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform" />
            <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
          </label>

          {chunks.length > 0 && chunks.some(c => c.isImportant) && (
            <button 
              onClick={() => setIsHighlightsOpen(true)}
              className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-amber-500"
            >
              <Star fill="currentColor" className="w-5 h-5" />
            </button>
          )}
          <label className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <UploadIcon className="w-5 h-5" />
            <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
          </label>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Reader Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-8 pb-40 no-scrollbar relative">
        {isProcessing ? (
          <div className="flex flex-col items-center justify-center h-64 gap-6">
            <div className="relative w-20 h-20">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle 
                  className="text-slate-200 dark:text-slate-800 stroke-current" 
                  strokeWidth="8" stroke="currentColor" fill="transparent" r="40" cx="50" cy="50" 
                />
                <motion.circle 
                  className="text-indigo-600 stroke-current" 
                  strokeWidth="8" strokeDasharray="251.2" 
                  animate={{ strokeDashoffset: 251.2 - (251.2 * extractionProgress) / 100 }}
                  strokeLinecap="round" fill="transparent" r="40" cx="50" cy="50" 
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-indigo-600">
                {extractionProgress}%
              </div>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-slate-900 dark:text-white mb-1">Processing PDF</p>
              <p className="text-sm text-slate-500 animate-pulse">Extracting text for the best reading experience...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center px-8">
            <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-6">
              <PlusCircle className="w-10 h-10 text-red-600 rotate-45" />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-red-600">Something went wrong</h2>
            <p className="text-slate-500 mb-8 max-w-xs">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg"
            >
              Try Again
            </button>
          </div>
        ) : chunks.length > 0 ? (
          <div className="max-w-2xl mx-auto space-y-6 py-[35vh]">
            {chunks.map((chunk, index) => (
              <motion.div
                key={chunk.id}
                ref={index === currentIndex ? activeChunkRef : null}
                onClick={() => handleChunkClick(index)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`p-6 rounded-2xl cursor-pointer transition-all duration-500 relative ${
                  index === currentIndex 
                    ? 'chunk-active shadow-xl scale-[1.05] ring-2 ring-indigo-500/20 z-10 bg-white dark:bg-slate-900' 
                    : 'hover:bg-white/50 dark:hover:bg-slate-900/50 opacity-40 blur-[1px] scale-95'
                } ${chunk.isImportant ? 'border-l-4 border-l-amber-400 bg-amber-50/30 dark:bg-amber-900/10' : ''}`}
              >
                <button 
                  onClick={(e) => toggleImportant(index, e)}
                  className={`absolute top-4 right-4 p-2 rounded-full transition-all ${
                    chunk.isImportant 
                      ? 'text-amber-500 scale-110' 
                      : 'text-slate-300 hover:text-amber-400'
                  }`}
                >
                  <Star fill={chunk.isImportant ? "currentColor" : "none"} className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Page {chunk.pageNumber}
                  </span>
                  {index === currentIndex && isAutoPlaying && (
                    <span className="flex gap-1 items-end h-3">
                      <span className="w-1 bg-indigo-600 animate-[bounce_0.6s_infinite]" />
                      <span className="w-1 bg-indigo-600 animate-[bounce_0.8s_infinite]" />
                      <span className="w-1 bg-indigo-600 animate-[bounce_0.7s_infinite]" />
                    </span>
                  )}
                </div>
                <p className={`text-lg leading-relaxed ${
                  index === currentIndex 
                    ? 'text-slate-900 dark:text-white font-medium' 
                    : 'text-slate-600 dark:text-slate-400'
                }`}>
                  {chunk.text}
                </p>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center px-8">
            <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mb-6">
              <FileText className="w-10 h-10 text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Ready to listen?</h2>
            <p className="text-slate-500 mb-8 max-w-xs">
              Upload a PDF to transform it into a professional audiobook experience.
            </p>
            
            <div className="flex flex-col gap-4 w-full max-w-xs">
              <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center justify-center gap-3 cursor-pointer">
                <UploadIcon className="w-5 h-5" />
                Upload PDF
                <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
              </label>

              {savedSession && (
                <button 
                  onClick={handleResume}
                  className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-4 hover:border-indigo-600 dark:hover:border-indigo-600 transition-all text-left"
                >
                  <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <RotateCcw className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-1">Resume Last Session</p>
                    <p className="text-sm font-bold truncate">{savedSession.name}</p>
                    <p className="text-[10px] text-slate-500">{savedSession.progress}% complete</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Player */}
      <AnimatePresence>
        {chunks.length > 0 && (
          <motion.footer
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 left-0 right-0 glass border-t pb-8 pt-4 px-6 z-20"
          >
            <div className="max-w-2xl mx-auto">
              {/* Progress Slider */}
              <div className="relative w-full h-6 flex items-center group mb-4">
                <input 
                  type="range"
                  min="0"
                  max={chunks.length - 1}
                  value={currentIndex}
                  onChange={(e) => handleChunkClick(parseInt(e.target.value))}
                  className="absolute w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-600 z-10"
                />
                <motion.div 
                  className="absolute h-1.5 bg-indigo-600 rounded-full pointer-events-none"
                  style={{ width: `${(currentIndex / (chunks.length - 1)) * 100}%` }}
                />
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-bold truncate text-slate-900 dark:text-slate-100">
                      {chunks[currentIndex]?.text.substring(0, 60)}...
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      {Math.round(((currentIndex + 1) / chunks.length) * 100)}% COMPLETE
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <button 
                      onClick={skipBackward} 
                      className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      aria-label="Previous chunk"
                    >
                      <SkipBack fill="currentColor" className="w-6 h-6" />
                    </button>
                    <button 
                      onClick={togglePlayback}
                      className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-indigo-500/20 active:scale-95 transition-all hover:bg-indigo-700"
                      aria-label={isAutoPlaying ? "Pause" : "Play"}
                    >
                      {isAutoPlaying ? <Pause fill="white" className="w-6 h-6" /> : <Play fill="white" className="w-6 h-6 ml-1" />}
                    </button>
                    <button 
                      onClick={skipForward} 
                      className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      aria-label="Next chunk"
                    >
                      <SkipForward fill="currentColor" className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-8 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto mb-8 sm:hidden" />
              
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold">Voice Settings</h3>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                  <Volume2 className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-3 text-slate-500">Voice</label>
                  <select 
                    value={settings.voiceName || ''}
                    onChange={(e) => updateSettings({ voiceName: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 ring-indigo-500"
                  >
                    {voices.map(voice => (
                      <option key={voice.name} value={voice.name}>
                        {voice.name} ({voice.lang})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-3 text-slate-500">Speed ({settings.rate}x)</label>
                    <input 
                      type="range" min="0.5" max="2" step="0.1" 
                      value={settings.rate}
                      onChange={(e) => updateSettings({ rate: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-3 text-slate-500">Pitch ({settings.pitch})</label>
                    <input 
                      type="range" min="0" max="2" step="0.1" 
                      value={settings.pitch}
                      onChange={(e) => updateSettings({ pitch: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                  <div>
                    <p className="text-sm font-bold">Auto-scroll to reading</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Keep active text centered</p>
                  </div>
                  <button 
                    onClick={() => {
                      const newState = !isAutoScrollEnabled;
                      setIsAutoScrollEnabled(newState);
                      localStorage.setItem('pref-auto-scroll', newState.toString());
                    }}
                    className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 ${
                      isAutoScrollEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <motion.div 
                      animate={{ x: isAutoScrollEnabled ? 24 : 0 }}
                      className="w-4 h-4 bg-white rounded-full shadow-sm"
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                  <div>
                    <p className="text-sm font-bold flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      Clean Reading Mode
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Remove headers, footers & page numbers</p>
                  </div>
                  <button 
                    onClick={() => {
                      updateSettings({ cleanReadingMode: !settings.cleanReadingMode });
                    }}
                    className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 ${
                      settings.cleanReadingMode ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <motion.div 
                      animate={{ x: settings.cleanReadingMode ? 24 : 0 }}
                      className="w-4 h-4 bg-white rounded-full shadow-sm"
                    />
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3 text-slate-500 flex items-center justify-between">
                    <span className="flex items-center gap-2"><Moon className="w-4 h-4" /> Sleep Timer</span>
                    {sleepTimer && (
                      <span className="text-indigo-600 font-bold">
                        {sleepTimer >= 60 ? `${Math.floor(sleepTimer / 60)}h ${sleepTimer % 60}m` : `${sleepTimer}m`}
                      </span>
                    )}
                  </label>
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {[null, 15, 30, 45, 60].map((mins) => (
                      <button
                        key={mins || 'off'}
                        onClick={() => setSleepTimer(mins)}
                        className={`py-2 rounded-xl text-xs font-bold transition-all ${
                          sleepTimer === mins 
                            ? 'bg-indigo-600 text-white' 
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {mins ? `${mins}m` : 'Off'}
                      </button>
                    ))}
                  </div>
                  
                  <div className="px-1">
                    <input 
                      type="range" min="0" max="120" step="1"
                      value={sleepTimer || 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setSleepTimer(val === 0 ? null : val);
                      }}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between mt-2">
                      <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Custom duration (up to 2 hrs)</span>
                    </div>
                  </div>

                  {sleepTimer && isAutoPlaying && (
                    <p className="text-[10px] text-indigo-500 mt-4 font-bold uppercase tracking-wider text-center animate-pulse">
                      Playback will stop automatically
                    </p>
                  )}
                </div>

                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl mt-4 shadow-lg shadow-indigo-100 dark:shadow-none"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Highlights Modal */}
      <AnimatePresence>
        {isHighlightsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHighlightsOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-xl">
                    <Star fill="#f59e0b" className="w-5 h-5 text-amber-500" />
                  </div>
                  <h3 className="text-xl font-bold">Important Clips</h3>
                </div>
                <button onClick={() => setIsHighlightsOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <Play className="w-5 h-5 rotate-45" /> {/* Close icon substitute or just use X if I had it */}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-4 no-scrollbar">
                {chunks.map((chunk, index) => chunk.isImportant ? (
                  <button
                    key={chunk.id}
                    onClick={() => jumpToChunk(index)}
                    className="w-full text-left p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all border border-transparent hover:border-indigo-200 group relative"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">PAGE {chunk.pageNumber}</p>
                      <button
                        onClick={(e) => handleCopy(chunk.text, index, e)}
                        className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors text-slate-400 hover:text-indigo-600"
                      >
                        {copiedIndex === index ? (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-sm line-clamp-3 text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                      {chunk.text}
                    </p>
                  </button>
                ) : null).filter(Boolean)}
              </div>

              <button 
                onClick={() => setIsHighlightsOpen(false)}
                className="w-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold py-4 rounded-2xl mt-6"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
