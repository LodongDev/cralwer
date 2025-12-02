// DynamicCategoryMapper.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * 백엔드에서 카테고리 매핑 규칙을 동적으로 가져와 사용하는 매퍼 클래스
 */
class DynamicCategoryMapper {
    constructor() {
        // 매핑 규칙을 캐싱하기 위한 변수들
        this.categoryRules = null;
        this.specialPatterns = null;
        this.lastUpdated = null;
        this.updateInterval = 3600000; // 1시간마다 업데이트 (ms)
        this.cacheFile = path.join(
            config.CRAWLER.CACHE_DIR || './',
            'category_rules_cache.json'
        );

        // 초기화 시 캐시된 파일 로드 시도
        this.loadCachedRules();
    }

    /**
     * 캐시된 규칙 로드
     */
    loadCachedRules() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
                this.categoryRules = cached.categoryRules;
                this.specialPatterns = cached.specialPatterns;
                this.lastUpdated = new Date(cached.lastUpdated);
                console.log(`✅ 캐시된 카테고리 규칙 로드 성공: ${this.lastUpdated}`);
            }
        } catch (err) {
            console.warn(`⚠️ 캐시된 카테고리 규칙 로드 실패: ${err.message}`);
        }
    }

    /**
     * 규칙을 캐시 파일에 저장
     */
    saveCachedRules() {
        try {
            const cacheDir = path.dirname(this.cacheFile);
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }

            const data = {
                categoryRules: this.categoryRules,
                specialPatterns: this.specialPatterns,
                lastUpdated: new Date().toISOString()
            };

            fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2), 'utf8');
            console.log(`✅ 카테고리 규칙 캐시 저장 성공`);
        } catch (err) {
            console.warn(`⚠️ 카테고리 규칙 캐시 저장 실패: ${err.message}`);
        }
    }

    /**
     * 백엔드에서 최신 카테고리 규칙 가져오기
     */
    async fetchRulesFromBackend() {
        try {
            // 백엔드 API에서 카테고리 규칙 가져오기
            const response = await axios.get(`${config.API_BASE_URL}/category-rules`, {
                timeout: 5000
            });

            if (response.data && response.data.success) {
                console.log(`✅ 백엔드에서 카테고리 규칙 가져오기 성공`);
                this.categoryRules = response.data.categoryRules;
                this.specialPatterns = response.data.specialPatterns;
                this.lastUpdated = new Date();

                // 캐시에 저장
                this.saveCachedRules();
                return true;
            } else {
                console.warn(`⚠️ 백엔드에서 유효하지 않은 카테고리 규칙 응답`);
                return false;
            }
        } catch (err) {
            console.warn(`⚠️ 백엔드에서 카테고리 규칙 가져오기 실패: ${err.message}`);
            return false;
        }
    }

    /**
     * 필요한 경우 규칙 업데이트
     */
    async updateRulesIfNeeded() {
        // 규칙이 없거나 마지막 업데이트 후 일정 시간이 지났으면 업데이트
        const now = new Date();
        if (!this.categoryRules ||
            !this.lastUpdated ||
            (now - this.lastUpdated) > this.updateInterval) {

            console.log(`🔄 카테고리 규칙 업데이트 시도...`);

            // 백엔드에서 규칙 가져오기 시도
            const success = await this.fetchRulesFromBackend();

            // 실패하고 캐시된 규칙도 없으면 기본 규칙 사용
            if (!success && !this.categoryRules) {
                console.log(`🔄 백엔드 연결 실패, 기본 규칙 사용`);
                this.useDefaultRules();
            }
        }
    }

    /**
     * 기본 카테고리 규칙 설정 (백엔드 연결 실패 시)
     */
    useDefaultRules() {
        this.categoryRules = {
            // 정치 관련
            'POLITICS': [
                'politics', 'election', 'government', 'parliament', 'congress', 'senate',
                'democra', 'republican', 'minister', 'president', 'policy', 'politician',
                'vote', 'campaign', 'trump', 'biden', 'conservative', 'liberal'
            ],

            // 경제 관련
            'ECONOMY': [
                'economy', 'economic', 'gdp', 'inflation', 'recession', 'unemployment',
                'trade', 'tariff', 'fiscal', 'budget', 'debt', 'deficit', 'treasury',
                'chinese economy', 'us economy', 'global economy', 'fed'
            ],

            // 금융 관련
            'FINANCE': [
                'finance', 'bank', 'interest rate', 'mortgage', 'loan', 'credit',
                'financial', 'insurance', 'investment', 'pension', 'wealth',
                'monetary', 'rate cut', 'rate rise', 'central bank'
            ],

            // 비즈니스 관련
            'BUSINESS': [
                'business', 'company', 'corporate', 'industry', 'industries', 'industrial',
                'retail', 'consumer', 'market', 'startup', 'entrepreneur', 'ceo', 'board',
                'merger', 'acquisition', 'profit', 'loss', 'revenue', 'sales', 'supply chain',
                'manufacturing', 'bmw', 'tesla', 'apple', 'microsoft', 'amazon', 'google'
            ],

            // 기술 관련
            'TECHNOLOGY': [
                'technology', 'tech', 'software', 'hardware', 'app', 'device', 'gadget',
                'computer', 'laptop', 'phone', 'smartphone', 'tablet', 'artificial intelligence',
                'ai', 'machine learning', 'algorithm', 'automation', 'robot', 'cyber',
                'internet', 'web', 'digital', 'data', 'privacy', 'security', 'hack',
                'social media', 'streaming', 'e-commerce', 'gaming', 'games', 'game'
            ],

            // 주식 시장 관련
            'STOCK_MARKET': [
                'stock', 'share', 'equity', 'wall street', 'dow jones', 'nasdaq', 'nyse',
                'ftse', 'nikkei', 'hang seng', 'bull market', 'bear market', 'ipo'
            ],

            // 암호화폐 관련
            'CRYPTO': [
                'crypto', 'bitcoin', 'ethereum', 'cryptocurrency', 'token', 'coin',
                'blockchain', 'mining', 'wallet', 'defi', 'nft', 'doge', 'altcoin'
            ],

            // 세계 뉴스 관련
            'WORLD_NEWS': [
                'world', 'international', 'global', 'foreign', 'europe', 'asia', 'africa',
                'middle east', 'america', 'australia', 'china', 'russia', 'ukraine'
            ],

            // 속보 관련
            'BREAKING': [
                'breaking', 'urgent', 'alert', 'just in', 'developing', 'live', 'update'
            ]
        };

        // 특별 패턴 설정
        this.specialPatterns = [
            { pattern: 'industry', category: 'BUSINESS' },
            { pattern: 'donald trump', category: 'POLITICS' },
            { pattern: 'review', category: 'TECHNOLOGY' }
        ];

        this.lastUpdated = new Date();
        this.saveCachedRules();
    }

    /**
     * 뉴스의 섹션/카테고리를 우리 시스템에 맞게 표준화
     *
     * @param {string} rawCategory - 원본 카테고리/섹션 문자열
     * @param {string} title - 기사 제목
     * @param {string} url - 기사 URL
     * @returns {string} 표준화된 카테고리
     */
    async mapCategory(rawCategory, title = '', url = '') {
        // 규칙 업데이트 확인
        await this.updateRulesIfNeeded();

        if (!this.categoryRules) {
            console.warn('⚠️ 카테고리 규칙이 없습니다, OTHER 반환');
            return 'OTHER';
        }

        if (!rawCategory && !title) return 'OTHER';

        // 소문자 변환 및 공백 제거
        const normalizedCategory = (rawCategory || '').toLowerCase().trim();
        const normalizedTitle = (title || '').toLowerCase().trim();
        const normalizedUrl = (url || '').toLowerCase().trim();

        // URL에서 추가 정보 추출
        let extractedFromUrl = '';
        if (url) {
            const urlParts = url.split('/');
            if (urlParts.length > 2) {
                // URL에서 섹션 정보 추출 (일반적으로 도메인 다음 부분)
                for (let i = 3; i < Math.min(urlParts.length, 6); i++) {
                    if (urlParts[i] && !urlParts[i].match(/^\d{4}$/) && urlParts[i].length > 2) {
                        extractedFromUrl += ' ' + urlParts[i];
                    }
                }
            }
        }

        // 모든 소스 텍스트 결합
        const combinedText = normalizedCategory + ' ' + normalizedTitle + ' ' + extractedFromUrl;

        // 특별 패턴 먼저 확인
        if (this.specialPatterns) {
            for (const { pattern, category } of this.specialPatterns) {
                if (combinedText.includes(pattern)) {
                    console.log(`   🧩 특별 패턴 매칭: "${pattern}" -> ${category}`);
                    return category;
                }
            }
        }

        // 각 카테고리 규칙에 대해 점수 계산
        const scores = {};

        for (const [category, keywords] of Object.entries(this.categoryRules)) {
            scores[category] = 0;

            for (const keyword of keywords) {
                // 카테고리에서 키워드 발견 시
                if (normalizedCategory.includes(keyword)) {
                    scores[category] += 3; // 카테고리에서 발견 시 가중치 높게
                }

                // 제목에서 키워드 발견 시
                if (normalizedTitle.includes(keyword)) {
                    scores[category] += 2; // 제목에서 발견 시 중간 가중치
                }

                // URL에서 키워드 발견 시
                if (extractedFromUrl.includes(keyword)) {
                    scores[category] += 1; // URL에서 발견 시 낮은 가중치
                }
            }
        }

        // 가장 높은 점수의 카테고리 선택
        let bestCategory = 'OTHER';
        let highestScore = 0;

        for (const [category, score] of Object.entries(scores)) {
            if (score > highestScore) {
                highestScore = score;
                bestCategory = category;
            }
        }

        // 최소 점수 기준 (임계값)
        if (highestScore < 1) {
            // 기본 패턴 확인
            if (combinedText.includes('review') ||
                /\b(phone|tablet|laptop|device|gadget)\b/.test(combinedText)) {
                return 'TECHNOLOGY';
            }

            if (/\b(business|company|profit|sales|revenue|industry)\b/.test(combinedText)) {
                return 'BUSINESS';
            }

            return 'OTHER';
        }

        return bestCategory;
    }
}

module.exports = DynamicCategoryMapper;