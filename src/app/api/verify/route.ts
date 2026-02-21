import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let targetUrl = searchParams.get('url') || 'https://www.google.com';

  if (!targetUrl.startsWith('http')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    // 1. 캐시 브레이커: URL 끝에 무작위 난수를 붙여서 CDN이 캐시된 헤더를 주지 못하게 강제함
    const cacheBuster = `_cb=${Date.now()}${Math.random().toString(36).substring(2)}`;
    const bypassUrl = targetUrl.includes('?') 
      ? `${targetUrl}&${cacheBuster}` 
      : `${targetUrl}?${cacheBuster}`;

    // 2. 봇 탐지 우회: HEAD 대신 GET을 사용하고, 진짜 브라우저처럼 User-Agent를 세팅
    const response = await fetch(bypassUrl, {
      method: 'GET', // 티켓팅 서버가 HEAD를 튕겨낸다면 GET으로 본문까지 받아옵니다
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      cache: 'no-store',
    });

    const dateHeader = response.headers.get('date');
    
    if (!dateHeader) {
      return NextResponse.json({ 
        arrivalTime: Date.now(),
        source: 'fallback-local'
      });
    }

    const serverTime = new Date(dateHeader).getTime();

    return NextResponse.json({
      arrivalTime: serverTime,
      source: 'server-header'
    });
    
  } catch (error) {
    return NextResponse.json({ 
      arrivalTime: Date.now(),
      error: "Fetch Failed",
      source: 'fallback-error'
    }, { status: 500 });
  }
}