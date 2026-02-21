import { NextResponse } from 'next/server';

export async function GET() {
  const TARGET_URL = "https://www.google.com";
  try {
    let previousTime = 0;
    // 최대 10번 재시도하여 초가 바뀌는 순간(Edge)을 포착
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      const res = await fetch(`${TARGET_URL}?t=${t0}`, { method: 'HEAD', cache: 'no-store' });
      const t1 = performance.now();
      const serverDate = new Date(res.headers.get('date') || "");
      const serverTime = serverDate.getTime();

      if (previousTime !== 0 && serverTime > previousTime) {
        // 초가 바뀌었다! 지금 이 순간(t1)이 서버의 XX초 .000 시점입니다.
        return NextResponse.json({ 
          serverTime: serverTime, 
          latency: (t1 - t0) / 2,
          edgeDetected: true 
        });
      }
      previousTime = serverTime;
      await new Promise(r => setTimeout(r, 50)); // 50ms 간격으로 확인
    }
    // 실패 시 일반 응답
    const res = await fetch(TARGET_URL, { method: 'HEAD' });
    return NextResponse.json({ serverTime: new Date(res.headers.get('date') || "").getTime(), edgeDetected: false });
  } catch (e) { return NextResponse.json({ error: 'fail' }, { status: 500 }); }
}