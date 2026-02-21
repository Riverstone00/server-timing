"use client";

import { useState, useEffect, useRef } from "react";

// 번역 사전: 여기서 한글(ko) 텍스트를 나중에 입맛대로 다듬으면 돼!
const DIC = {
  en: {
    placeholder: "Enter Target URL",
    syncedTime: "Synced Server Time",
    offset: "Offset",
    tune: "Tune",
    syncIdle: "SYNC OFFSET",
    syncScanning: "FAST SCANNING...",
    syncCalibrating: "CALIBRATING...",
    syncSuccess: "SYNC SUCCESS",
    syncUnstable: "SYNC UNSTABLE",
    syncError: "SYNC ERROR",
    testIdle: "Test Timing",
    testTesting: "Testing...",
    progress: "Progress",
    status: "Status",
    statusStarting: "Starting...",
    statusTesting: "Testing",
    statusComplete: "Complete",
    successRate: "Success Rate",
    safe: "Safe",
    details: "Detailed Strike Results"
  },
  ko: {
    placeholder: "타겟 URL 입력",
    syncedTime: "동기화된 서버 시간",
    offset: "오프셋",
    tune: "미세조정",
    syncIdle: "오프셋 동기화",
    syncScanning: "고속 스캔 중...",
    syncCalibrating: "영점 조절 중...",
    syncSuccess: "동기화 성공",
    syncUnstable: "동기화 불안정",
    syncError: "동기화 오류",
    testIdle: "타이밍 테스트",
    testTesting: "테스트 중...",
    progress: "진행도",
    status: "상태",
    statusStarting: "시작 중...",
    statusTesting: "테스트 중",
    statusComplete: "테스트 완료",
    successRate: "성공률",
    safe: "안전",
    details: "상세 테스트 결과"
  }
};

type SyncStatus = 'IDLE' | 'SCANNING' | 'CALIBRATING' | 'SUCCESS' | 'UNSTABLE' | 'ERROR';
type TestStatus = 'STARTING' | 'TESTING' | 'COMPLETE';

export default function Home() {
  const [lang, setLang] = useState<'en' | 'ko'>('en');
  const t = DIC[lang];

  const [now, setNow] = useState<number>(0); 
  const [targetUrl, setTargetUrl] = useState<string>("https://www.google.com");
  const [offset, setOffset] = useState<number>(0); 
  
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncState, setSyncState] = useState<{ status: SyncStatus; extra: string }>({ status: 'IDLE', extra: '' });
  
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    tested: number;
    success: number;
    statusKey: TestStatus;
    results: string[];
  } | null>(null);

  const stateRef = useRef({ targetUrl });
  useEffect(() => {
    stateRef.current = { targetUrl };
  }, [targetUrl]);

  const fetchVerify = async () => {
    const encodedUrl = encodeURIComponent(stateRef.current.targetUrl);
    const res = await fetch(`/api/verify?url=${encodedUrl}`, { cache: 'no-store' });
    if (!res.ok) throw new Error("Server Error");
    return await res.json();
  };

  const runCalibrationTest = (currentOffset: number): Promise<string> => {
    return new Promise((resolve) => {
      const currentUI = Date.now() + currentOffset;
      const targetUI = Math.ceil((currentUI + 1500) / 1000) * 1000; 
      
      const targetLocalEarly = targetUI - 50 - currentOffset;
      const targetLocalLate = targetUI - currentOffset;

      if (targetLocalEarly <= Date.now()) {
        setTimeout(() => resolve('FAIL'), 100);
        return;
      }

      let arrivalEarly = 0;
      let arrivalLate = 0;
      let completedCount = 0;

      const verifyResults = () => {
        if (completedCount < 2) return;
        if (arrivalEarly === targetUI - 1000 && arrivalLate === targetUI) resolve('SAFE'); 
        else if (arrivalEarly === targetUI - 1000 && arrivalLate === targetUI - 1000) resolve('EARLY'); 
        else if (arrivalEarly === targetUI && arrivalLate === targetUI) resolve('LATE'); 
        else resolve('FAIL'); 
      };

      const fireExact = (targetLocal: number, isEarly: boolean) => {
        const wait = targetLocal - Date.now();
        setTimeout(() => {
          while (Date.now() < targetLocal) {}
          fetchVerify().then(data => {
            if (isEarly) arrivalEarly = data.arrivalTime;
            else arrivalLate = data.arrivalTime;
            completedCount++;
            verifyResults();
          }).catch(() => {
            completedCount++;
            verifyResults();
          });
        }, Math.max(0, wait - 10));
      };

      fireExact(targetLocalEarly, true);
      fireExact(targetLocalLate, false);
    });
  };

  const startDeepSync = async () => {
    if (isSyncing || isTesting) return;
    setIsSyncing(true);
    setSyncState({ status: 'SCANNING', extra: '' });

    try {
      const initialData = await fetchVerify();
      const prevServerTime = initialData.arrivalTime;
      let baseOffset = 0;

      await new Promise<void>((resolve) => {
        let found = false;
        let count = 0;
        const interval = setInterval(() => {
          count++;
          if (found || count > 100) { 
            clearInterval(interval);
            resolve();
            return;
          }
          const tStart = Date.now();
          fetchVerify().then(data => {
            if (!found && data.arrivalTime > prevServerTime) {
              found = true;
              clearInterval(interval);
              baseOffset = data.arrivalTime - tStart - 25; 
              resolve();
            }
          }).catch(() => {});
        }, 15);
      });

      let currentOffset = baseOffset;
      let consecutiveSafe = 0;
      let attempts = 0;
      const MAX_ATTEMPTS = 15; 
      const TARGET_SAFE = 3;   

      while (consecutiveSafe < TARGET_SAFE && attempts < MAX_ATTEMPTS) {
        attempts++;
        setSyncState({ status: 'CALIBRATING', extra: `(${consecutiveSafe}/${TARGET_SAFE})` });
        setOffset(currentOffset); 

        const result = await runCalibrationTest(currentOffset);

        if (result === 'SAFE') {
          consecutiveSafe++;
        } else {
          consecutiveSafe = 0; 
          if (result === 'EARLY') currentOffset -= 15; 
          else if (result === 'LATE') currentOffset += 15; 
        }
      }

      setOffset(currentOffset);
      if (consecutiveSafe >= TARGET_SAFE) {
        setSyncState({ status: 'SUCCESS', extra: '' });
      } else {
        setSyncState({ status: 'UNSTABLE', extra: '' });
      }

    } catch (e) {
      setSyncState({ status: 'ERROR', extra: '' });
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        setSyncState(prev => prev.status !== 'IDLE' && !isSyncing ? { status: 'IDLE', extra: '' } : prev);
      }, 3000);
    }
  };

  const runSingleTest = (): Promise<string> => {
    return runCalibrationTest(offset);
  };

  const runTestSuite = async () => {
    if (isTesting || isSyncing) return;
    setIsTesting(true);
    setTestResult({ tested: 0, success: 0, statusKey: 'STARTING', results: [] });

    let successes = 0;
    const currentResults: string[] = [];
    
    for (let i = 0; i < 5; i++) {
      setTestResult(prev => ({ ...prev!, statusKey: 'TESTING' }));
      
      const res = await runSingleTest();
      if (res === 'SAFE') successes++;
      currentResults.push(res);
      
      setTestResult(prev => ({ 
        ...prev!, 
        tested: i + 1, 
        success: successes,
        results: [...currentResults] 
      }));
    }
    
    setTestResult(prev => ({ ...prev!, statusKey: 'COMPLETE' }));
    setIsTesting(false);
  };

  const adjustOffset = (amount: number) => {
    setOffset(prev => prev + amount);
  };

  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      setNow(Date.now());
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const formatTime = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  };

  const displayTime = formatTime(now + offset);

  // 다국어 버튼 라벨 계산
  const getSyncBtnLabel = () => {
    switch(syncState.status) {
      case 'SCANNING': return t.syncScanning;
      case 'CALIBRATING': return `${t.syncCalibrating} ${syncState.extra}`;
      case 'SUCCESS': return t.syncSuccess;
      case 'UNSTABLE': return t.syncUnstable;
      case 'ERROR': return t.syncError;
      default: return t.syncIdle;
    }
  };

  const getTestStatusLabel = (key: TestStatus, tested: number) => {
    if (key === 'STARTING') return t.statusStarting;
    if (key === 'TESTING') return `${t.statusTesting} ${tested}/5...`;
    return t.statusComplete;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0f1e] text-slate-200 p-8 font-sans relative">
      
      {/* ENG / KOR 토글 스위치 */}
      <div className="absolute top-6 right-6 flex bg-slate-900 border border-slate-700 rounded-full p-1 shadow-lg">
        <button 
          onClick={() => setLang('en')} 
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${lang === 'en' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
        >
          ENG
        </button>
        <button 
          onClick={() => setLang('ko')} 
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${lang === 'ko' ? 'bg-pink-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
        >
          KOR
        </button>
      </div>

      <header className="mb-6 w-full max-w-md mt-8">
        <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl p-1 shadow-inner focus-within:border-cyan-500 transition-colors">
          <input 
            type="text" 
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder={t.placeholder}
            className="bg-transparent border-none text-sm text-white w-full px-4 py-3 focus:outline-none font-mono"
          />
        </div>
      </header>

      <section className="w-full max-w-md bg-slate-950 border-2 border-cyan-500/30 rounded-3xl p-8 mb-8 text-center shadow-[0_0_40px_rgba(6,182,212,0.15)] relative overflow-hidden">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
          <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-[0.2em] m-0">{t.syncedTime}</h2>
        </div>
        
        <div className="font-mono text-4xl md:text-5xl font-black text-white tabular-nums tracking-tighter">
          {displayTime}
        </div>
        
        <div className="mt-4 flex flex-col items-center gap-3">
          <div className="inline-block bg-slate-900 border border-slate-800 rounded-full px-3 py-1">
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
              {t.offset} : <span className={offset === 0 ? "text-slate-500" : (offset > 0 ? "text-amber-400" : "text-green-400")}>
                {offset > 0 ? `+${offset}` : offset} ms
              </span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900/50 p-1.5 rounded-xl border border-slate-800/50">
            <button onClick={() => adjustOffset(-10)} className="w-10 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs font-mono transition-colors active:scale-95">-10</button>
            <button onClick={() => adjustOffset(-1)} className="w-8 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs font-mono transition-colors active:scale-95">-1</button>
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest px-2">{t.tune}</span>
            <button onClick={() => adjustOffset(1)} className="w-8 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs font-mono transition-colors active:scale-95">+1</button>
            <button onClick={() => adjustOffset(10)} className="w-10 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs font-mono transition-colors active:scale-95">+10</button>
          </div>
        </div>
      </section>

      <main className="w-full max-w-md flex flex-col gap-4">
        <div className="flex gap-3">
          <button 
            onClick={startDeepSync} 
            disabled={isSyncing || isTesting} 
            className="flex-1 bg-cyan-700 hover:bg-cyan-600 py-4 rounded-xl font-bold text-sm transition-all text-white disabled:opacity-50 uppercase tracking-wider"
          >
            {getSyncBtnLabel()}
          </button>
          <button 
            onClick={runTestSuite} 
            disabled={isTesting || isSyncing}
            className="flex-1 bg-pink-600 hover:bg-pink-500 py-4 rounded-xl font-bold text-sm transition-all text-white disabled:opacity-50 uppercase tracking-wider"
          >
            {isTesting ? t.testTesting : t.testIdle}
          </button>
        </div>

        {testResult && (
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col mt-2 shadow-lg">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3">
              <span className="text-sm font-bold text-slate-400">{t.progress}</span>
              <span className="font-mono text-slate-200">{testResult.tested} / 5</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3">
              <span className="text-sm font-bold text-slate-400">{t.status}</span>
              <span className="font-mono text-cyan-400">{getTestStatusLabel(testResult.statusKey, testResult.tested)}</span>
            </div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-bold text-pink-400">{t.successRate}</span>
              <span className={`font-mono font-black text-lg ${testResult.success >= 4 ? 'text-green-400' : (testResult.success > 0 ? 'text-amber-400' : 'text-pink-400')}`}>
                {testResult.success} / 5 {t.safe}
              </span>
            </div>

            <div className="pt-4 border-t border-slate-800 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center mb-1">{t.details}</span>
              <div className="grid grid-cols-5 gap-2">
                {[0, 1, 2, 3, 4].map((i) => {
                  const res = testResult.results[i];
                  let colorClass = "text-slate-600 border-slate-800 bg-slate-900/50"; 
                  
                  if (res === 'SAFE') colorClass = "text-green-400 border-green-500/30 bg-green-500/10";
                  else if (res === 'EARLY') colorClass = "text-amber-400 border-amber-500/30 bg-amber-500/10";
                  else if (res === 'LATE') colorClass = "text-pink-400 border-pink-500/30 bg-pink-500/10";
                  else if (res === 'FAIL') colorClass = "text-red-500 border-red-500/30 bg-red-500/10";

                  return (
                    <div key={i} className={`flex items-center justify-center py-2 rounded-lg border text-[9px] font-bold uppercase tracking-wider transition-colors ${colorClass}`}>
                      {res || "-"}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}