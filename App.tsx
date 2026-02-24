import React, { useState, useEffect, useRef, useCallback } from 'react';
import { transcribeAudioStream } from './services/geminiService';
import { ProcessingStatus, LanguageCode } from './types';
import { Mic, Square, Upload, Copy, Trash2, Download, Moon, Sun, Loader2, FileAudio } from './components/Icons';
import { Button } from './components/Button';

// Utility to convert blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:audio/wav;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const App: React.FC = () => {
  // --- State ---
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [transcript, setTranscript] = useState<string>('');
  const [language, setLanguage] = useState<LanguageCode>('es');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // --- Refs ---
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  useEffect(() => {
    const html = document.documentElement;
    if (isDarkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('aida_transcript');
    if (saved) setTranscript(saved);
  }, []);

  // Save to local storage on change
  useEffect(() => {
    localStorage.setItem('aida_transcript', transcript);
  }, [transcript]);

  // Auto-scroll textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [transcript, status]);

  // --- Handlers ---

  const handleToggleTheme = () => setIsDarkMode(!isDarkMode);

  const startRecording = async () => {
    if (!window.MediaRecorder) {
      setError("Your browser does not support audio recording. Please use a modern browser.");
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Determine supported MIME type (important for mobile/iOS)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : MediaRecorder.isTypeSupported('audio/mp4') 
          ? 'audio/mp4' 
          : 'audio/aac';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await processAudio(audioBlob, mimeType);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setStatus(ProcessingStatus.RECORDING);
    } catch (err: any) {
      console.error(err);
      let msg = "Unable to access microphone.";
      if (err.name === 'NotAllowedError') msg = "Microphone access denied. Please enable it in settings.";
      if (err.name === 'NotFoundError') msg = "No microphone found on this device.";
      setError(msg);
      setStatus(ProcessingStatus.ERROR);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && status === ProcessingStatus.RECORDING) {
      mediaRecorderRef.current.stop();
      // Status update happens in onstop
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileName(file.name);
      processAudio(file, file.type);
    }
  };

  const processAudio = async (blob: Blob, mimeType: string) => {
    setStatus(ProcessingStatus.PROCESSING);
    setError(null);
    
    // Check if key is available
    if (!process.env.API_KEY) {
      setError("API Key missing. Please configure VITE_GEMINI_API_KEY in your environment.");
      setStatus(ProcessingStatus.ERROR);
      return;
    }

    try {
      const base64Data = await blobToBase64(blob);
      
      setStatus(ProcessingStatus.STREAMING);
      
      // Clear previous if starting new, or append? 
      // Let's append with a newline if there's existing text
      if (transcript.length > 0) {
        setTranscript(prev => prev + '\n\n--- New Transcription ---\n\n');
      }

      await transcribeAudioStream(base64Data, mimeType, language, (chunk) => {
        setTranscript(prev => prev + chunk);
      });

      setStatus(ProcessingStatus.SUCCESS);
      setFileName(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during transcription.");
      setStatus(ProcessingStatus.ERROR);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcript);
  };

  const clearText = () => {
    if (confirm("Are you sure you want to clear the transcript?")) {
      setTranscript('');
      setStatus(ProcessingStatus.IDLE);
    }
  };

  const downloadTxt = () => {
    const element = document.createElement("a");
    const file = new Blob([transcript], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `transcription_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-indigo-500/30">
      
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 h-14 md:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-base md:text-lg shadow-lg shadow-indigo-500/20">
              A
            </div>
            <h1 className="text-lg md:text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
              Aida
            </h1>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3">
            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="bg-gray-100 dark:bg-gray-800 border-none rounded-lg py-1 px-2 md:py-1.5 md:px-3 text-xs md:text-sm font-medium focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="es">ES</option>
              <option value="en">EN</option>
              <option value="fr">FR</option>
            </select>
            
            <button 
              onClick={handleToggleTheme}
              className="p-1.5 md:p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-4 md:py-8 flex flex-col gap-4 md:gap-8">
        
        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl text-sm border border-red-100 dark:border-red-900/30 flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
             <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {/* Action Area */}
        <section className="grid md:grid-cols-2 gap-6">
          
          {/* Recorder Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center gap-6 relative overflow-hidden group">
            <div className={`absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 transition-opacity duration-500 ${status === ProcessingStatus.RECORDING ? 'opacity-100' : 'opacity-0'}`} />
            
            <div className="relative z-10 text-center space-y-2">
              <h2 className="text-lg font-semibold">Voice Recording</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Click to start transcribing</p>
            </div>

            <div className="relative z-10">
              {status === ProcessingStatus.RECORDING ? (
                <button 
                  onClick={stopRecording}
                  className="w-24 h-24 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white shadow-xl shadow-red-500/30 transition-all transform hover:scale-105 animate-pulse"
                >
                  <Square size={32} fill="currentColor" />
                </button>
              ) : (
                <button 
                  onClick={startRecording}
                  disabled={status === ProcessingStatus.PROCESSING || status === ProcessingStatus.STREAMING}
                  className="w-24 h-24 rounded-full flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-500/30 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                   <Mic size={32} className="group-hover:animate-bounce" />
                </button>
              )}
            </div>

            <div className="h-6 flex items-center justify-center gap-2 text-indigo-600 dark:text-indigo-400 font-medium text-sm">
              {status === ProcessingStatus.RECORDING && (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Recording...
                </>
              )}
              {status === ProcessingStatus.PROCESSING && (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Uploading...
                </>
              )}
               {status === ProcessingStatus.STREAMING && (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Transcribing with Gemini...
                </>
              )}
            </div>
          </div>

          {/* Upload Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center gap-4 text-center relative hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
            <input 
              type="file" 
              ref={fileInputRef}
              accept="audio/*" 
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              disabled={status === ProcessingStatus.PROCESSING || status === ProcessingStatus.STREAMING}
            />
            <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-2">
              <Upload size={28} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Upload Audio File</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Drop MP3, WAV, or M4A here <br/> or click to browse
              </p>
            </div>
            {fileName && (
              <div className="mt-2 px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs font-medium flex items-center gap-2">
                <FileAudio size={12} />
                {fileName}
              </div>
            )}
          </div>
        </section>

        {/* Transcription Area */}
        <section className="flex-1 flex flex-col min-h-[350px] md:min-h-[500px] bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden transition-all duration-300">
          {/* Toolbar */}
          <div className="px-4 md:px-6 py-3 md:py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <span className="text-[10px] md:text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">
                Transcription
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" onClick={copyToClipboard} title="Copy" disabled={!transcript} className="h-8 w-8 md:h-9 md:w-9 p-0">
                <Copy size={16} className="md:hidden" />
                <Copy size={18} className="hidden md:block" />
              </Button>
              <Button variant="ghost" onClick={downloadTxt} title="Download" disabled={!transcript} className="h-8 w-8 md:h-9 md:w-9 p-0">
                <Download size={16} className="md:hidden" />
                <Download size={18} className="hidden md:block" />
              </Button>
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
              <Button variant="ghost" onClick={clearText} title="Clear" className="h-8 w-8 md:h-9 md:w-9 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" disabled={!transcript}>
                <Trash2 size={16} className="md:hidden" />
                <Trash2 size={18} className="hidden md:block" />
              </Button>
            </div>
          </div>

          {/* Text Area Container */}
          <div className="relative flex-1 flex flex-col bg-gray-50/30 dark:bg-gray-900/10">
            <textarea
              ref={textareaRef}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Your transcription will appear here..."
              className="flex-1 w-full p-4 md:p-8 bg-transparent border-none resize-none focus:ring-0 custom-scrollbar text-base md:text-xl leading-[1.6] md:leading-[1.8] font-normal text-gray-800 dark:text-gray-100 outline-none placeholder:text-gray-300 dark:placeholder:text-gray-700"
              spellCheck={false}
            />
            
            {!transcript && status === ProcessingStatus.IDLE && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 dark:text-gray-700 pointer-events-none select-none">
                <div className="mb-4 opacity-20">
                  <FileAudio size={64} strokeWidth={1} />
                </div>
                <p className="text-sm font-medium tracking-wide">Waiting for audio input or file upload...</p>
              </div>
            )}

            {/* Status Indicator Overlay (Bottom Right) */}
            {(status === ProcessingStatus.STREAMING || status === ProcessingStatus.PROCESSING) && (
              <div className="absolute bottom-6 right-6 px-4 py-2 bg-indigo-600 text-white rounded-full shadow-lg flex items-center gap-2 text-xs font-bold animate-in fade-in zoom-in duration-300">
                <Loader2 className="animate-spin" size={14} />
                {status === ProcessingStatus.STREAMING ? 'TRANSCRIBING...' : 'PROCESSING...'}
              </div>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-sm text-gray-400 dark:text-gray-600 py-4">
          <p>Powered by Google Gemini 3 Flash • Secure & Private</p>
        </footer>
      </main>
    </div>
  );
};

export default App;