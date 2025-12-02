// BaseCrawler.js

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const config = require('./config');
const normalizeUrl = require('./normalizeUrl');
const { normalizeDate, getSourceTimezone } = require('./dateUtils');

class BaseCrawler {
    constructor(source) {
        this.source   = source;
        this.apiBase  = config.API_BASE_URL;
        this.getPath  = config.API_ENDPOINTS.GET_RECENT_URLS;
        this.postPath = config.API_ENDPOINTS.POST_ARTICLE;
        this.startUrls = [];  // Override in subclass

        // 캐시 디렉토리/파일 준비
        if (!fs.existsSync(config.CRAWLER.CACHE_DIR)) {
            fs.mkdirSync(config.CRAWLER.CACHE_DIR, { recursive: true });
        }
        this.cacheFile = path.join(
            config.CRAWLER.CACHE_DIR,
            config.CACHE_FILES[source] || `${source.toLowerCase()}.txt`
        );
        if (!fs.existsSync(this.cacheFile)) {
            fs.writeFileSync(this.cacheFile, '');
        }
        this._rotateCache();  // 오늘 날짜 외 캐시 항목은 제거

        // 이미 처리된 URL 추적을 위한 Set
        this.processedUrls = new Set();
        this.dbUrls = new Set();
    }

    _rotateCache() {
        const today = new Date().toISOString().slice(0,10);
        const lines = fs.readFileSync(this.cacheFile, 'utf8').split('\n');
        const kept  = lines
            .filter(l => l.startsWith(today + '|'))
            .map(l => l.split('|')[1])
            .filter(Boolean)
            .map(url => `${today}|${url}`);
        fs.writeFileSync(this.cacheFile, kept.join('\n') + (kept.length ? '\n' : ''));
    }

    async getRecentDbUrls() {
        try {
            const res = await axios.get(this.apiBase + this.getPath, {
                params: { source: this.source }
            });
            const urls = Array.isArray(res.data.data) ? res.data.data : [];
            console.log(`✅ [${this.source}] DB에서 ${urls.length}개 URL 조회`);

            // URL 정규화 후 Set에 저장
            const normalizedUrls = new Set();
            urls.forEach(url => {
                if (url) {
                    const normalized = normalizeUrl(url);
                    normalizedUrls.add(normalized);
                }
            });

            console.log(`✅ [${this.source}] 정규화 후 ${normalizedUrls.size}개 URL`);
            return normalizedUrls;
        } catch (err) {
            console.error(`❌ [${this.source}] DB 조회 실패:`, err.message);
            return new Set();
        }
    }

    getCachedUrls() {
        const today = new Date().toISOString().slice(0,10);
        const rawUrls = fs.readFileSync(this.cacheFile, 'utf8').split('\n')
            .filter(l => l.startsWith(today + '|'))
            .map(l => l.split('|')[1])
            .filter(Boolean);

        // URL 정규화 후 Set에 저장
        const normalizedUrls = new Set();
        rawUrls.forEach(url => {
            if (url) {
                const normalized = normalizeUrl(url);
                normalizedUrls.add(normalized);
            }
        });

        return normalizedUrls;
    }

    addToCache(url) {
        if (!url) return;

        const normalized = normalizeUrl(url);
        const today = new Date().toISOString().slice(0,10);

        // 이미 처리된 URL Set에 추가
        this.processedUrls.add(normalized);

        // 캐시 파일에 추가
        fs.appendFileSync(this.cacheFile, `${today}|${normalized}\n`);

        console.log(`   💾 [${this.source}] 캐시에 URL 추가: ${normalized}`);
    }

    // 서브클래스에서 재정의할 필요 없이 공통 normalizeUrl 사용
    normalizeUrl(raw) {
        return normalizeUrl(raw);
    }

    // URL 필터링 로직 - 공통 기능
    filterNewUrls(rawUrls) {
        // 처리된 URL 집합이 아직 초기화되지 않았다면 초기화
        if (this.processedUrls.size === 0) {
            this.initializeProcessedUrlsSync();
        }

        console.log(`   👉 필터링 전: ${rawUrls.length}개 URL`);

        // 1. URL 정규화 및 기본 정보 유지
        const normalized = rawUrls.map(item => {
            const rawUrl = typeof item === 'object' ? (item.url || '') : item;
            const norm = this.normalizeUrl(rawUrl);
            return {
                norm,
                originalUrl: rawUrl,
                ...(typeof item === 'object' ? item : { url: rawUrl })
            };
        });

        console.log(`   👉 정규화 후: ${normalized.length}개 URL`);

        // 2. 중복 & 처리된 URL 필터링
        const seen = new Set();
        const filtered = normalized.filter(({ norm, originalUrl }) => {
            // 빈 URL은 제외
            if (!norm) {
                return false;
            }

            // 이미 현재 배치에서 본 URL이면 제외
            if (seen.has(norm)) {
                return false;
            }

            // 이미 처리된 URL이면 제외
            if (this.processedUrls.has(norm)) {
                // 디버깅용 로그
                // console.log(`   👉 중복 URL 필터링: ${originalUrl} -> ${norm}`);
                return false;
            }

            // 새로운 URL - 현재 배치 중복 방지를 위해 기록
            seen.add(norm);
            return true;
        });

        console.log(`   👉 필터링 후: ${filtered.length}개 신규 URL 발견`);
        return filtered;
    }

    async sendArticleToApi(payload) {
        // 소스 URL 확인 및 정규화
        if (!payload.sourceUrl) {
            console.warn(`⚠️ [${this.source}] 소스 URL 없음, 스킵`);
            return { status: 'skipped' };
        }

        const normalizedUrl = this.normalizeUrl(payload.sourceUrl);

        // 다시 한번 중복 URL 검사
        if (this.processedUrls.has(normalizedUrl)) {
            console.warn(`⚠️ [${this.source}] 이미 처리된 URL 스킵: ${payload.sourceUrl}`);
            return { status: 'skipped' };
        }

        // 표준화된 URL로 업데이트
        payload.sourceUrl = normalizedUrl;

        if (payload.publishedAt) {
            payload.publishedAt = normalizeDate(payload.publishedAt, {
                sourceTimezone: getSourceTimezone(this.source),
                source: this.source
            });
        } else {
            // publishedAt이 없으면 현재 시간 사용
            payload.publishedAt = new Date().toISOString();
        }

        console.log(`🚀 [${this.source}] 전송 시작: ${payload.sourceUrl}`);
        try {
            const res = await axios.post(this.apiBase + this.postPath, payload, {
                headers: { 'Content-Type': 'application/json' }
            });
            console.log(`✅ [${this.source}] 저장 성공: ${payload.sourceUrl}`);

            // 성공 시 캐시에 추가
            this.addToCache(normalizedUrl);
            return res.data;
        } catch (err) {
            // 중복 항목은 Warning으로 처리 (에러는 아님)
            if (err.response?.status === 409) {
                console.warn(`⚠️ [${this.source}] 중복 항목: ${payload.sourceUrl}`);
                // 중복 항목도 캐시에 추가하여 재시도 방지
                this.addToCache(normalizedUrl);
                return { status: 'duplicate' };
            }

            const errMsg = err.response?.data || err.message;
            console.error(`❌ [${this.source}] 저장 실패: ${payload.sourceUrl}`, errMsg);
            throw err;
        }
    }

    randomDelay(
        min = config.CRAWLER.DELAY_MIN,
        max = config.CRAWLER.DELAY_MAX
    ) {
        const ms = Math.floor(Math.random() * (max - min + 1)) + min;
        return new Promise(r => setTimeout(r, ms));
    }

    // 기본 크롤링 로직 - 하위 클래스에서 반드시 재정의
    async crawl() {
        throw new Error('크롤링 메서드는 하위 클래스에서 구현해야 합니다.');
    }

    // DB & 캐시 URL을 즉시 동기적으로 초기화
    initializeProcessedUrlsSync() {
        // 이미 캐시로드된 URL 가져오기
        const cachedUrls = this.getCachedUrls();
        console.log(`✅ [${this.source}] 캐시에서 ${cachedUrls.size}개 URL 로드`);

        // 모든 URL을 처리된 URL 집합에 추가
        this.processedUrls = new Set([...this.dbUrls, ...cachedUrls]);

        console.log(`✅ [${this.source}] 총 ${this.processedUrls.size}개 URL 처리 제외 대상`);
    }

    // DB URL을 비동기로 로드하고 저장
    async initializeProcessedUrls() {
        // 항상 최신 데이터로 업데이트
        this.dbUrls = await this.getRecentDbUrls();

        // 기존 처리된 URL 초기화하고 다시 구성
        this.initializeProcessedUrlsSync();

        return this.processedUrls;
    }
}

module.exports = BaseCrawler;