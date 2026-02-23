"use client";

import { useState, useEffect, useRef } from "react";

// 다국어 사전: 피드백 반영 (안내 문구 추가 및 세이프 기준 수정)
const DIC = {
  en: {
    title: "ServerCatch",
    subTitle: "Server Time Just for You",
    placeholder: "Enter Target URL",
    syncedTime: "Server time including network speed.",
    guideMsg: "Click exactly at the target time.",
    offset: "Offset",
    tune: "Tune",
    syncIdle: "SYNC",
    syncScanning: "SCANNING",
    syncCalibrating: "CALIB",
    syncSuccess: "SUCCESS",
    syncUnstable: "UNSTABLE",
    syncError: "ERROR",
    testIdle: "Test Timing",
    testTesting: "Testing...",
    progress: "Progress",
    status: "Status",
    statusStarting: "Starting...",
    statusTesting: "Testing",
    statusComplete: "Complete",
    successRate: "Success Rate",
    safe: "Safe",
    details: "Detailed Strike Results",
    safeCondition: "* Safe: Timing error within 0ms ~ 50ms"
  },
  ko: {
    title: "서버캐치",
    subTitle: "당신만을 위한 서버시간",
    placeholder: "타겟 URL 입력",
    syncedTime: "네트워크 속도를 포함한 서버시간입니다.",
    guideMsg: "목표 시간 정각에 클릭하세요",
    offset: "오프셋",
    tune: "미세조정",
    syncIdle: "동기화",
    syncScanning: "스캔 중",
    syncCalibrating: "조절 중",
    syncSuccess: "성공",
    syncUnstable: "불안정",
    syncError: "오류",
    testIdle: "타이밍 테스트",
    testTesting: "테스트 중...",
    progress: "진행도",
    status: "상태",
    statusStarting: "시작 중...",
    statusTesting: "테스트 중",
    statusComplete: "테스트 완료",
    successRate: "성공률",
    safe: "안전",
    details: "상세 테스트 결과",
    safeCondition: "* 안전(Safe) 기준: 서버 도달 오차 0ms ~ 50ms 이내"
  }
};

type SyncStatus = 'IDLE' | 'SCANNING' | 'CALIBRATING' | 'SUCCESS' | 'UNSTABLE' | 'ERROR';
type TestStatus = 'STARTING' | 'TESTING' | 'COMPLETE';

export default function Home() {
  // 기본 언어 한국어 설정
  const [lang, setLang] = useState<'en' | 'ko'>('ko');
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

  // 브라우저 탭 타이틀 설정
  useEffect(() => {
    document.title = lang === 'ko' ? "서버캐치 - 당신만을 위한 서버시간" : "ServerCatch - Server Time Just for You";
  }, [lang]);

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
      while (consecutiveSafe < 3 && attempts < 15) {
        attempts++;
        setSyncState({ status: 'CALIBRATING', extra: `(${consecutiveSafe}/3)` });
        setOffset(currentOffset); 
        const result = await runCalibrationTest(currentOffset);
        if (result === 'SAFE') consecutiveSafe++;
        else {
          consecutiveSafe = 0; 
          if (result === 'EARLY') currentOffset -= 15; 
          else if (result === 'LATE') currentOffset += 15; 
        }
      }
      setOffset(currentOffset);
      setSyncState({ status: consecutiveSafe >= 3 ? 'SUCCESS' : 'UNSTABLE', extra: '' });
    } catch (e) {
      setSyncState({ status: 'ERROR', extra: '' });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncState(prev => prev.status !== 'IDLE' && !isSyncing ? { status: 'IDLE', extra: '' } : prev), 3000);
    }
  };

  const runTestSuite = async () => {
    if (isTesting || isSyncing) return;
    setIsTesting(true);
    setTestResult({ tested: 0, success: 0, statusKey: 'STARTING', results: [] });
    let successes = 0;
    const currentResults: string[] = [];
    for (let i = 0; i < 5; i++) {
      setTestResult(prev => ({ ...prev!, statusKey: 'TESTING' }));
      const res = await runCalibrationTest(offset);
      if (res === 'SAFE') successes++;
      currentResults.push(res);
      setTestResult(prev => ({ ...prev!, tested: i + 1, success: successes, results: [...currentResults] }));
    }
    setTestResult(prev => ({ ...prev!, statusKey: 'COMPLETE' }));
    setIsTesting(false);
  };

  // 수동 오프셋 조정 함수 (복구 완료)
  const adjustOffset = (amount: number) => {
    setOffset(prev => prev + amount);
  };

  useEffect(() => {
    let animationFrameId: number;
    const loop = () => { setNow(Date.now()); animationFrameId = requestAnimationFrame(loop); };
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const formatTime = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  };

  const getSyncBtnLabel = () => {
    switch(syncState.status) {
      case 'SCANNING': return t.syncScanning;
      case 'CALIBRATING': return t.syncCalibrating;
      case 'SUCCESS': return t.syncSuccess;
      case 'UNSTABLE': return t.syncUnstable;
      case 'ERROR': return t.syncError;
      default: return t.syncIdle;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0f1e] text-slate-200 p-6 font-sans relative overflow-x-hidden">
      {/* 언어 토글 */}
      <div className="absolute top-6 right-6 flex bg-slate-900 border border-slate-700 rounded-full p-1 shadow-lg z-20">
        <button onClick={() => setLang('en')} className={`px-4 py-1.5 rounded-full text-[10px] font-bold transition-all ${lang === 'en' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>ENG</button>
        <button onClick={() => setLang('ko')} className={`px-4 py-1.5 rounded-full text-[10px] font-bold transition-all ${lang === 'ko' ? 'bg-pink-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>KOR</button>
      </div>

      <header className="mb-8 w-full max-w-md text-center">
        <h1 className="text-4xl font-black text-white tracking-tight mb-2 uppercase">{t.title}</h1>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] opacity-80">{t.subTitle}</p>
        
        {/* 통합된 URL 및 동기화 바: UX 최적화 */}
        <div className="mt-10 flex items-stretch bg-slate-900 border border-slate-700 rounded-2xl p-1.5 shadow-2xl focus-within:border-cyan-500/50 transition-all">
          <input 
            type="text" 
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder={t.placeholder}
            className="bg-transparent border-none text-sm text-white w-full px-4 py-3 focus:outline-none font-mono"
          />
          <button 
            onClick={startDeepSync} 
            disabled={isSyncing || isTesting} 
            className="whitespace-nowrap bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 px-6 rounded-xl font-black text-[11px] transition-all text-white uppercase tracking-tighter shadow-lg active:scale-95"
          >
            {getSyncBtnLabel()}
          </button>
        </div>
      </header>

      {/* 시계 섹션: 안내 문구 추가 */}
      <section className="w-full max-w-md bg-slate-950 border border-cyan-500/20 rounded-[2.5rem] p-10 mb-6 text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative">
        <div className="flex flex-col items-center justify-center gap-1 mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-cyan-400 animate-pulse'}`}></div>
            <h2 className="text-[10px] font-bold text-cyan-400/80 uppercase tracking-tight m-0">{t.syncedTime}</h2>
          </div>
          <p className="text-[11px] font-medium text-slate-400 m-0 mt-1">{t.guideMsg}</p>
        </div>
        
        <div className="font-mono text-5xl md:text-6xl font-black text-white tabular-nums tracking-tighter drop-shadow-2xl">
          {formatTime(now + offset)}
        </div>
        
        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-full px-4 py-1.5 shadow-inner">
            <span className="text-[11px] text-slate-400 font-mono uppercase tracking-widest">
              {t.offset} : <span className={offset === 0 ? "text-slate-500" : (offset > 0 ? "text-amber-400" : "text-green-400")}>
                {offset > 0 ? `+${offset}` : offset} ms
              </span>
            </span>
          </div>

          <div className="flex items-center gap-1 bg-slate-900/40 p-1 rounded-2xl border border-slate-800/50 backdrop-blur-sm">
            <button onClick={() => adjustOffset(-10)} className="w-10 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-[10px] font-mono transition-all active:scale-90">-10</button>
            <button onClick={() => adjustOffset(-1)} className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-[10px] font-mono transition-all active:scale-90">-1</button>
            <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest px-3">{t.tune}</span>
            <button onClick={() => adjustOffset(1)} className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-[10px] font-mono transition-all active:scale-90">+1</button>
            <button onClick={() => adjustOffset(10)} className="w-10 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-[10px] font-mono transition-all active:scale-90">+10</button>
          </div>
        </div>
      </section>

      <main className="w-full max-w-md">
        <button 
          onClick={runTestSuite} 
          disabled={isTesting || isSyncing}
          className="w-full bg-pink-600 hover:bg-pink-500 py-4 rounded-2xl font-black text-xs transition-all text-white disabled:opacity-50 uppercase tracking-widest shadow-xl active:scale-[0.98]"
        >
          {isTesting ? t.testTesting : t.testIdle}
        </button>

        {testResult && (
          <div className="bg-slate-900/90 backdrop-blur-md p-6 rounded-[2rem] border border-slate-800 flex flex-col mt-4 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[11px] font-black text-pink-400 uppercase tracking-tighter">{t.successRate}</span>
              <span className={`font-mono font-black text-xl ${testResult.success >= 4 ? 'text-green-400' : 'text-amber-400'}`}>
                {testResult.success} / 5 {t.safe}
              </span>
            </div>
            {/* 상세 결과 박스: 약자 제거 및 전체 단어 출력 */}
            <div className="grid grid-cols-5 gap-2 pb-4 border-b border-slate-800">
              {[0, 1, 2, 3, 4].map((i) => {
                const res = testResult.results[i];
                let colorClass = "text-slate-700 border-slate-800 bg-slate-950/50"; 
                if (res === 'SAFE') colorClass = "text-green-400 border-green-500/30 bg-green-500/10";
                else if (res === 'EARLY') colorClass = "text-amber-400 border-amber-500/30 bg-amber-500/10";
                else if (res === 'LATE') colorClass = "text-pink-400 border-pink-500/30 bg-pink-500/10";
                return (
                  <div key={i} className={`flex items-center justify-center py-2.5 rounded-xl border text-[8px] font-black uppercase tracking-tighter transition-all ${colorClass}`}>
                    {res || "-"}
                  </div>
                );
              })}
            </div>
            <p className="text-[9px] text-slate-500 text-center font-medium mt-4 leading-relaxed opacity-70">
              {t.safeCondition}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}