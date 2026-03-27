
import React, { useState, useEffect, useMemo } from 'react';
import { Search, Brain, List, BarChart3, Plus, Volume2, Trash2, Check, Clock, CalendarDays, Undo2, LogOut, Download } from 'lucide-react';
import { Word, View, REVIEW_INTERVALS } from './types';
import { getTranslation } from './geminiService';
import { auth, db, signInWithGoogle, logOut, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc, getDoc, query, orderBy } from 'firebase/firestore';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeView, setActiveView] = useState<View>(View.HOME);
  const [words, setWords] = useState<Word[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [translationResult, setTranslationResult] = useState<any>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [showDiscoverTranslation, setShowDiscoverTranslation] = useState(false);
  const [expandedSchedule, setExpandedSchedule] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Handle PWA Install Prompt
  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone);

    // Standard listener inside React
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if it was already captured before React mounted
    if ((window as any).deferredPWAInstallPrompt) {
      setDeferredPrompt((window as any).deferredPWAInstallPrompt);
    }

    const handleInstallReady = () => {
      setDeferredPrompt((window as any).deferredPWAInstallPrompt);
    };

    window.addEventListener('pwa-install-ready', handleInstallReady);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-install-ready', handleInstallReady);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setDeferredPrompt(null);
        }
      } catch (error) {
        console.error('PWA prompt error:', error);
        setShowInstallModal(true);
      }
    } else {
      setShowInstallModal(true);
    }
  };

  // Update current time every second to auto-refresh "due" status
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      
      if (currentUser) {
        // Ensure user document exists
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              email: currentUser.email,
              createdAt: Date.now()
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore Sync
  useEffect(() => {
    if (!isAuthReady || !user) {
      setWords([]);
      return;
    }

    const wordsRef = collection(db, 'users', user.uid, 'words');
    const q = query(wordsRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedWords: Word[] = [];
      snapshot.forEach((doc) => {
        fetchedWords.push({ id: doc.id, ...doc.data() } as Word);
      });
      setWords(fetchedWords);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/words`);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/unauthorized-domain') {
        setLoginError("域名未授权。请将当前网页的域名添加到 Firebase 控制台 (Authentication -> Settings -> Authorized domains)。");
      } else {
        setLoginError(error.message || "登录失败，请重试。");
      }
    }
  };

  const handleTranslate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    setLoading(true);
    setTranslationError(null);
    setShowDiscoverTranslation(false);
    try {
      const result = await getTranslation(inputText);
      setTranslationResult(result);
    } catch (error: any) {
      console.error("Translation failed", error);
      setTranslationError(error.message || "Failed to translate. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const addToMemory = async () => {
    if (!translationResult || !user) return;
    const timestamp = Date.now();
    const wordsRef = collection(db, 'users', user.uid, 'words');
    const newWordId = doc(wordsRef).id;
    
    const newWordData = {
      original: inputText,
      translation: translationResult.translation,
      phonetic: translationResult.phonetic || '',
      definitionEn: translationResult.definitionEn || '',
      exampleSentence: translationResult.exampleSentence || '',
      stage: 1, 
      createdAt: timestamp,
      lastReviewDate: timestamp,
      nextReviewDate: timestamp + REVIEW_INTERVALS[1]
    };

    try {
      const wordRef = doc(db, 'users', user.uid, 'words', newWordId);
      await setDoc(wordRef, newWordData);
      setInputText('');
      setTranslationResult(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/words/${newWordId}`);
    }
  };

  const deleteWord = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'words', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/words/${id}`);
    }
  };

  const updateWordStage = async (id: string, remembered: boolean) => {
    if (!user) return;
    const word = words.find(w => w.id === id);
    if (!word) return;

    const timestamp = Date.now();
    const nextStage = remembered ? Math.min(word.stage + 1, REVIEW_INTERVALS.length - 1) : 1;
    
    try {
      const wordRef = doc(db, 'users', user.uid, 'words', id);
      await updateDoc(wordRef, {
        stage: nextStage,
        lastReviewDate: timestamp,
        nextReviewDate: timestamp + REVIEW_INTERVALS[nextStage]
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/words/${id}`);
    }
  };

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  const formatNextReview = (nextDate: number) => {
    const diff = nextDate - now;
    if (diff <= 0) return { text: 'Ready', color: 'text-red-500' };
    const secs = Math.floor(diff / 1000);
    const mins = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (secs < 60) return { text: `in ${secs}s`, color: 'text-orange-500 font-bold' };
    if (mins < 60) return { text: `in ${mins}m`, color: 'text-sky-500' };
    if (hours < 24) return { text: `in ${hours}h`, color: 'text-sky-500' };
    return { text: `in ${days}d`, color: 'text-sky-400' };
  };

  const getIntervalLabel = (stage: number) => {
    const ms = REVIEW_INTERVALS[stage];
    if (ms === undefined) return "Max";
    if (ms === 0) return "Instant";
    const secs = ms / 1000;
    if (secs < 60) return `${secs}s`;
    const mins = secs / 60;
    if (mins < 60) return `${mins}m`;
    const hours = mins / 60;
    if (hours < 24) return `${hours}h`;
    const days = hours / 24;
    if (days < 30) return `${days}d`;
    return `${Math.round(days / 30)}mo`;
  };

  const dueWords = useMemo(() => words.filter(w => now >= w.nextReviewDate), [words, now]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-100 via-white to-cyan-100 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-sky-300/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-cyan-300/20 rounded-full blur-3xl animate-pulse delay-700"></div>
        </div>
        <div className="w-16 h-16 border-8 border-sky-200 border-t-sky-500 rounded-full animate-spin shadow-[0_0_15px_rgba(14,165,233,0.5)] relative z-10"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-sky-100 via-white to-cyan-100 text-sky-900 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMwZWE1ZTkiIHN0cm9rZS13aWR0aD0iMSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTEgMjB2LTYiLz48cGF0aCBkPSJNMTMgMjB2LTYiLz48cGF0aCBkPSJNMTEgNHY2Ii8+PHBhdGggZD0iTTEzIDR2NiIvPjxwYXRoIGQ9Ik0yMCAxMWgtNiIvPjxwYXRoIGQ9Ik0yMCAxM2gtNiIvPjxwYXRoIGQ9Ik00IDExaDYiLz48cGF0aCBkPSJNNCAxM2g2Ii8+PHBhdGggZD0ibTE2LjI0IDE2LjI0LTQuMjQtNC4yNCIvPjxwYXRoIGQ9Im0xNy42NiAxNC44My00LjI0LTQuMjQiLz48cGF0aCBkPSJtNi4zNCA2LjM0IDQuMjQgNC4yNCIvPjxwYXRoIGQ9Im03Ljc2IDcuNzYgNC4yNCA0LjI0Ii8+PHBhdGggZD0ibTE2LjI0IDcuNzYtNC4yNCA0LjI0Ii8+PHBhdGggZD0ibTE3LjY2IDkuMTctNC4yNCA0LjI0Ii8+PHBhdGggZD0ibTYuMzQgMTcuNjYgNC4yNC00LjI0Ii8+PHBhdGggZD0ibTcuNzYgMTYuMjQgNC4yNC00LjI0Ii8+PC9zdmc+')] bg-[length:60px_60px] opacity-10"></div>
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-sky-300/30 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-cyan-300/30 rounded-full blur-3xl"></div>
        </div>
        {!isStandalone && (
          <button 
            onClick={handleInstallClick}
            className="absolute top-6 right-6 px-5 py-2.5 bg-white/80 backdrop-blur-sm text-sky-600 hover:bg-white rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-md hover:shadow-lg border-2 border-white z-10 hover:-translate-y-0.5"
          >
            <Download size={18} strokeWidth={2.5} />
            Install App
          </button>
        )}
        <div className="bg-white/80 backdrop-blur-md p-10 rounded-[3rem] shadow-[0_8px_30px_rgba(14,165,233,0.15)] max-w-md w-full border-4 border-white text-center space-y-10 relative z-10 my-8">
          <div className="absolute top-6 left-6">
            <span className="text-[10px] font-black bg-gradient-to-r from-sky-400 to-cyan-400 text-white px-3 py-1 rounded-full shadow-sm">v2.2</span>
          </div>
          <div className="absolute top-6 right-6 flex items-center gap-2">
            {!isStandalone && (
              <button 
                onClick={handleInstallClick}
                className="p-2 text-sky-400 hover:text-sky-600 hover:bg-sky-50 rounded-full transition-colors"
                title="Install App"
              >
                <Download size={20} strokeWidth={2.5} />
              </button>
            )}
            <button 
              onClick={() => window.location.reload()}
              className="p-2 text-sky-300 hover:text-sky-500 hover:bg-sky-50 rounded-full transition-colors"
              title="Force Refresh"
            >
              <Undo2 size={18} strokeWidth={2.5} />
            </button>
          </div>
          <div className="flex justify-center pt-8">
            <div className="w-48 h-56 bg-gradient-to-br from-sky-100 to-cyan-100 rounded-[2rem] flex items-center justify-center text-sky-500 shadow-inner border-4 border-white relative overflow-visible transform rotate-2 hover:rotate-0 transition-transform duration-300">
              <div className="absolute -top-3 -right-3 text-4xl animate-sparkle z-20 drop-shadow-md">✨</div>
              <div className="w-full h-full rounded-[1.8rem] overflow-hidden relative z-10 shadow-sm bg-sky-50 flex items-center justify-center">
                <img 
                  src={`/elsa.jpg?t=${Date.now()}`}
                  alt="Elsa" 
                  className="w-full h-full object-cover object-top absolute inset-0 z-20"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <Brain size={48} strokeWidth={2.5} className="text-sky-400 z-10" />
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-black text-sky-900 tracking-tight drop-shadow-sm">Magic Words</h1>
            <p className="text-sky-600/80 text-base font-medium">Learn English with Elsa!</p>
          </div>
          <div className="pt-4">
            <button
              onClick={handleLogin}
              className="w-full py-4 bg-gradient-to-r from-sky-400 to-cyan-400 text-white rounded-2xl font-black uppercase tracking-wider hover:from-sky-500 hover:to-cyan-500 transition-all shadow-[0_8px_20px_rgba(14,165,233,0.3)] hover:shadow-[0_8px_25px_rgba(14,165,233,0.4)] hover:-translate-y-1 border-2 border-white flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>
            {loginError && (
              <p className="mt-4 text-sm text-red-500 font-bold bg-red-50 p-3 rounded-xl border border-red-100">{loginError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-lg mx-auto bg-gradient-to-b from-sky-200 via-blue-50 to-cyan-100 flex flex-col shadow-sm selection:bg-sky-200 relative overflow-hidden font-['Fredoka']">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMwZWE1ZTkiIHN0cm9rZS13aWR0aD0iMSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTEgMjB2LTYiLz48cGF0aCBkPSJNMTMgMjB2LTYiLz48cGF0aCBkPSJNMTEgNHY2Ii8+PHBhdGggZD0iTTEzIDR2NiIvPjxwYXRoIGQ9Ik0yMCAxMWgtNiIvPjxwYXRoIGQ9Ik0yMCAxM2gtNiIvPjxwYXRoIGQ9Ik00IDExaDYiLz48cGF0aCBkPSJNNCAxM2g2Ii8+PHBhdGggZD0ibTE2LjI0IDE2LjI0LTQuMjQtNC4yNCIvPjxwYXRoIGQ9Im0xNy42NiAxNC44My00LjI0LTQuMjQiLz48cGF0aCBkPSJtNi4zNCA2LjM0IDQuMjQgNC4yNCIvPjxwYXRoIGQ9Im03Ljc2IDcuNzYgNC4yNCA0LjI0Ii8+PHBhdGggZD0ibTE2LjI0IDcuNzYtNC4yNCA0LjI0Ii8+PHBhdGggZD0ibTE3LjY2IDkuMTctNC4yNCA0LjI0Ii8+PHBhdGggZD0ibTYuMzQgMTcuNjYgNC4yNC00LjI0Ii8+PHBhdGggZD0ibTcuNzYgMTYuMjQgNC4yNC00LjI0Ii8+PC9zdmc+')] bg-[length:60px_60px] bg-repeat z-0"></div>
      
      {/* Snowflakes Overlay */}
      <div className="snowflakes" aria-hidden="true">
        <div className="snowflake">❄</div>
        <div className="snowflake">❅</div>
        <div className="snowflake">❆</div>
        <div className="snowflake">❄</div>
        <div className="snowflake">❅</div>
        <div className="snowflake">❆</div>
        <div className="snowflake">❄</div>
        <div className="snowflake">❅</div>
        <div className="snowflake">❆</div>
      </div>

      <header className="px-6 pt-4 pb-4 bg-white/40 backdrop-blur-md sticky top-0 z-20 border-b-4 border-white/60 flex justify-between items-center rounded-b-[2rem] shadow-[0_4px_20px_rgba(255,255,255,0.5)]">
        <h1 className="text-2xl font-black tracking-tight text-sky-800 flex items-center gap-2 drop-shadow-md text-ice-glow">
          <span className="text-white drop-shadow-md animate-sparkle">✨</span>
          Elsa’s English
          <span className="text-[10px] font-black bg-white text-sky-500 px-2 py-1 rounded-full ml-1 border-2 border-sky-200 shadow-sm">v2.2</span>
        </h1>
        <div className="flex items-center gap-2">
          {!isStandalone && (
            <button 
              onClick={handleInstallClick}
              className="px-3 py-1.5 bg-gradient-to-r from-sky-100 to-cyan-100 text-sky-600 hover:from-sky-200 hover:to-cyan-200 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-colors shadow-sm border-2 border-white"
            >
              <Download size={14} />
              Install
            </button>
          )}
          <button onClick={logOut} className="p-2 text-sky-400 hover:text-sky-600 transition-colors bg-white rounded-full shadow-sm border-2 border-sky-100">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 overflow-y-auto pb-32 relative z-10">
        {activeView === View.HOME && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <section className="space-y-4">
              <form onSubmit={handleTranslate} className="relative group">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Type a word or phrase..."
                  enterKeyHint="search"
                  className="w-full h-16 px-6 pr-14 rounded-3xl bg-white/90 border-4 border-white focus:outline-none focus:ring-4 focus:ring-sky-300/50 focus:border-sky-300 transition-all text-lg font-medium shadow-inner placeholder:text-sky-300 text-sky-800"
                />
                <button type="submit" disabled={loading} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-xl text-sky-400 hover:text-sky-600 transition-colors">
                  {loading ? <div className="w-5 h-5 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" /> : <Search size={28} strokeWidth={3} />}
                </button>
              </form>

              {loading && (
                <div className="bg-white/70 backdrop-blur-md rounded-[2rem] p-6 shadow-[0_8px_30px_rgba(14,165,233,0.15)] border-4 border-white space-y-4 animate-pulse relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 text-6xl opacity-10 pointer-events-none">❄️</div>
                  <div className="flex justify-between items-start">
                    <div className="space-y-2 flex-1">
                      <div className="h-6 bg-sky-200 rounded w-1/3"></div>
                      <div className="h-4 bg-sky-100 rounded w-1/4"></div>
                    </div>
                    <div className="w-10 h-10 bg-sky-100 rounded-full"></div>
                  </div>
                  <div className="space-y-3 pt-2 border-t border-sky-50">
                    <div>
                      <div className="h-3 bg-sky-100 rounded w-16 mb-2"></div>
                      <div className="h-4 bg-sky-200 rounded w-full"></div>
                      <div className="h-4 bg-sky-200 rounded w-5/6 mt-1"></div>
                    </div>
                    <div>
                      <div className="h-3 bg-sky-100 rounded w-16 mb-2"></div>
                      <div className="h-16 bg-sky-100 rounded-xl w-full"></div>
                    </div>
                  </div>
                </div>
              )}

              {translationError && !loading && (
                <div className="bg-red-50 text-red-500 p-4 rounded-2xl text-sm border border-red-100">
                  {translationError}
                </div>
              )}

              {translationResult && !loading && (
                <div className="animate-float">
                  <div className="bg-white/70 backdrop-blur-md rounded-[2rem] p-6 shadow-[0_8px_30px_rgba(14,165,233,0.15)] border-4 border-white space-y-6 animate-in slide-in-from-bottom-4 duration-500 relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 text-6xl opacity-10 pointer-events-none">❄️</div>
                    <div className="flex justify-between items-start">
                      <div className="space-y-2 flex-1">
                        <div className="min-h-[28px] flex items-center">
                          {!showDiscoverTranslation ? (
                            <button 
                              onClick={() => setShowDiscoverTranslation(true)}
                              className="px-3 py-1 bg-sky-100 hover:bg-sky-200 text-sky-600 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
                            >
                              Show Translation
                            </button>
                          ) : (
                            <h3 className="text-xl font-semibold text-sky-800">{translationResult.translation}</h3>
                          )}
                        </div>
                        <p className="text-sky-400 text-sm font-mono tracking-wider">{translationResult.phonetic}</p>
                      </div>
                      <button onClick={() => speak(inputText)} className="p-3 bg-gradient-to-br from-sky-100 to-white rounded-full text-sky-500 hover:scale-110 transition-transform shadow-sm border-2 border-white">
                        <Volume2 size={24} strokeWidth={2.5} />
                      </button>
                    </div>
                    
                    <div className="space-y-3 pt-2 border-t border-sky-50 relative z-10">
                      <div>
                        <p className="text-[10px] font-bold text-sky-400 uppercase tracking-widest mb-1">Definition</p>
                        <p className="text-sm text-sky-800 leading-relaxed font-medium">{translationResult.definitionEn}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-sky-400 uppercase tracking-widest mb-1">Example</p>
                        <p className="text-sky-700 italic text-sm leading-relaxed bg-white/50 p-3 rounded-xl border-2 border-white">
                          "{translationResult.exampleSentence}"
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={addToMemory}
                      className="w-full py-4 rounded-3xl bg-gradient-to-r from-sky-400 to-cyan-400 text-white text-xl font-black hover:from-sky-500 hover:to-cyan-500 active:translate-y-1 transition-all flex items-center justify-center gap-2 shadow-[0_6px_0_rgb(14,165,233)] border-2 border-white/50 relative z-10"
                    >
                      <Brain size={24} strokeWidth={3} />
                      Learn this word
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-4">
               <div className="flex items-center justify-between">
                 <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">Progress</h2>
                 <span className="text-[10px] text-sky-600 font-bold px-2 py-1 bg-sky-100/50 rounded-full">
                    {dueWords.length} due now
                 </span>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/80 backdrop-blur-sm p-5 rounded-3xl border-2 border-white shadow-[0_4px_15px_rgba(14,165,233,0.1)] relative overflow-hidden">
                    <div className="absolute -right-2 -bottom-2 text-4xl opacity-10">📚</div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-sky-400 mb-1">Vocabulary</p>
                    <p className="text-3xl font-black text-sky-800">{words.length}</p>
                  </div>
                  <div className="bg-white/80 backdrop-blur-sm p-5 rounded-3xl border-2 border-white shadow-[0_4px_15px_rgba(14,165,233,0.1)] relative overflow-hidden">
                    <div className="absolute -right-2 -bottom-2 text-4xl opacity-10">✨</div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-sky-400 mb-1">Mastered</p>
                    <p className="text-3xl font-black text-cyan-500">{words.filter(w => w.stage >= REVIEW_INTERVALS.length - 1).length}</p>
                  </div>
               </div>
            </section>
          </div>
        )}

        {activeView === View.REVIEW && <ReviewMode key={dueWords.length > 0 ? 'active' : 'idle'} words={dueWords} onReview={updateWordStage} onSpeak={speak} />}

        {activeView === View.LIST && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400 mb-6">Library</h2>
            {words.length === 0 ? (
               <div className="text-center py-20 text-sky-300 font-light italic">Your library is empty</div>
            ) : (
              <div className="space-y-3">
                {words.map(w => {
                  const timeInfo = formatNextReview(w.nextReviewDate);
                  const isExpanded = expandedSchedule === w.id;
                  return (
                    <div key={w.id} className="bg-white/80 backdrop-blur-sm rounded-[2rem] border-2 border-white overflow-hidden shadow-[0_4px_15px_rgba(14,165,233,0.1)] transition-all hover:scale-[1.02]">
                      <div className="p-5 flex items-center justify-between group">
                        <div className="space-y-1">
                          <h4 className="font-bold text-lg text-sky-900">{w.original}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-sky-600/70">{w.translation}</span>
                            <span className="w-1.5 h-1.5 bg-sky-200 rounded-full"></span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-black text-sky-500 bg-sky-100 px-2 py-0.5 rounded-full uppercase border border-sky-200">LV {w.stage}</span>
                              <span className={`text-[10px] font-bold flex items-center gap-1 ${timeInfo.color}`}>
                                <Clock size={12} strokeWidth={3} />
                                {timeInfo.text}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => setExpandedSchedule(isExpanded ? null : w.id)}
                            className={`p-2 rounded-full transition-colors ${isExpanded ? 'bg-sky-200 text-sky-700' : 'text-sky-300 hover:text-sky-500 hover:bg-sky-100'}`}
                          >
                            <CalendarDays size={20} strokeWidth={2.5} />
                          </button>
                          <button onClick={() => deleteWord(w.id)} className="p-2 text-sky-200 hover:text-pink-500 transition-all">
                            <Trash2 size={20} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="px-5 pb-5 pt-2 bg-gradient-to-b from-sky-50/50 to-white/50 border-t-2 border-white animate-in slide-in-from-top-2">
                          <div className="space-y-3">
                            <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest mb-3">Ebbinghaus Retention Plan</p>
                            <div className="relative pl-4 space-y-4 before:absolute before:left-1 before:top-1 before:bottom-1 before:w-0.5 before:bg-sky-100">
                              {REVIEW_INTERVALS.slice(1).map((interval, idx) => {
                                const stageNum = idx + 1;
                                const isDone = stageNum < w.stage;
                                const isCurrent = stageNum === w.stage;
                                
                                let displayDate: Date;
                                if (isDone) {
                                  displayDate = new Date(w.createdAt); 
                                } else {
                                  displayDate = new Date(w.lastReviewDate + (isCurrent ? 0 : interval));
                                }
                                
                                return (
                                  <div key={idx} className="relative flex items-center justify-between text-[11px]">
                                    <div className={`absolute -left-[15px] w-2 h-2 rounded-full z-10 ${isDone ? 'bg-cyan-400' : (isCurrent ? 'bg-sky-500 ring-4 ring-sky-200' : 'bg-sky-200')}`}></div>
                                    <span className={`${isDone ? 'text-sky-300 line-through' : (isCurrent ? 'text-sky-700 font-bold' : 'text-sky-600/70 font-medium')}`}>
                                      Step {stageNum} ({getIntervalLabel(stageNum)})
                                    </span>
                                    <span className="text-sky-500/80 font-mono font-medium">
                                      {isCurrent ? 'Est: ' : ''}
                                      {isCurrent ? formatNextReview(w.nextReviewDate).text : displayDate.toLocaleDateString()}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeView === View.STATS && (
           <div className="space-y-6 animate-in fade-in duration-500">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400/80">Memory Analytics</h2>
              <div className="bg-white/80 backdrop-blur-sm p-8 rounded-[2.5rem] border-2 border-white shadow-[0_4px_15px_rgba(14,165,233,0.1)] relative overflow-hidden animate-float">
                <div className="absolute top-0 right-0 w-32 h-32 bg-sky-200/20 rounded-full blur-2xl -mr-10 -mt-10"></div>
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-cyan-200/20 rounded-full blur-xl -ml-10 -mb-10"></div>
                <div className="flex flex-wrap gap-2 justify-center relative z-10">
                  {(() => {
                    // Generate activity heatmap for the last 112 days
                    const days = 112;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    // Count words added per day
                    const activityMap = new Map<number, number>();
                    words.forEach(w => {
                      const d = new Date(w.createdAt);
                      d.setHours(0, 0, 0, 0);
                      const time = d.getTime();
                      activityMap.set(time, (activityMap.get(time) || 0) + 1);
                    });

                    return Array.from({ length: days }).map((_, i) => {
                      const d = new Date(today);
                      d.setDate(d.getDate() - (days - 1 - i));
                      const count = activityMap.get(d.getTime()) || 0;
                      
                      let colorClass = 'bg-sky-100/50';
                      if (count > 0) colorClass = 'bg-sky-200';
                      if (count > 3) colorClass = 'bg-sky-400';
                      if (count > 8) colorClass = 'bg-sky-600 shadow-[0_0_8px_rgba(2,132,199,0.5)]';

                      return (
                        <div 
                          key={i} 
                          title={`${d.toLocaleDateString()}: ${count} words`}
                          className={`w-3 h-3 rounded-sm transition-all hover:scale-150 ${colorClass}`} 
                        />
                      );
                    });
                  })()}
                </div>
                <div className="mt-8 flex justify-between items-end relative z-10">
                   <div>
                     <p className="text-3xl font-black text-sky-800">
                       {words.length > 0 ? Math.round((words.filter(w => w.stage >= REVIEW_INTERVALS.length - 1).length / words.length) * 100) : 0}%
                     </p>
                     <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Mastery Rate</p>
                   </div>
                   <div className="text-right">
                     <p className="text-3xl font-black text-sky-800">
                       {(() => {
                         if (words.length === 0) return '0.0';
                         const oldest = Math.min(...words.map(w => w.createdAt));
                         const daysSinceOldest = Math.max(1, Math.ceil((Date.now() - oldest) / (1000 * 60 * 60 * 24)));
                         return (words.length / daysSinceOldest).toFixed(1);
                       })()}
                     </p>
                     <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Words / Day</p>
                   </div>
                </div>
              </div>
           </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white/95 backdrop-blur-2xl border-t-2 border-sky-100 shadow-[0_-10px_40px_rgba(14,165,233,0.15)] rounded-t-[2.5rem] px-4 pt-1 pb-2 flex items-center justify-around z-50">
        <NavButton active={activeView === View.HOME} onClick={() => setActiveView(View.HOME)} icon={<Search size={22} />} label="Discover" />
        <NavButton 
          active={activeView === View.REVIEW} 
          onClick={() => setActiveView(View.REVIEW)} 
          icon={<Brain size={22} />} 
          label="Review" 
          badge={dueWords.length > 0 ? dueWords.length : undefined}
        />
        <NavButton active={activeView === View.LIST} onClick={() => setActiveView(View.LIST)} icon={<List size={22} />} label="Library" />
        <NavButton active={activeView === View.STATS} onClick={() => setActiveView(View.STATS)} icon={<BarChart3 size={22} />} label="Stats" />
      </nav>

      {showInstallModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-sky-900/40 backdrop-blur-md"
          onClick={() => setShowInstallModal(false)}
        >
          <div 
            className="bg-white/90 backdrop-blur-md rounded-[3rem] p-8 max-w-sm w-full shadow-[0_20px_60px_rgba(14,165,233,0.3)] space-y-6 animate-in zoom-in-95 duration-200 border-4 border-white relative overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-sky-200/30 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
            <div className="w-20 h-20 bg-gradient-to-br from-sky-100 to-cyan-100 text-sky-500 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner border-2 border-white relative z-10">
              <div className="absolute -top-1 -right-1 text-xl animate-bounce">✨</div>
              <Download size={36} strokeWidth={2.5} />
            </div>
            <div className="text-center space-y-2 relative z-10">
              <h3 className="text-2xl font-black text-sky-900 drop-shadow-sm">Magic Install</h3>
              <p className="text-sky-600/80 text-sm font-medium">
                Your browser blocked the automatic magic. Please add it manually:
              </p>
            </div>
            <div className="bg-gradient-to-br from-sky-50 to-cyan-50 p-5 rounded-3xl text-sm text-sky-800 space-y-4 border-2 border-white shadow-sm relative z-10 font-medium">
              <p className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-200 text-sky-700 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">1</span>
                <span>Tap the browser menu<br/><span className="text-xs text-sky-500/70">(⋮ top right, or ↗ bottom)</span></span>
              </p>
              <p className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-sky-200 text-sky-700 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">2</span>
                <span>Select <strong>Install App</strong> or <strong>Add to Home Screen</strong></span>
              </p>
            </div>
            <button 
              onClick={() => setShowInstallModal(false)}
              className="w-full py-4 bg-gradient-to-r from-sky-400 to-cyan-400 text-white rounded-2xl font-black uppercase tracking-wider hover:from-sky-500 hover:to-cyan-500 transition-all shadow-[0_8px_20px_rgba(14,165,233,0.3)] hover:-translate-y-1 relative z-10 border-2 border-white"
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }> = ({ active, onClick, icon, label, badge }) => (
  <button 
    onClick={onClick}
    className={`relative px-4 py-1.5 rounded-3xl flex flex-col items-center gap-1 transition-all duration-300 ${active ? 'bg-sky-400 text-white shadow-lg shadow-sky-400/40 scale-110 -translate-y-2' : 'text-sky-400 hover:bg-sky-50 hover:text-sky-500'}`}
  >
    {icon}
    <span className="text-[10px] font-black tracking-widest uppercase">{label}</span>
    {badge !== undefined && !active && (
      <span className="absolute top-0 right-2 w-4 h-4 bg-pink-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full animate-bounce border-2 border-white">
        {badge}
      </span>
    )}
  </button>
);

const ReviewMode: React.FC<{ words: Word[]; onReview: (id: string, rem: boolean) => void; onSpeak: (t: string) => void }> = ({ words, onReview, onSpeak }) => {
  // Directly initialize session queue to prevent the flickering "Completed" screen
  const [sessionQueue, setSessionQueue] = useState<string[]>(() => words.map(w => w.id));
  const [flipped, setFlipped] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [sessionCompletedCount, setSessionCompletedCount] = useState(0);

  const currentId = sessionQueue[0];
  const currentWord = words.find(w => w.id === currentId);

  // When words list empty or all finished
  if (!currentWord || sessionQueue.length === 0) {
    return (
      <div className="animate-float">
        <div className="flex flex-col items-center justify-center py-24 space-y-6 text-center animate-in zoom-in-95 duration-700">
          <div className="w-24 h-24 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-sky-500 shadow-[0_0_30px_rgba(14,165,233,0.3)] border-4 border-white relative">
            <div className="absolute inset-0 bg-sky-200/20 rounded-full animate-ping"></div>
            <Check size={48} className="animate-bounce relative z-10" strokeWidth={3} />
          </div>
          <div className="space-y-2">
            <h2 className="text-4xl font-black text-sky-900 drop-shadow-sm">Session Done!</h2>
            <p className="text-sky-600/80 max-w-[200px] mx-auto text-sm font-medium">
              {sessionCompletedCount > 0 
                ? `You reviewed ${sessionCompletedCount} words today. Magical!` 
                : "No words due for review right now."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleAction = (remembered: boolean) => {
    if (remembered) {
      // MASTERED for now: Advance global stage and remove from this session
      onReview(currentWord.id, true);
      setSessionQueue(prev => prev.slice(1));
      setSessionCompletedCount(prev => prev + 1);
    } else {
      // FORGOTTEN: Reset global stage to 1 and loop it back to the end of the current session
      onReview(currentWord.id, false);
      setSessionQueue(prev => {
        const remaining = prev.slice(1);
        return [...remaining, currentId]; 
      });
    }
    setFlipped(false);
    setShowTranslation(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center px-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]"></span>
          <span className="text-[10px] font-black text-sky-600 uppercase tracking-[0.2em]">LEVEL {currentWord.stage} / {REVIEW_INTERVALS.length - 1}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-black text-sky-500 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full tracking-wider border-2 border-white shadow-sm">{sessionQueue.length} LEFT</span>
        </div>
      </div>

      <div onClick={() => setFlipped(!flipped)} className="relative h-[28rem] w-full perspective-1000 cursor-pointer active:scale-[0.99] transition-transform duration-200 animate-float">
        <div className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${flipped ? 'rotate-y-180' : ''}`}>
          <div className="absolute inset-0 bg-white/80 backdrop-blur-md rounded-[3rem] border-4 border-white shadow-[0_8px_30px_rgba(14,165,233,0.15)] flex flex-col items-center justify-center p-12 backface-hidden overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMwZWE1ZTkiIHN0cm9rZS13aWR0aD0iMSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTEgMjB2LTYiLz48cGF0aCBkPSJNMTMgMjB2LTYiLz48cGF0aCBkPSJNMTEgNHY2Ii8+PHBhdGggZD0iTTEzIDR2NiIvPjxwYXRoIGQ9Ik0yMCAxMWgtNiIvPjxwYXRoIGQ9Ik0yMCAxM2gtNiIvPjxwYXRoIGQ9Ik00IDExaDYiLz48cGF0aCBkPSJNNCAxM2g2Ii8+PHBhdGggZD0ibTE2LjI0IDE2LjI0LTQuMjQtNC4yNCIvPjxwYXRoIGQ9Im0xNy42NiAxNC44My00LjI0LTQuMjQiLz48cGF0aCBkPSJtNi4zNCA2LjM0IDQuMjQgNC4yNCIvPjxwYXRoIGQ9Im03Ljc2IDcuNzYgNC4yNCA0LjI0Ii8+PHBhdGggZD0ibTE2LjI0IDcuNzYtNC4yNCA0LjI0Ii8+PHBhdGggZD0ibTE3LjY2IDkuMTctNC4yNCA0LjI0Ii8+PHBhdGggZD0ibTYuMzQgMTcuNjYgNC4yNC00LjI0Ii8+PHBhdGggZD0ibTcuNzYgMTYuMjQgNC4yNC00LjI0Ii8+PC9zdmc+')] bg-[length:40px_40px] bg-repeat"></div>
            <h3 className="text-5xl font-black text-sky-900 text-center leading-tight tracking-tight relative z-10 drop-shadow-sm">{currentWord.original}</h3>
            <p className="mt-12 text-sky-500 text-[11px] font-black uppercase tracking-[0.3em] flex items-center gap-2 relative z-10 bg-white/50 px-4 py-2 rounded-full backdrop-blur-sm border border-white">Tap to flip ✨</p>
          </div>
          <div className="absolute inset-0 bg-white/90 backdrop-blur-md rounded-[3rem] border-4 border-white shadow-[0_8px_30px_rgba(14,165,233,0.15)] flex flex-col items-center justify-start p-8 backface-hidden rotate-y-180 text-center overflow-y-auto">
            <div className="w-full space-y-5">
              <div className="space-y-3">
                <div className="min-h-[32px] flex items-center justify-center">
                  {!showTranslation ? (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowTranslation(true); }}
                      className="px-5 py-2.5 bg-gradient-to-r from-sky-400 to-cyan-400 hover:from-sky-500 hover:to-cyan-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                    >
                      Show Magic Translation
                    </button>
                  ) : (
                    <h3 className="text-3xl font-black text-sky-900 leading-tight drop-shadow-sm">{currentWord.translation}</h3>
                  )}
                </div>
                <p className="text-sky-500/70 font-mono text-sm tracking-wider uppercase font-bold">{currentWord.phonetic}</p>
              </div>
              <div className="h-1 w-16 bg-sky-200 mx-auto rounded-full"></div>
              {currentWord.definitionEn && (
                <div className="text-left bg-white/50 p-4 rounded-2xl border-2 border-white shadow-sm">
                  <p className="text-[10px] font-black text-sky-400 uppercase tracking-[0.2em] mb-2">English Definition</p>
                  <p className="text-sm text-sky-900 leading-snug font-medium italic">{currentWord.definitionEn}</p>
                </div>
              )}
              <div className="text-left bg-gradient-to-br from-sky-50 to-cyan-50 p-4 rounded-2xl border-2 border-white shadow-sm">
                <p className="text-[10px] font-black text-sky-400 uppercase tracking-[0.2em] mb-2">Example</p>
                <p className="text-sky-800 italic text-sm leading-relaxed font-medium">"{currentWord.exampleSentence}"</p>
              </div>
              <div className="flex justify-center pt-2">
                <button onClick={(e) => { e.stopPropagation(); onSpeak(currentWord.original); }} className="p-4 bg-white rounded-full text-sky-500 hover:bg-sky-50 hover:text-sky-600 transition-all shadow-md hover:shadow-lg hover:-translate-y-1 border-2 border-sky-100">
                  <Volume2 size={28} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {flipped && (
        <div className="flex gap-4 animate-in slide-in-from-bottom-8 duration-500 ease-out">
          <button onClick={() => handleAction(false)} className="flex-1 py-6 rounded-[2rem] bg-white border-4 border-pink-100 text-pink-500 font-black uppercase tracking-widest text-[11px] hover:bg-pink-50 hover:border-pink-200 transition-all shadow-sm flex items-center justify-center gap-2 group hover:-translate-y-1">
            <Undo2 size={20} strokeWidth={3} className="group-active:-rotate-45 transition-transform" />
            Forgot (Loop)
          </button>
          <button onClick={() => handleAction(true)} className="flex-1 py-6 rounded-[2rem] bg-gradient-to-r from-sky-400 to-cyan-400 text-white font-black uppercase tracking-widest text-[11px] hover:from-sky-500 hover:to-cyan-500 transition-all shadow-[0_8px_20px_rgba(14,165,233,0.3)] flex items-center justify-center gap-2 group hover:-translate-y-1 border-2 border-white">
            <Check size={20} strokeWidth={3} className="group-active:scale-125 transition-transform" />
            Got it (Master)
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
