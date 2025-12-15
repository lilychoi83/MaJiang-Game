import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, Layout, HelpCircle, ChevronRight, CheckCircle2, Play, Lightbulb, RefreshCw, User, X, ArrowDown, Menu, Sparkles, Trophy, Settings, List, Star, Coins, Volume2, VolumeX, Globe, Info, Bot, Key, ShieldCheck, AlertCircle, Save } from 'lucide-react';
import MahjongTile from './components/MahjongTile';
import { getAiCoachAdvice, testGeminiConnection } from './services/geminiService';
import { LessonId, AiAdvice, Difficulty } from './types';
import confetti from 'canvas-confetti';

// --- Encryption Helpers for Local Storage ---
const SECRET_SALT = "MAHJONG_MASTER_SECURE_KEY_v1";
const encryptApiKey = (text: string) => {
  if (!text) return "";
  try {
      // Simple XOR obfuscation + Base64
      const chars = text.split('');
      const xor = chars.map((c, i) => c.charCodeAt(0) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length));
      return btoa(String.fromCharCode(...xor));
  } catch (e) { return text; }
};

const decryptApiKey = (encrypted: string) => {
  if (!encrypted) return "";
  try {
      const decoded = atob(encrypted);
      const xor = decoded.split('').map((c, i) => c.charCodeAt(0) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length));
      return String.fromCharCode(...xor);
  } catch(e) { return ""; }
};

// --- Hardcoded Lesson Data ---

const LESSONS = [
  { id: LessonId.INTRO, title: '마작이란?', icon: <HelpCircle size={20} /> },
  { id: LessonId.TILES, title: '패의 종류 (도감)', icon: <Layout size={20} /> },
  { id: LessonId.HAND_STRUCTURE, title: '승리 조건 (조립법)', icon: <CheckCircle2 size={20} /> },
  { id: LessonId.ACTIONS, title: '게임 진행 (용어)', icon: <BookOpen size={20} /> },
  { id: LessonId.SCORE, title: '점수 계산 (역)', icon: <Coins size={20} /> },
  { id: LessonId.TIPS, title: '실전 꿀팁', icon: <Star size={20} /> },
  // { id: LessonId.GLOSSARY, title: '한/중 단어장', icon: <List size={20} /> },
  { id: LessonId.GAME, title: '실전 연습 (Game)', icon: <Play size={20} /> },
];

// --- Tile Helpers for TTS ---
const getTileNameKR = (char: string): string => {
  const code = char.codePointAt(0);
  if (!code) return '';
  
  if (code >= 0x1F007 && code <= 0x1F00F) return `${code - 0x1F007 + 1}만`;
  if (code >= 0x1F010 && code <= 0x1F018) return `${code - 0x1F010 + 1}삭`;
  if (code >= 0x1F019 && code <= 0x1F021) return `${code - 0x1F019 + 1}통`;
  
  const honorMap: Record<number, string> = {
    0x1F000: '동', 0x1F001: '남', 0x1F002: '서', 0x1F003: '북',
    0x1F004: '중', 0x1F005: '발', 0x1F006: '백',
  };
  return honorMap[code] || '';
};

const getTileNameZH = (char: string): string => {
  const code = char.codePointAt(0);
  if (!code) return '';
  
  const numMap = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  // Chinese Characters for Native TTS (Using standard counters)
  if (code >= 0x1F007 && code <= 0x1F00F) {
     const val = code - 0x1F007 + 1;
     return `${numMap[val]}万`; // Yi Wan
  }
  if (code >= 0x1F010 && code <= 0x1F018) {
     const val = code - 0x1F010 + 1;
     return `${numMap[val]}条`; // Yi Tiao
  }
  if (code >= 0x1F019 && code <= 0x1F021) {
     const val = code - 0x1F019 + 1;
     return `${numMap[val]}筒`; // Yi Tong
  }
  
  const honorMap: Record<number, string> = {
    0x1F000: '东', // Dong
    0x1F001: '南', // Nan
    0x1F002: '西', // Xi
    0x1F003: '北', // Bei
    0x1F004: '红中', // Hong Zhong
    0x1F005: '发财', // Fa Cai
    0x1F006: '白板', // Bai Ban
  };
  return honorMap[code] || '';
};

// --- Game Logic Helpers ---
const generateWall = () => {
  const tiles: string[] = [];
  // M1-M9
  for(let k=0; k<4; k++) for(let i=0x1F007; i<=0x1F00F; i++) tiles.push(String.fromCodePoint(i));
  // S1-S9
  for(let k=0; k<4; k++) for(let i=0x1F010; i<=0x1F018; i++) tiles.push(String.fromCodePoint(i));
  // P1-P9
  for(let k=0; k<4; k++) for(let i=0x1F019; i<=0x1F021; i++) tiles.push(String.fromCodePoint(i));
  // Honors
  const honors = [0x1F000, 0x1F001, 0x1F002, 0x1F003, 0x1F004, 0x1F005, 0x1F006];
  for(let k=0; k<4; k++) honors.forEach(h => tiles.push(String.fromCodePoint(h)));

  // Shuffle
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
};

// Helper to generate all unique tiles for Tenpai check
const getAllUniqueTiles = () => {
  const tiles: string[] = [];
  for(let i=0x1F007; i<=0x1F00F; i++) tiles.push(String.fromCodePoint(i)); // m
  for(let i=0x1F010; i<=0x1F018; i++) tiles.push(String.fromCodePoint(i)); // s
  for(let i=0x1F019; i<=0x1F021; i++) tiles.push(String.fromCodePoint(i)); // p
  for(let i=0x1F000; i<=0x1F006; i++) tiles.push(String.fromCodePoint(i)); // z
  return tiles;
};
const ALL_UNIQUE_TILES = getAllUniqueTiles();

const sortHand = (hand: string[]) => {
  return [...hand].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
};

const getTileData = (char: string) => {
  const code = char.codePointAt(0);
  if (!code) return { type: 'unknown', value: 0 };
  
  if (code >= 0x1F007 && code <= 0x1F00F) return { type: 'm', value: code - 0x1F007 + 1 };
  if (code >= 0x1F010 && code <= 0x1F018) return { type: 's', value: code - 0x1F010 + 1 };
  if (code >= 0x1F019 && code <= 0x1F021) return { type: 'p', value: code - 0x1F019 + 1 };
  // Honors
  if (code >= 0x1F000 && code <= 0x1F006) return { type: 'z', value: code };
  
  return { type: 'unknown', value: 0 };
};

// --- Win Check Helper ---
const canWin = (tiles: string[]): boolean => {
  // Standard format check: (Tiles - Pair) % 3 === 0
  // Usually 14 tiles = (14-2)/3 = 4 sets.
  if ((tiles.length - 2) % 3 !== 0) return false;

  const sorted = sortHand([...tiles]);
  const counts: Record<string, number> = {};
  for (const t of sorted) counts[t] = (counts[t] || 0) + 1;

  // 1. Seven Pairs (Chiitoitsu) Check
  // Must be 14 tiles, 7 distinct pairs.
  if (tiles.length === 14) {
      const pairs = Object.values(counts).filter(c => c >= 2).length;
      const uniqueCount = Object.keys(counts).length;
      if (pairs === 7 && uniqueCount === 7) return true;
  }

  // 2. Standard 4 Sets + 1 Pair Check
  const setsNeeded = (tiles.length - 2) / 3;
  const uniqueTiles = Object.keys(counts);

  // Try every tile as a potential pair head
  for (const pairTile of uniqueTiles) {
    if (counts[pairTile] >= 2) {
      const remaining = { ...counts };
      remaining[pairTile] -= 2;
      if (remaining[pairTile] === 0) delete remaining[pairTile];
      
      // If we found a valid pair, check if the rest form valid sets
      if (canFormSets(remaining, setsNeeded)) return true;
    }
  }
  return false;
};

// Backtracking algorithm to check for Sets (Triplets or Sequences)
const canFormSets = (counts: Record<string, number>, setsNeeded: number): boolean => {
  if (setsNeeded === 0) return true;

  // Get the first available tile (smallest code point)
  // We sort keys to ensure deterministic greedy/backtracking approach
  const sortedKeys = Object.keys(counts).sort((a,b) => a.codePointAt(0)! - b.codePointAt(0)!);
  const first = sortedKeys.find(k => counts[k] > 0);
  if (!first) return false;

  const d = getTileData(first);

  // Strategy 1: Try to form a Koutsu (Triplet)
  if (counts[first] >= 3) {
    counts[first] -= 3;
    if (canFormSets(counts, setsNeeded - 1)) return true;
    counts[first] += 3; // Backtrack
  }

  // Strategy 2: Try to form a Shuntsu (Sequence)
  // Honors (z) cannot form sequences.
  // Values 8 and 9 cannot start a sequence (8-9-10 impossible).
  if (d.type !== 'z' && d.type !== 'unknown' && d.value && d.value <= 7) {
    const second = String.fromCodePoint(first.codePointAt(0)! + 1);
    const third = String.fromCodePoint(first.codePointAt(0)! + 2);

    if ((counts[second] || 0) > 0 && (counts[third] || 0) > 0) {
      counts[first]--; 
      counts[second]--; 
      counts[third]--;
      if (canFormSets(counts, setsNeeded - 1)) return true;
      // Backtrack
      counts[first]++; 
      counts[second]++; 
      counts[third]++;
    }
  }

  return false;
};


const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentLesson, setCurrentLesson] = useState<LessonId>(LessonId.INTRO);
  const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL');
  
  // API Key State
  const [apiKey, setApiKey] = useState<string>('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'IDLE'|'TESTING'|'SUCCESS'|'FAIL'>('IDLE');

  // Game State
  const [gameStarted, setGameStarted] = useState(false);
  const [wall, setWall] = useState<string[]>([]);
  const [gameResult, setGameResult] = useState<{ type: 'RON'|'TSUMO'|'LOSE', text: string } | null>(null);
  
  const [hands, setHands] = useState<string[][]>([[], [], [], []]);
  const [discards, setDiscards] = useState<string[][]>([[], [], [], []]);
  const [melds, setMelds] = useState<string[][][]>([[], [], [], []]); 
  const [currentTurn, setCurrentTurn] = useState<number>(0); 
  const [drawnTile, setDrawnTile] = useState<string | null>(null);
  const [lastDiscard, setLastDiscard] = useState<{tile: string, fromPlayer: number} | null>(null);
  const [playerScore, setPlayerScore] = useState(25000);

  // Riichi State
  const [isRiichi, setIsRiichi] = useState(false);
  const [riichiDeclarationStep, setRiichiDeclarationStep] = useState(false);
  
  // Action State
  const [pendingInterrupt, setPendingInterrupt] = useState<{tile: string, fromPlayer: number} | null>(null);
  const [availableActions, setAvailableActions] = useState({
    chi: false, pon: false, kan: false, ron: false, tsumo: false, riichi: false
  });
  
  // Coach & Settings State
  const [aiAdvice, setAiAdvice] = useState<AiAdvice | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [coachMessage, setCoachMessage] = useState<string>("안녕하세요! 마작 전문 코치입니다. 제가 옆에서 도와드릴게요.");
  const [isCoachVisible, setIsCoachVisible] = useState(false);
  
  // TTS & SFX State
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceLang, setVoiceLang] = useState<'ko' | 'zh'>('ko');
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [pitch, setPitch] = useState(1);

  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // --- Initialize API Key on Mount ---
  useEffect(() => {
      const stored = localStorage.getItem('mahjong_master_api_key');
      if (stored) {
          const decrypted = decryptApiKey(stored);
          setApiKey(decrypted);
      }
  }, []);

  // --- API Key Handlers ---
  const handleOpenKeyModal = () => {
      setTempApiKey(apiKey);
      setConnectionStatus('IDLE');
      setIsKeyModalOpen(true);
      setIsSidebarOpen(false);
  };

  const handleTestConnection = async () => {
      if (!tempApiKey) return;
      setConnectionStatus('TESTING');
      const result = await testGeminiConnection(tempApiKey);
      setConnectionStatus(result ? 'SUCCESS' : 'FAIL');
  };

  const handleSaveApiKey = () => {
      if (!tempApiKey) {
          localStorage.removeItem('mahjong_master_api_key');
          setApiKey('');
      } else {
          const encrypted = encryptApiKey(tempApiKey);
          localStorage.setItem('mahjong_master_api_key', encrypted);
          setApiKey(tempApiKey);
      }
      setIsKeyModalOpen(false);
  };

  // --- Audio SFX System ---
  const playSfx = (type: 'tile') => {
    if (isMuted) return;

    if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
        ctx.resume();
    }

    const t = ctx.currentTime;

    if (type === 'tile') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(1200, t); // Slightly lower click
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.04);
        gain.gain.setValueAtTime(0.3 * volume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.04);
    }
  };

  // --- Voice Setup ---
  useEffect(() => {
    const updateVoices = () => {
      const all = window.speechSynthesis.getVoices();
      if (all.length > 0) {
        setVoices(all);
        // Prefer Google voices if available for better quality
        const googleKo = all.find(v => v.name.includes('Google') && v.lang.includes('ko'));
        if (googleKo) setSelectedVoice(googleKo);
      }
    };
    
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, []);

  // Robust Voice Filtering
  const getFilteredVoice = () => {
    if (voiceLang === 'ko') {
        // Prioritize Google Korean voice
        const googleKo = voices.find(v => v.name.includes('Google') && v.lang.includes('ko'));
        if (googleKo) return googleKo;
        return voices.find(v => v.lang.includes('ko') || v.lang.includes('KR')) || null;
    } else {
        // Strict Mainland China check + Google preference
        const googleZh = voices.find(v => v.name.includes('Google') && (v.lang === 'zh-CN' || v.lang === 'zh_CN'));
        if (googleZh) return googleZh;
        const cnVoice = voices.find(v => (v.lang === 'zh-CN' || v.lang === 'zh_CN') && !v.lang.includes('HK') && !v.lang.includes('TW'));
        return cnVoice || voices.find(v => v.lang.includes('zh') && !v.lang.includes('HK') && !v.lang.includes('TW')) || null;
    }
  };

  const speak = (text: string, isExcited: boolean = false) => {
    if (isMuted) return;
    
    if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
    }
    window.speechSynthesis.cancel();
    
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voiceLang === 'ko' ? 'ko-KR' : 'zh-CN';
    u.volume = volume;
    
    const preferredVoice = getFilteredVoice();
    if (preferredVoice) {
        u.voice = preferredVoice;
    }
    
    // Lower pitch slightly for "Google" voices to sound less robotic/high-pitched if needed
    // But generally, pitch 1 is best for Google voices.
    // Increase rate slightly for game calls
    u.pitch = isExcited ? 1.1 : 1.0; 
    u.rate = isExcited ? 1.2 : 1.0; 
    
    window.speechSynthesis.speak(u);
  };

  const getSpeakableTileName = (tile: string) => {
    return voiceLang === 'ko' ? getTileNameKR(tile) : getTileNameZH(tile);
  };

  // --- Game Functions ---
  const initGame = () => {
    if (!apiKey) {
        setIsKeyModalOpen(true);
        return;
    }

    if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
    }
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();

    const newWall = generateWall();
    const newHands = [
      sortHand(newWall.splice(0, 13)), // P0 (User)
      newWall.splice(0, 13), // P1
      newWall.splice(0, 13), // P2
      newWall.splice(0, 13), // P3
    ];
    
    setWall(newWall);
    setHands(newHands);
    setDiscards([[], [], [], []]);
    setMelds([[], [], [], []]);
    setGameStarted(true);
    setGameResult(null);
    setCurrentTurn(0);
    setAiAdvice(null);
    setPendingInterrupt(null);
    setLastDiscard(null);
    setAvailableActions({ chi: false, pon: false, kan: false, ron: false, tsumo: false, riichi: false });
    setIsRiichi(false);
    setRiichiDeclarationStep(false);
    setCoachMessage(`게임을 시작합니다! 봇 난이도: ${difficulty === 'EASY' ? '초보' : difficulty === 'NORMAL' ? '중수' : '고수'}`);
    setIsCoachVisible(false);
    
    const firstTile = newWall.pop() || null;
    setDrawnTile(firstTile);
    checkSelfActions(newHands[0], firstTile);
  };

  useEffect(() => {
    if (!gameStarted) return;
    if (currentTurn === 0 && drawnTile) {
       setCoachMessage(isRiichi ? "리치 중... 자동 진행됩니다." : "나의 차례입니다.");
       setAiAdvice(null); 
    }
  }, [currentTurn, drawnTile, gameStarted, isRiichi]);

  // Handle Riichi Auto Discard
  useEffect(() => {
    if (gameStarted && currentTurn === 0 && isRiichi && drawnTile && !availableActions.tsumo) {
        const timer = setTimeout(() => {
            handlePlayerDiscard(0, true);
        }, 1000);
        return () => clearTimeout(timer);
    }
  }, [gameStarted, currentTurn, isRiichi, drawnTile, availableActions.tsumo]);


  const checkInterruptActions = (hand: string[], tile: string, fromPlayer: number) => {
    if (isRiichi) {
        const fullHandForRon = [...hand, tile];
        const canRon = canWin(fullHandForRon);
        setAvailableActions({ chi: false, pon: false, kan: false, ron: canRon, tsumo: false, riichi: false });
        return canRon;
    }

    const td = getTileData(tile);
    const handData = hand.map(t => getTileData(t));
    const sameCount = hand.filter(t => t === tile).length;
    
    const canPon = sameCount >= 2;
    const canKan = sameCount >= 3;
    let canChi = false;
    if (fromPlayer === 3 && td.type !== 'z') { 
      const v = td.value;
      const has = (val: number) => handData.some(h => h.type === td.type && h.value === val);
      if (has(v-2) && has(v-1)) canChi = true;
      if (has(v-1) && has(v+1)) canChi = true;
      if (has(v+1) && has(v+2)) canChi = true;
    }

    const fullHandForRon = [...hand, tile];
    const canRon = canWin(fullHandForRon);

    setAvailableActions({ chi: canChi, pon: canPon, kan: canKan, ron: canRon, tsumo: false, riichi: false });
    return canChi || canPon || canKan || canRon;
  };

  const isTenpai = (hand13: string[]) => {
      for (const t of ALL_UNIQUE_TILES) {
          if (canWin([...hand13, t])) return true;
      }
      return false;
  };

  const checkSelfActions = (hand: string[], tile: string | null) => {
    const fullHand = tile ? [...hand, tile] : hand;
    const isTsumo = canWin(fullHand);
    const counts: Record<string, number> = {};
    fullHand.forEach(t => counts[t] = (counts[t] || 0) + 1);
    const canKan = Object.values(counts).some(c => c === 4);

    let canRiichi = false;
    if (melds[0].length === 0 && playerScore >= 1000 && !isRiichi && tile) {
        const uniqueTiles = Array.from(new Set(fullHand));
        for (const t of uniqueTiles) {
            const tempHand = [...fullHand];
            const idx = tempHand.indexOf(t);
            if (idx > -1) {
                tempHand.splice(idx, 1);
                if (isTenpai(tempHand)) {
                    canRiichi = true;
                    break;
                }
            }
        }
    }

    setAvailableActions({ 
      chi: false, pon: false, kan: canKan, ron: false, tsumo: isTsumo, riichi: canRiichi
    });
  };

  // Bot Logic Loop
  useEffect(() => {
    if (!gameStarted) return;
    if (currentTurn === 0) return; 
    if (pendingInterrupt) return; 

    // Bot speed based on difficulty
    const delay = difficulty === 'EASY' ? 2000 : difficulty === 'NORMAL' ? 1200 : 800;

    botTimerRef.current = setTimeout(() => {
      processBotTurn();
    }, delay);

    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, [currentTurn, gameStarted, pendingInterrupt]);

  const handleBotWin = (type: 'RON' | 'TSUMO', winnerIndex: number) => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    const winCall = voiceLang === 'ko' 
        ? (type === 'RON' ? "론!" : "쯔모!") 
        : (type === 'RON' ? "롱!" : "쯔모!");
    speak(winCall, true);
    const msg = type === 'RON' 
        ? `플레이어 ${winnerIndex}의 론! (패배)` 
        : `플레이어 ${winnerIndex}의 쯔모! (패배)`;
    setGameResult({ type: 'LOSE', text: msg });
    setGameStarted(false);
    setCoachMessage("아쉽네요! 상대방이 화료했습니다.");
  };

  const checkBotActions = (tile: string, fromPlayer: number): boolean => {
    for (let i = 1; i <= 3; i++) {
        if (i === fromPlayer) continue;
        if (canWin([...hands[i], tile])) {
            handleBotWin('RON', i);
            return true;
        }
    }

    // Bot Call Frequency based on Difficulty
    for (let i = 1; i <= 3; i++) {
        if (i === fromPlayer) continue;
        const count = hands[i].filter(t => t === tile).length;
        const callChance = difficulty === 'HARD' ? 0.6 : difficulty === 'NORMAL' ? 0.2 : 0.05;
        
        if (count >= 2 && Math.random() < callChance) {
             performBotMeld(i, 'PON', tile, fromPlayer);
             return true;
        }
    }
    return false;
  };

  const performBotMeld = (botIndex: number, type: 'PON'|'CHI', tile: string, fromPlayer: number) => {
     speak(voiceLang === 'ko' ? "펑!" : "퐁!", true);
     
     const newHands = [...hands];
     const newMelds = [...melds];
     const newDiscards = [...discards];
     
     let removed = 0;
     const botHand = newHands[botIndex].filter(t => {
         if (t === tile && removed < 2) {
             removed++;
             return false;
         }
         return true;
     });
     newHands[botIndex] = botHand;
     
     newMelds[botIndex] = [...newMelds[botIndex], [tile, tile, tile]];
     newDiscards[fromPlayer].pop();
     
     setHands(newHands);
     setMelds(newMelds);
     setDiscards(newDiscards);
     
     setCoachMessage(`플레이어 ${botIndex}가 펑(Pon)을 했습니다!`);
     setCurrentTurn(botIndex);
     
     setTimeout(() => {
         botDiscardAfterCall(botIndex);
     }, 1000);
  };
  
  const botDiscardAfterCall = (botIndex: number) => {
      const botHand = [...hands[botIndex]];
      const discardIndex = Math.floor(Math.random() * botHand.length);
      const tileToDiscard = botHand[discardIndex];
      const newBotHand = botHand.filter((_, i) => i !== discardIndex);
      
      const newHands = [...hands];
      newHands[botIndex] = newBotHand;
      setHands(newHands);
      
      const newDiscards = [...discards];
      newDiscards[botIndex] = [...newDiscards[botIndex], tileToDiscard];
      setDiscards(newDiscards);
      
      setLastDiscard({ tile: tileToDiscard, fromPlayer: botIndex });
      speak(getSpeakableTileName(tileToDiscard));
      playSfx('tile');
      
      const hasAction = checkInterruptActions(hands[0], tileToDiscard, botIndex);
      if (hasAction) {
          setCoachMessage("찬스입니다! 론, 펑, 치, 깡을 할 수 있어요.");
          setPendingInterrupt({ tile: tileToDiscard, fromPlayer: botIndex });
      } else {
          if(!checkBotActions(tileToDiscard, botIndex)) {
              advanceTurn();
          }
      }
  };

  const processBotTurn = () => {
    if (wall.length === 0) {
      alert("패산이 다 떨어졌습니다! 유국입니다.");
      setGameStarted(false);
      return;
    }

    const newWall = [...wall];
    const tile = newWall.pop();
    setWall(newWall);

    if (!tile) return;

    if (canWin([...hands[currentTurn], tile])) {
        handleBotWin('TSUMO', currentTurn);
        return;
    }

    const botHand = [...hands[currentTurn]];
    let tileToDiscard = tile;
    let newBotHand = botHand;
    let discardIndex = -1;
    
    // Bot Strategy based on Difficulty
    if (difficulty !== 'EASY') {
       // Simple Honor Discard Logic for Normal/Hard
       const honors = botHand.map((t, i) => ({t, i, d: getTileData(t)})).filter(x => x.d.type === 'z');
       if (honors.length > 0) discardIndex = honors[0].i;
    }

    if (discardIndex !== -1) {
       tileToDiscard = botHand[discardIndex];
       newBotHand = botHand.filter((_, i) => i !== discardIndex);
       newBotHand.push(tile); 
    } else {
       if (Math.random() > 0.5) {
         tileToDiscard = botHand[0];
         newBotHand = botHand.slice(1);
         newBotHand.push(tile);
       }
    }

    const newHands = [...hands];
    newHands[currentTurn] = newBotHand;
    setHands(newHands);

    const newDiscards = [...discards];
    newDiscards[currentTurn] = [...newDiscards[currentTurn], tileToDiscard];
    setDiscards(newDiscards);

    setLastDiscard({ tile: tileToDiscard, fromPlayer: currentTurn });
    speak(getSpeakableTileName(tileToDiscard)); 
    playSfx('tile'); 

    const hasAction = checkInterruptActions(hands[0], tileToDiscard, currentTurn);
    
    if (hasAction) {
      setCoachMessage("찬스입니다! 론, 펑, 치, 깡을 할 수 있어요.");
      setPendingInterrupt({ tile: tileToDiscard, fromPlayer: currentTurn });
    } else {
      if (!checkBotActions(tileToDiscard, currentTurn)) {
          advanceTurn();
      }
    }
  };

  const handleRiichiClick = () => {
      setRiichiDeclarationStep(true);
      setCoachMessage("리치 선언! 버릴 패를 선택하세요.");
      setAvailableActions({ ...availableActions, riichi: false, kan: false, tsumo: false });
  };

  const handlePlayerDiscard = (index: number, isDrawnTile: boolean) => {
    if (currentTurn !== 0) return; 

    if (riichiDeclarationStep) {
        speak("리치!", true);
        setPlayerScore(prev => prev - 1000);
        setIsRiichi(true);
        setRiichiDeclarationStep(false);
    }

    let tileToDiscard = '';
    let newHand = [...hands[0]];

    if (isDrawnTile && drawnTile) {
      tileToDiscard = drawnTile;
    } else {
      tileToDiscard = newHand[index];
      newHand.splice(index, 1);
      if (drawnTile) newHand.push(drawnTile);
    }

    speak(getSpeakableTileName(tileToDiscard));
    playSfx('tile'); 

    const newHands = [...hands];
    newHands[0] = sortHand(newHand);
    setHands(newHands);

    const newDiscards = [...discards];
    newDiscards[0] = [...newDiscards[0], tileToDiscard];
    setDiscards(newDiscards);

    setLastDiscard({ tile: tileToDiscard, fromPlayer: 0 });
    setDrawnTile(null);
    setAiAdvice(null);
    setCoachMessage("패를 버렸습니다.");
    setAvailableActions({ chi: false, pon: false, kan: false, ron: false, tsumo: false, riichi: false });

    if (!checkBotActions(tileToDiscard, 0)) {
        advanceTurn();
    }
  };

  const advanceTurn = () => {
    const nextTurn = (currentTurn + 1) % 4;
    setCurrentTurn(nextTurn);

    if (nextTurn === 0) {
      if (wall.length === 0) {
        alert("패산이 다 떨어졌습니다! 유국입니다.");
        setGameStarted(false);
        return;
      }
      const newWall = [...wall];
      const tile = newWall.pop() || null;
      setWall(newWall);
      setDrawnTile(tile);
      checkSelfActions(hands[0], tile);
    }
  };

  const getAdvice = async () => {
    if (!drawnTile || currentTurn !== 0) return;

    if (!apiKey) {
        setIsKeyModalOpen(true);
        setCoachMessage("AI 힌트를 사용하려면 먼저 API 키를 등록해주세요.");
        return;
    }

    setIsCoachVisible(true); 
    setAdviceLoading(true);
    setCoachMessage("음... 잠시만요, 패를 살펴볼게요...");
    try {
      const advice = await getAiCoachAdvice(apiKey, hands[0], drawnTile);
      setAiAdvice(advice);
      setCoachMessage("분석을 완료했어요!");
    } catch (e) {
      console.error(e);
      setCoachMessage("분석 중 오류가 발생했습니다. API 키를 확인해주세요.");
      // Optional: Open modal if error is specifically about auth
      if (e instanceof Error && (e.message.includes("403") || e.message.includes("API_KEY"))) {
          setIsKeyModalOpen(true);
      }
    } finally {
      setAdviceLoading(false);
    }
  };

  const handlePon = () => {
    if (!pendingInterrupt) return;
    speak(voiceLang === 'ko' ? "펑!" : "퐁!", true);
    
    const { tile, fromPlayer } = pendingInterrupt;
    const newHand = [...hands[0]];
    let removedCount = 0;
    const remainingHand = newHand.filter(t => {
      if (t === tile && removedCount < 2) { removedCount++; return false; }
      return true;
    });
    const newMelds = [...melds];
    newMelds[0] = [...newMelds[0], [tile, tile, tile]]; 
    setMelds(newMelds);
    const newHands = [...hands];
    newHands[0] = remainingHand;
    setHands(newHands);
    setPendingInterrupt(null);
    setLastDiscard(null); 
    setAvailableActions({ chi: false, pon: false, kan: false, ron: false, tsumo: false, riichi: false });
    setCurrentTurn(0); 
    setDrawnTile(null); 
    const newDiscards = [...discards];
    newDiscards[fromPlayer].pop(); 
    setDiscards(newDiscards);
  };

  const handleChi = () => {
    if (!pendingInterrupt) return;
    speak("치!", true); 
    
    const { tile, fromPlayer } = pendingInterrupt;
    const td = getTileData(tile);
    if (td.type === 'z' || td.type === 'unknown') return;

    const handStr = [...hands[0]];
    const hObjs = handStr.map(t => ({ t, ...getTileData(t) }));
    const findVal = (val: number) => hObjs.find(o => o.type === td.type && o.value === val);

    let p1 = findVal(td.value - 1);
    let p2 = findVal(td.value + 1);
    
    if (!p1 || !p2) { p1 = findVal(td.value - 2); p2 = findVal(td.value - 1); }
    if (!p1 || !p2) { p1 = findVal(td.value + 1); p2 = findVal(td.value + 2); }

    if (p1 && p2) {
       const meldTiles = [tile, p1.t, p2.t].sort((a,b) => a.codePointAt(0)! - b.codePointAt(0)!);
       const newHand = [...hands[0]];
       const i1 = newHand.indexOf(p1.t);
       if (i1 > -1) newHand.splice(i1, 1);
       const i2 = newHand.indexOf(p2.t);
       if (i2 > -1) newHand.splice(i2, 1);
       
       const nextHands = [...hands];
       nextHands[0] = newHand;
       setHands(nextHands);
       
       const nextMelds = [...melds];
       nextMelds[0] = [...nextMelds[0], meldTiles];
       setMelds(nextMelds);
       
       const nextDiscards = [...discards];
       nextDiscards[fromPlayer].pop();
       setDiscards(nextDiscards);

       setPendingInterrupt(null);
       setLastDiscard(null);
       setCurrentTurn(0);
       setDrawnTile(null);
       setCoachMessage("치(Chi) 성공! 패를 하나 버려주세요.");
    } else {
       alert("치 할 수 있는 패가 없습니다.");
    }
  };

  const handleKan = () => {
     speak(voiceLang === 'ko' ? "깡!" : "강!", true);
     
     let targetTile = '';
     let isClosed = false;

     if (pendingInterrupt) {
       targetTile = pendingInterrupt.tile;
     } else if (drawnTile) {
       const full = [...hands[0], drawnTile];
       const counts: Record<string,number> = {};
       full.forEach(t=>counts[t]=(counts[t]||0)+1);
       targetTile = Object.keys(counts).find(k=>counts[k]===4) || '';
       isClosed = true;
     }

     if (!targetTile) return;

     // Execute Kan
     const newHands = [...hands];
     const newMelds = [...melds];
     const newDiscards = [...discards];

     if (pendingInterrupt) {
        // Open Kan
        const { fromPlayer } = pendingInterrupt;
        // Remove 3 from hand
        let removed = 0;
        newHands[0] = newHands[0].filter(t => {
            if (t === targetTile && removed < 3) { removed++; return false; }
            return true;
        });
        // Add meld
        newMelds[0].push([targetTile, targetTile, targetTile, targetTile]);
        // Remove discard
        newDiscards[fromPlayer].pop();
        setDiscards(newDiscards);
        
        setPendingInterrupt(null);
        setCurrentTurn(0);
     } else {
        // Closed Kan
        if (drawnTile === targetTile) setDrawnTile(null);
        newHands[0] = newHands[0].filter(t => t !== targetTile);
        newMelds[0].push([targetTile, targetTile, targetTile, targetTile]);
     }
     
     setHands(newHands);
     setMelds(newMelds);
     setAvailableActions({ ...availableActions, kan: false, riichi: false }); 

     // Draw Replacement Tile (Rinshan)
     if (wall.length > 0) {
         const newWall = [...wall];
         const replacement = newWall.pop() || null;
         setWall(newWall);
         setDrawnTile(replacement);
         setCoachMessage("깡! 영상패를 가져왔습니다.");
         // Check if can win or kan again with replacement
         checkSelfActions(newHands[0], replacement);
     } else {
         setGameStarted(false);
         setCoachMessage("패산이 부족하여 유국입니다.");
     }
  };

  const handleWin = () => {
    const isRon = availableActions.ron;
    const type = isRon ? 'RON' : 'TSUMO';
    
    // SFX
    speak(voiceLang === 'ko' ? (isRon ? "론!" : "쯔모!") : (isRon ? "롱!" : "쯔모!"), true);
    confetti({ particleCount: 200, spread: 70, origin: { y: 0.6 } });

    setGameResult({ 
        type, 
        text: isRon ? "RON! 승리했습니다!" : "TSUMO! 승리했습니다!" 
    });
    setGameStarted(false);
    setPlayerScore(s => s + (isRon ? 3000 : 4000));
  };

  const handleSkip = () => {
    setPendingInterrupt(null);
    setAvailableActions({ chi: false, pon: false, kan: false, ron: false, tsumo: false, riichi: false });
    setCoachMessage("패스했습니다.");
    advanceTurn();
  };

  // --- Render Helpers ---
  const renderTile = (tile: string, index: number, isHand = false, onClick?: () => void, highlight = false) => (
    <MahjongTile 
      key={`${tile}-${index}`} 
      tile={tile} 
      size={isHand ? "lg" : "md"}
      highlight={highlight}
      onClick={onClick}
      className={isHand ? "mx-0.5 hover:-translate-y-4 transition-transform duration-200" : "mx-0.5"}
    />
  );
  
  const renderHiddenHand = (count: number) => (
     <div className="flex justify-center bg-emerald-900/40 p-1.5 rounded-lg shadow-inner border border-emerald-800/50">
         {Array(count).fill(0).map((_, i) => (
             <MahjongTile key={i} tile="?" isHidden size="sm" className="-ml-2 first:ml-0" />
         ))}
     </div>
  );

  return (
    <div className="flex h-screen bg-stone-100 text-slate-800 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static border-r border-slate-200`}>
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
          <h1 className="text-xl font-bold text-emerald-600 flex items-center gap-2">
            <Sparkles size={20} className="text-emerald-500"/>
            마작 마스터
          </h1>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400"><X size={20} /></button>
        </div>
        
        <nav className="p-2 space-y-1 overflow-y-auto h-[calc(100vh-64px)]">
            {LESSONS.map(lesson => (
              <button
                key={lesson.id}
                onClick={() => { setCurrentLesson(lesson.id); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${currentLesson === lesson.id ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {lesson.icon}
                <span className="font-medium text-sm">{lesson.title}</span>
              </button>
            ))}
            
            <div className="mt-6 pt-6 border-t border-slate-100">
                <div className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Game Settings</div>
                <div className="px-3 space-y-4">
                    <button 
                        onClick={handleOpenKeyModal}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-lg transition-colors border border-slate-200 group"
                    >
                        <Key size={16} className="text-slate-400 group-hover:text-blue-500"/>
                        <span className="text-sm font-medium">API Key 관리</span>
                        {apiKey ? <ShieldCheck size={14} className="ml-auto text-emerald-500" /> : <AlertCircle size={14} className="ml-auto text-red-400" />}
                    </button>
                    <div>
                        <label className="text-xs text-slate-500 block mb-1 flex items-center gap-1"><Bot size={12}/> 봇 수준 (난이도)</label>
                        <select 
                            value={difficulty} 
                            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                            className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded px-2 py-1.5 focus:ring-2 focus:ring-emerald-400 outline-none"
                        >
                            <option value="EASY">초급 (천천히)</option>
                            <option value="NORMAL">중급 (보통)</option>
                            <option value="HARD">고급 (빠름)</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">음성 언어</label>
                        <div className="flex bg-slate-50 rounded p-1 border border-slate-200">
                           <button onClick={() => setVoiceLang('ko')} className={`flex-1 text-xs py-1 rounded ${voiceLang === 'ko' ? 'bg-white shadow text-emerald-600 font-bold' : 'text-slate-400'}`}>한국어</button>
                           <button onClick={() => setVoiceLang('zh')} className={`flex-1 text-xs py-1 rounded ${voiceLang === 'zh' ? 'bg-white shadow text-emerald-600 font-bold' : 'text-slate-400'}`}>중국어</button>
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                         <span className="text-xs text-slate-500">소리 끄기</span>
                         <button onClick={() => setIsMuted(!isMuted)} className="text-slate-400 hover:text-emerald-500 transition-colors">
                            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                         </button>
                    </div>
                </div>
            </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Header (Mobile) */}
        <header className="bg-white p-4 flex items-center justify-between md:hidden shadow-sm z-40 border-b border-slate-200">
           <button onClick={() => setIsSidebarOpen(true)} className="text-slate-600"><Menu size={24} /></button>
           <span className="font-bold text-slate-800">{LESSONS.find(l => l.id === currentLesson)?.title}</span>
           <div className="w-6"></div>
        </header>

        {/* Lesson Content Area */}
        <main className="flex-1 overflow-y-auto bg-stone-50 p-4 md:p-6 relative">
           {currentLesson !== LessonId.GAME && (
               <div className="max-w-4xl mx-auto bg-white rounded-xl p-6 md:p-10 shadow-xl border border-slate-100">
                   <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
                       <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">{LESSONS.find(l => l.id === currentLesson)?.icon}</div>
                       <h2 className="text-2xl font-bold text-slate-800">{LESSONS.find(l => l.id === currentLesson)?.title}</h2>
                   </div>
                   
                   <div className="prose prose-slate prose-lg max-w-none">
                       {currentLesson === LessonId.INTRO && (
                           <div className="space-y-4 text-slate-600">
                               <p>마작(Mahjong)은 4명이 패를 모아 완성된 형태(화료)를 만드는 게임입니다.</p>
                               <p>기본적으로 14개의 패를 <strong>[몸통 4개 + 머리 1개]</strong>로 맞추면 승리합니다.</p>
                               <div className="bg-yellow-50 p-5 rounded-lg my-4 border-l-4 border-yellow-400">
                                   <h3 className="text-lg font-bold mb-2 flex items-center gap-2 text-yellow-600"><Trophy size={18}/> 목표</h3>
                                   <p className="text-slate-700">가장 빨리, 그리고 높은 점수로 손패를 완성하세요!</p>
                               </div>
                               <button onClick={() => setCurrentLesson(LessonId.TILES)} className="mt-4 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-bold transition-all flex items-center gap-2">
                                   다음: 패 배우기 <ChevronRight size={16} />
                               </button>
                           </div>
                       )}
                       {currentLesson === LessonId.TILES && (
                           <div className="space-y-6 text-slate-600">
                               <p>마작패는 크게 <strong>수패</strong>(숫자)와 <strong>자패</strong>(글자)로 나뉩니다.</p>
                               <div className="space-y-4">
                                   <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                       <h4 className="font-bold text-emerald-600 mb-2">삭수패 (Bamboo) - 대나무</h4>
                                       <div className="flex flex-wrap gap-1">{ALL_UNIQUE_TILES.slice(9, 18).map(t => <MahjongTile key={t} tile={t} size="sm" />)}</div>
                                   </div>
                                   <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                       <h4 className="font-bold text-blue-600 mb-2">통수패 (Dots) - 통</h4>
                                       <div className="flex flex-wrap gap-1">{ALL_UNIQUE_TILES.slice(18, 27).map(t => <MahjongTile key={t} tile={t} size="sm" />)}</div>
                                   </div>
                                   <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                       <h4 className="font-bold text-red-600 mb-2">만수패 (Characters) - 萬</h4>
                                       <div className="flex flex-wrap gap-1">{ALL_UNIQUE_TILES.slice(0, 9).map(t => <MahjongTile key={t} tile={t} size="sm" />)}</div>
                                   </div>
                                   <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                       <h4 className="font-bold text-slate-600 mb-2">자패 (Honors) - 바람 & 용</h4>
                                       <div className="flex flex-wrap gap-1">{ALL_UNIQUE_TILES.slice(27).map(t => <MahjongTile key={t} tile={t} size="sm" />)}</div>
                                   </div>
                               </div>
                               <button onClick={() => setCurrentLesson(LessonId.HAND_STRUCTURE)} className="mt-4 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-bold transition-all flex items-center gap-2">
                                   다음: 조립법 <ChevronRight size={16} />
                               </button>
                           </div>
                       )}
                       {currentLesson === LessonId.HAND_STRUCTURE && (
                           <div className="space-y-6 text-slate-600">
                               <p>마작의 기본 완성 형태는 <strong>3개의 묶음(Set) 4개</strong>와 <strong>머리(Pair) 1개</strong>입니다.</p>
                               
                               <div className="grid gap-4 md:grid-cols-2">
                                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                      <h4 className="font-bold text-blue-600 mb-2">1. 슌쯔 (Sequence)</h4>
                                      <p className="text-sm mb-2 text-slate-500">연속된 숫자 3개</p>
                                      <div className="flex gap-1 justify-center bg-slate-50 p-2 rounded">
                                          <MahjongTile tile={String.fromCodePoint(0x1F019)} size="sm" />
                                          <MahjongTile tile={String.fromCodePoint(0x1F01A)} size="sm" />
                                          <MahjongTile tile={String.fromCodePoint(0x1F01B)} size="sm" />
                                      </div>
                                  </div>
                                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                      <h4 className="font-bold text-blue-600 mb-2">2. 커쯔 (Triplet)</h4>
                                      <p className="text-sm mb-2 text-slate-500">똑같은 패 3개</p>
                                      <div className="flex gap-1 justify-center bg-slate-50 p-2 rounded">
                                          <MahjongTile tile={String.fromCodePoint(0x1F000)} size="sm" />
                                          <MahjongTile tile={String.fromCodePoint(0x1F000)} size="sm" />
                                          <MahjongTile tile={String.fromCodePoint(0x1F000)} size="sm" />
                                      </div>
                                  </div>
                                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                      <h4 className="font-bold text-yellow-600 mb-2">3. 짠터우 (Pair)</h4>
                                      <p className="text-sm mb-2 text-slate-500">똑같은 패 2개 (머리)</p>
                                      <div className="flex gap-1 justify-center bg-slate-50 p-2 rounded">
                                          <MahjongTile tile={String.fromCodePoint(0x1F004)} size="sm" />
                                          <MahjongTile tile={String.fromCodePoint(0x1F004)} size="sm" />
                                      </div>
                                  </div>
                               </div>

                               <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                   <h4 className="font-bold text-center mb-2 text-blue-800">완성형 예시 (14장)</h4>
                                   <div className="flex flex-wrap gap-2 justify-center">
                                       <div className="flex gap-0.5"><MahjongTile tile={String.fromCodePoint(0x1F007)} size="xs"/><MahjongTile tile={String.fromCodePoint(0x1F008)} size="xs"/><MahjongTile tile={String.fromCodePoint(0x1F009)} size="xs"/></div>
                                       <div className="flex gap-0.5"><MahjongTile tile={String.fromCodePoint(0x1F01C)} size="xs"/><MahjongTile tile={String.fromCodePoint(0x1F01D)} size="xs"/><MahjongTile tile={String.fromCodePoint(0x1F01E)} size="xs"/></div>
                                       <div className="flex gap-0.5"><MahjongTile tile={String.fromCodePoint(0x1F016)} size="xs"/><MahjongTile tile={String.fromCodePoint(0x1F017)} size="xs"/><MahjongTile tile={String.fromCodePoint(0x1F018)} size="xs"/></div>
                                       <div className="flex gap-0.5"><MahjongTile tile={String.fromCodePoint(0x1F005)} size="xs"/><MahjongTile tile={String.fromCodePoint(0x1F005)} size="xs"/><MahjongTile tile={String.fromCodePoint(0x1F005)} size="xs"/></div>
                                       <div className="flex gap-0.5 border-l border-slate-300 pl-2"><MahjongTile tile={String.fromCodePoint(0x1F004)} size="xs"/><MahjongTile tile={String.fromCodePoint(0x1F004)} size="xs"/></div>
                                   </div>
                                   <p className="text-center text-xs text-blue-600 mt-2">몸통 4개 + 머리 1개</p>
                               </div>

                               <button onClick={() => setCurrentLesson(LessonId.ACTIONS)} className="mt-4 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-bold transition-all flex items-center gap-2">
                                   다음: 게임 진행 <ChevronRight size={16} />
                               </button>
                           </div>
                       )}
                       {currentLesson === LessonId.ACTIONS && (
                           <div className="space-y-6 text-slate-600">
                               <p>자신의 차례가 아닐 때도 패를 가져올 수 있습니다 (울기/후로).</p>
                               <div className="space-y-4">
                                   <div className="flex gap-4 items-start bg-slate-50 p-3 rounded-lg border border-slate-200">
                                       <div className="bg-blue-500 text-white px-3 py-1 rounded font-bold text-sm shrink-0">펑 (Pon)</div>
                                       <div>
                                           <p className="font-bold text-slate-800">똑같은 패가 2개 있을 때</p>
                                           <p className="text-sm text-slate-500">다른 사람이 버린 패를 가져와 커쯔(3개)를 만듭니다.</p>
                                       </div>
                                   </div>
                                   <div className="flex gap-4 items-start bg-slate-50 p-3 rounded-lg border border-slate-200">
                                       <div className="bg-emerald-500 text-white px-3 py-1 rounded font-bold text-sm shrink-0">치 (Chi)</div>
                                       <div>
                                           <p className="font-bold text-slate-800">연속된 숫자를 만들 수 있을 때</p>
                                           <p className="text-sm text-slate-500"><strong>왼쪽 사람(상가)</strong>이 버린 패로만 슌쯔를 만듭니다.</p>
                                       </div>
                                   </div>
                                   <div className="flex gap-4 items-start bg-slate-50 p-3 rounded-lg border border-slate-200">
                                       <div className="bg-indigo-500 text-white px-3 py-1 rounded font-bold text-sm shrink-0">깡 (Kan)</div>
                                       <div>
                                           <p className="font-bold text-slate-800">똑같은 패 4개를 모았을 때</p>
                                           <p className="text-sm text-slate-500">4개를 하나로 칩니다. 보너스 패를 하나 더 가져옵니다.</p>
                                       </div>
                                   </div>
                               </div>
                               <button onClick={() => setCurrentLesson(LessonId.SCORE)} className="mt-4 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-bold transition-all flex items-center gap-2">
                                   다음: 점수 계산 <ChevronRight size={16} />
                               </button>
                           </div>
                       )}
                       {currentLesson === LessonId.SCORE && (
                           <div className="space-y-6 text-slate-600">
                               <p>마작에는 '족보(Yaku)'가 있어야 날 수 있습니다. 모양만 맞춘다고 승리하지 않습니다!</p>
                               <div className="space-y-4">
                                   <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                                       <h4 className="font-bold text-red-500">리치 (Riichi) - 1판</h4>
                                       <p className="text-sm">문전(울지 않음) 상태에서 텐파이(1개 남음)시 1000점을 걸고 선언.</p>
                                   </div>
                                   <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                                       <h4 className="font-bold text-emerald-500">탕야오 (All Simples) - 1판</h4>
                                       <p className="text-sm">1, 9, 자패가 없이 <strong>숫자 2~8</strong>로만 구성.</p>
                                   </div>
                                   <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                                       <h4 className="font-bold text-blue-500">역패 (Dragons/Winds) - 1판</h4>
                                       <p className="text-sm">백/발/중 혹은 자장풍/장풍패를 3개(커쯔) 모으면 1판.</p>
                                   </div>
                                   <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                                       <h4 className="font-bold text-yellow-500">또이또이 (All Pon) - 2판</h4>
                                       <p className="text-sm">슌쯔(연속) 없이 커쯔(똑같은거 3개) 4개와 머리로 구성.</p>
                                   </div>
                               </div>
                               <div className="flex items-center gap-2 bg-red-50 p-3 rounded text-sm text-red-600 mt-2 border border-red-100">
                                   <Info size={16}/> 주의: 멘젠(울지 않음) 한정 역과 울어도 되는 역이 다릅니다.
                               </div>
                               <button onClick={() => setCurrentLesson(LessonId.TIPS)} className="mt-4 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-bold transition-all flex items-center gap-2">
                                   다음: 꿀팁 <ChevronRight size={16} />
                               </button>
                           </div>
                       )}
                       {currentLesson === LessonId.TIPS && (
                           <div className="space-y-6 text-slate-600">
                               <ul className="space-y-3 list-disc list-inside text-lg">
                                   <li><strong>자패부터 버려라:</strong> 동,남,서,북,백,발,중 등 고립된 자패는 초반에 버리는 것이 유리합니다.</li>
                                   <li><strong>1, 9패 정리:</strong> 1과 9는 양쪽으로 뻗어나가기 힘들어(변짱), 중간 숫자(3~7)보다 가치가 낮습니다.</li>
                                   <li><strong>양면 대기:</strong> 2,3을 들고 있으면 1이나 4가 들어오면 됩니다. 이런 '양면' 형태를 많이 만드세요.</li>
                                   <li><strong>수비도 중요하다:</strong> 리치를 건 사람의 현물(버린 패)을 따라 버리면 안전합니다.</li>
                               </ul>
                               <button onClick={() => setCurrentLesson(LessonId.GAME)} className="mt-8 px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-bold text-lg shadow-lg hover:shadow-emerald-500/20 transition-all flex items-center gap-2 mx-auto">
                                   <Play size={24} /> 이제 게임하러 가기!
                               </button>
                           </div>
                       )}

                       {(currentLesson !== LessonId.INTRO && currentLesson !== LessonId.TILES && currentLesson !== LessonId.HAND_STRUCTURE && currentLesson !== LessonId.ACTIONS && currentLesson !== LessonId.SCORE && currentLesson !== LessonId.TIPS) && (
                           <div className="text-center py-10">
                               <p className="text-slate-400 mb-6">이 강의 내용은 준비 중입니다. 실전 연습을 해보세요!</p>
                               <button onClick={() => setCurrentLesson(LessonId.GAME)} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-bold text-lg shadow-lg hover:shadow-emerald-500/20 transition-all flex items-center gap-2 mx-auto">
                                   <Play size={24} /> 게임 시작하기
                               </button>
                           </div>
                       )}
                   </div>
               </div>
           )}

           {/* --- GAME VIEW --- */}
           {currentLesson === LessonId.GAME && (
               <div className="h-full flex flex-col justify-between w-full max-w-[1600px] mx-auto bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-900 rounded-xl shadow-2xl overflow-hidden border-8 border-yellow-900/30">
                   
                   {!gameStarted ? (
                       <div className="flex flex-col items-center justify-center h-full space-y-8 animate-in fade-in zoom-in duration-500 text-white">
                           <div className="text-center space-y-2">
                               <h2 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 to-yellow-500 drop-shadow-sm">RIICHI MASTER</h2>
                               <p className="text-emerald-200 text-xl font-medium">AI 코치와 함께하는 실전 마작 트레이닝</p>
                           </div>
                           
                           {gameResult && (
                               <div className="bg-black/40 backdrop-blur-md p-8 rounded-2xl border border-white/10 text-center shadow-2xl mb-4 max-w-md">
                                   <div className={`text-3xl font-bold mb-3 ${gameResult.type === 'LOSE' ? 'text-red-400' : 'text-yellow-400'}`}>
                                       {gameResult.type === 'LOSE' ? '패배...' : '승리!'}
                                   </div>
                                   <p className="text-white text-lg">{gameResult.text}</p>
                               </div>
                           )}

                           <div className="grid gap-4 w-full max-w-sm">
                               <button 
                                   onClick={initGame}
                                   className="group relative w-full py-5 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-white rounded-xl font-bold text-2xl shadow-xl shadow-black/20 transition-all active:scale-95"
                               >
                                   <span className="flex items-center justify-center gap-2 drop-shadow-md">
                                       <Play className="fill-current" /> GAME START
                                   </span>
                               </button>
                           </div>
                           
                           <div className="flex items-center gap-3 text-sm text-emerald-200 bg-black/20 px-6 py-2 rounded-full border border-white/10">
                               <Bot size={16}/> 
                               현재 봇 난이도: <span className="text-yellow-300 font-bold text-base">{difficulty === 'EASY' ? '초급' : difficulty === 'NORMAL' ? '중급' : '고급'}</span>
                           </div>

                           {!apiKey && (
                               <div className="absolute bottom-10 animate-bounce">
                                   <button 
                                     onClick={handleOpenKeyModal}
                                     className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2"
                                   >
                                       <Key size={18}/> API 키 설정 필요
                                   </button>
                               </div>
                           )}
                       </div>
                   ) : (
                       <>
                           {/* Opponent Area (Top - Player 2) */}
                           <div className="w-full flex justify-center py-4 relative bg-gradient-to-b from-black/20 to-transparent">
                               <div className="flex flex-col items-center gap-2">
                                   <div className="flex gap-0.5 bg-black/30 p-2 rounded-lg shadow-lg border border-white/5">
                                       {renderHiddenHand(hands[2].length)}
                                   </div>
                                   <div className="flex gap-0.5 flex-wrap justify-center max-w-sm h-16 overflow-hidden">
                                       {discards[2].map((t, i) => <MahjongTile key={i} tile={t} size="sm" />)}
                                   </div>
                               </div>
                           </div>

                           {/* Middle Area (Left/Right Opponents & Table Center) */}
                           <div className="flex-1 w-full flex justify-between items-center px-4 md:px-16">
                               
                               {/* Left - Player 3 */}
                               <div className="flex flex-row items-center gap-4 -ml-8 scale-90 md:scale-100 origin-left">
                                   <div className="flex flex-col gap-0.5 bg-black/30 p-2 rounded-lg shadow-lg border border-white/5">
                                       <div className="w-10 h-36 bg-emerald-900/50 rounded flex items-center justify-center text-xs text-emerald-200 font-mono writing-vertical opacity-70">
                                           PLAYER 3 <br/> {hands[3].length}
                                       </div>
                                   </div>
                                   <div className="grid grid-cols-3 gap-0.5 w-32">
                                       {discards[3].map((t, i) => <MahjongTile key={i} tile={t} size="sm" />)}
                                   </div>
                               </div>

                               {/* Center Info / Coach */}
                               <div className="flex flex-col items-center gap-6 z-10">
                                   {/* Score Board */}
                                   <div className="bg-black/60 border border-white/10 rounded-lg px-8 py-3 flex items-center gap-8 shadow-2xl backdrop-blur-md">
                                       <div className="text-center">
                                           <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-bold">REMAINING</div>
                                           <div className="text-2xl font-black font-mono text-white">{wall.length}</div>
                                       </div>
                                       <div className="w-px h-10 bg-white/20"></div>
                                       <div className="text-center">
                                           <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-bold">SCORE</div>
                                           <div className="text-2xl font-black font-mono text-yellow-400">{playerScore}</div>
                                       </div>
                                       {isRiichi && (
                                           <>
                                              <div className="w-px h-10 bg-white/20"></div>
                                              <div className="text-red-500 font-black text-xl animate-pulse bg-white/90 px-2 rounded">RIICHI</div>
                                           </>
                                       )}
                                   </div>
                                   
                                   {/* Coach Bubble */}
                                   <div className={`transition-all duration-500 transform ${coachMessage ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                                       <div className="bg-white text-slate-800 px-6 py-4 rounded-3xl rounded-bl-none shadow-2xl max-w-md flex items-start gap-4 relative border-2 border-blue-500/30">
                                            <div className="bg-blue-600 text-white p-2.5 rounded-full shrink-0 shadow-lg">
                                                <Lightbulb size={24} />
                                            </div>
                                            <div>
                                                <p className="text-base font-semibold leading-relaxed text-slate-700">{coachMessage}</p>
                                                {aiAdvice && (
                                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">AI 추천</span>
                                                            <span className="font-bold text-slate-900 text-lg">{aiAdvice.suggestion}</span>
                                                        </div>
                                                        <p className="text-sm text-slate-500 leading-snug">{aiAdvice.reason}</p>
                                                    </div>
                                                )}
                                            </div>
                                       </div>
                                   </div>
                               </div>

                               {/* Right - Player 1 */}
                               <div className="flex flex-row-reverse items-center gap-4 -mr-8 scale-90 md:scale-100 origin-right">
                                   <div className="flex flex-col gap-0.5 bg-black/30 p-2 rounded-lg shadow-lg border border-white/5">
                                       <div className="w-10 h-36 bg-emerald-900/50 rounded flex items-center justify-center text-xs text-emerald-200 font-mono writing-vertical opacity-70">
                                           PLAYER 1 <br/> {hands[1].length}
                                       </div>
                                   </div>
                                   <div className="grid grid-cols-3 gap-0.5 w-32">
                                       {discards[1].map((t, i) => <MahjongTile key={i} tile={t} size="sm" />)}
                                   </div>
                               </div>

                           </div>

                           {/* Bottom Area (Player Hand & Actions) */}
                           <div className="w-full pb-6 px-4 flex flex-col items-center gap-6 bg-gradient-to-t from-black/60 via-black/30 to-transparent pt-12">
                               
                               {/* Discards (Player) */}
                               <div className="flex gap-1 flex-wrap justify-center min-h-[60px] w-full max-w-2xl mb-2">
                                   {discards[0].map((t, i) => <MahjongTile key={i} tile={t} size="sm" />)}
                               </div>

                               {/* Action Buttons */}
                               <div className="flex gap-3 min-h-[56px] items-end">
                                   {(availableActions.chi || availableActions.pon || availableActions.kan || availableActions.ron || availableActions.tsumo || availableActions.riichi || pendingInterrupt) && (
                                       <div className="flex gap-3 animate-in slide-in-from-bottom duration-300 pb-2">
                                           {pendingInterrupt && (
                                               <button onClick={handleSkip} className="px-6 py-2.5 bg-slate-500 hover:bg-slate-400 text-white rounded-lg font-bold shadow-lg text-base border-b-4 border-slate-700 active:border-b-0 active:translate-y-1 transition-all">
                                                   SKIP
                                               </button>
                                           )}
                                           {availableActions.chi && (
                                               <button onClick={handleChi} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-lg shadow-emerald-900/40 border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1 transition-all">
                                                   CHI
                                               </button>
                                           )}
                                           {availableActions.pon && (
                                               <button onClick={handlePon} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg shadow-blue-900/40 border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all">
                                                   PON
                                               </button>
                                           )}
                                           {availableActions.kan && (
                                               <button onClick={handleKan} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-900/40 border-b-4 border-indigo-800 active:border-b-0 active:translate-y-1 transition-all">
                                                   KAN
                                               </button>
                                           )}
                                           {availableActions.riichi && (
                                               <button onClick={handleRiichiClick} className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold shadow-lg shadow-red-900/40 border-b-4 border-red-800 active:border-b-0 active:translate-y-1 transition-all ring-2 ring-red-400 ring-offset-2 ring-offset-transparent">
                                                   RIICHI
                                               </button>
                                           )}
                                           {(availableActions.ron || availableActions.tsumo) && (
                                               <button onClick={handleWin} className="px-10 py-3 bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-400 hover:to-orange-500 text-white rounded-xl font-black text-2xl shadow-xl shadow-orange-900/50 border-b-4 border-orange-800 active:border-b-0 active:translate-y-1 transition-all animate-pulse">
                                                   WIN!
                                               </button>
                                           )}
                                       </div>
                                   )}
                               </div>

                               {/* Player Hand */}
                               <div className="flex items-end justify-center gap-0.5 md:gap-1 select-none pb-4 overflow-x-visible w-full px-4">
                                   <div className="flex items-end">
                                      {/* Melds */}
                                      {melds[0].map((meld, mIdx) => (
                                          <div key={`m-${mIdx}`} className="flex items-end mr-4 opacity-90 scale-95 origin-bottom bg-black/20 p-1 rounded">
                                              {meld.map((t, tIdx) => (
                                                  <MahjongTile key={`mt-${mIdx}-${tIdx}`} tile={t} size="md" className="mx-px brightness-90" />
                                              ))}
                                          </div>
                                      ))}
                                   </div>

                                   <div className="flex items-end gap-0.5 md:gap-1">
                                      {hands[0].map((tile, index) => renderTile(tile, index, true, () => handlePlayerDiscard(index, false), aiAdvice?.suggestion.includes(getTileNameKR(tile))))}
                                   </div>
                                   
                                   {drawnTile && (
                                       <div className="ml-6 pl-6 border-l-2 border-white/20 flex items-end">
                                            {renderTile(drawnTile, 99, true, () => handlePlayerDiscard(0, true), aiAdvice?.suggestion.includes(getTileNameKR(drawnTile)))}
                                       </div>
                                   )}
                               </div>

                               {/* Coach Button */}
                               {currentTurn === 0 && drawnTile && !isRiichi && !isCoachVisible && !adviceLoading && (
                                    <button 
                                        onClick={getAdvice}
                                        className="absolute bottom-40 right-10 bg-white text-blue-600 p-4 rounded-full shadow-xl hover:bg-blue-50 hover:scale-110 transition-all flex items-center gap-2 font-bold text-base z-20 border-4 border-blue-100"
                                        title="AI 힌트 받기"
                                    >
                                        <Sparkles size={24} />
                                    </button>
                               )}
                           </div>
                       </>
                   )}
               </div>
           )}
        </main>
      </div>

      {/* API Key Modal */}
      {isKeyModalOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-300">
                  <div className="p-6">
                      <div className="flex justify-between items-center mb-6">
                          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                              <Key className="text-blue-600"/> API Key 관리
                          </h2>
                          <button onClick={() => setIsKeyModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                      </div>
                      
                      <div className="bg-blue-50 p-4 rounded-lg mb-6 text-sm text-blue-800 border border-blue-100">
                          <p className="font-bold flex items-center gap-2 mb-1"><ShieldCheck size={16}/> 안전하게 저장됩니다</p>
                          <p className="opacity-90">API 키는 브라우저 내부(Local Storage)에 암호화되어 저장되며, 서버로 전송되지 않습니다.</p>
                      </div>

                      <div className="space-y-4">
                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Google Gemini API Key</label>
                              <input 
                                  type="password" 
                                  value={tempApiKey}
                                  onChange={(e) => {
                                      setTempApiKey(e.target.value);
                                      setConnectionStatus('IDLE');
                                  }}
                                  placeholder="AI Studio에서 발급받은 키를 입력하세요"
                                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                              />
                          </div>

                          <div className="flex gap-3">
                              <button 
                                  onClick={handleTestConnection}
                                  disabled={!tempApiKey || connectionStatus === 'TESTING'}
                                  className={`flex-1 py-2 rounded-lg font-medium border text-sm flex items-center justify-center gap-2 transition-colors
                                      ${connectionStatus === 'SUCCESS' ? 'bg-green-50 text-green-700 border-green-200' : 
                                        connectionStatus === 'FAIL' ? 'bg-red-50 text-red-700 border-red-200' : 
                                        'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                              >
                                  {connectionStatus === 'TESTING' ? <RefreshCw className="animate-spin" size={16}/> : 
                                   connectionStatus === 'SUCCESS' ? <CheckCircle2 size={16}/> : 
                                   connectionStatus === 'FAIL' ? <AlertCircle size={16}/> : <RefreshCw size={16}/>}
                                  {connectionStatus === 'TESTING' ? '연결 확인 중...' : 
                                   connectionStatus === 'SUCCESS' ? '연결 성공!' : 
                                   connectionStatus === 'FAIL' ? '연결 실패' : '연결 테스트'}
                              </button>
                          </div>
                      </div>
                  </div>
                  
                  <div className="bg-slate-50 p-4 flex justify-end gap-3 border-t border-slate-100">
                      <button 
                          onClick={() => setIsKeyModalOpen(false)}
                          className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
                      >
                          취소
                      </button>
                      <button 
                          onClick={handleSaveApiKey}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg shadow-blue-500/30 flex items-center gap-2 transition-all"
                      >
                          <Save size={18}/> 저장 및 적용
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;