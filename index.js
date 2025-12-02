// index.js
const BloombergCrawler = require('./BloombergCrawler');
const GuardianCrawler  = require('./GuardianCrawler');
const BBCCrawler       = require('./BBCCrawler');
// const NYTimesCrawler = require('./NYTimesCrawler');

function randomSeconds(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 에러 복구 메커니즘이 있는 크롤러 루프
async function startCrawlerLoop(crawler) {
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;
    const BASE_WAIT_TIME = 60; // 초 단위

    while (true) {
        console.log(`▶ [${crawler.source}] 뉴스 수집 루프 실행`);
        try {
            await crawler.crawl();
            consecutiveErrors = 0;
        } catch (err) {
            consecutiveErrors++;
            console.error(`❌ [${crawler.source}] 크롤링 루프 중 오류 발생 (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, err);

            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                const waitMinutes = Math.min(30, 5 * Math.pow(2, consecutiveErrors - MAX_CONSECUTIVE_ERRORS));
                console.warn(`⚠️ [${crawler.source}] 연속 오류 임계값 초과, ${waitMinutes}분 대기...`);
                await new Promise(res => setTimeout(res, waitMinutes * 60 * 1000));
            }
        }

        // 성공 혹은 오류 여부에 상관없이 다음 대기 시간은 60~120초 랜덤
        const waitTime = randomSeconds(BASE_WAIT_TIME, BASE_WAIT_TIME * 2);
        console.log(`⏳ [${crawler.source}] ${waitTime}초 대기 중...`);
        await new Promise(res => setTimeout(res, waitTime * 1000));
    }
}

// 프로세스 시그널 핸들링
process.on('SIGINT', () => {
    console.log('👋 크롤러 종료 요청 (SIGINT)');
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log('👋 크롤러 종료 요청 (SIGTERM)');
    process.exit(0);
});
process.on('uncaughtException', err => {
    console.error('🚨 미처리 예외 발생:', err);
    // process.exit(1);
});

// 메인 실행 함수
(async () => {
    console.log('🚀 뉴스 크롤러 시작...');

    const crawlers = [
        new BloombergCrawler(),
        new GuardianCrawler(),
        new BBCCrawler(),
        // new NYTimesCrawler(),
    ];

    for (const crawler of crawlers) {
        // 각 크롤러를 비동기로 독립 실행
        startCrawlerLoop(crawler);
        // 다음 크롤러 시작 전 5초 정도 짧게 딜레이
        await new Promise(res => setTimeout(res, 5000));
    }

    console.log('✅ 모든 크롤러 시작 완료');
})().catch(err => {
    console.error('🚨 크롤러 초기화 중 치명적 오류:', err);
    process.exit(1);
});