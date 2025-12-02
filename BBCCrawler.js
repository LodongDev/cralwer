// BBCCrawler.js - fetchProcessedUrls 구현 추가
const { chromium } = require('playwright');
const BaseCrawler = require('./BaseCrawler');
const config = require('./config');
const { URL } = require('url');
const axios = require('axios'); // API 호출을 위한 axios
const { normalizeDate, getSourceTimezone } = require('./dateUtils');

// ✅ URL 정규화 유틸 추가 (필요시)
const normalizeUrl = require('./normalizeUrl');


class BBCCrawler extends BaseCrawler {
    constructor() {
        super('BBC');

        // 크롤링할 BBC 섹션 목록
        this.startUrls = [
            'https://www.bbc.com',
            'https://www.bbc.com/news',
            'https://www.bbc.com/business',
            'https://www.bbc.com/technology',
            'https://www.bbc.com/future',
            'https://www.bbc.com/culture',
            'https://www.bbc.com/travel'
        ];

        // 선택자 및 패턴 시스템 설정
        this.selectors = {
            links: {
                core: [
                    'div.nw-c-top-stories a[href*="/news/"]',
                    'div.gs-c-promo a[href*="/news/"]',
                    'div.gel-layout a[href*="/news/"]',
                    'a.media__link[href*="/news/"]',
                    'a.block-link__overlay-link[href*="/news/"]',
                    'li.media-list__item a[href*="/news/"]',
                    'div.most-popular a[href*="/news/"]'
                ],
                extended: [
                    'div.nw-c-most-read a',
                    'div.nw-c-related-items a',
                    'ol.gs-u-m0 a',
                    'ul.gs-u-m0 a',
                    'div.container a[href*="/news/"]',
                    'div.gs-c-promo-body a',
                    'div.gel-layout-item a'
                ],
                fallback: [
                    'a[href*="/news/"]',
                    'a[href*="/business/"]',
                    'a[href*="/technology/"]',
                    'a[href*="/world/"]',
                    'a[href*="/uk/"]'
                ]
            },
            title: {
                core: [
                    'h1[id="main-heading"]',
                    'h1.story-headline',
                    'h1.vxp-media__headline',
                    'h1.ssrcss-rt5wpz-Headline',
                    'meta[property="og:title"]'
                ],
                extended: [
                    'h1.story-body__h1',
                    'h1.article-heading',
                    'h1.ssrcss-15xko80-StyledHeading',
                    'h1.container-title'
                ],
                fallback: [
                    'title',
                    'h1'
                ]
            },
            content: {
                core: [
                    'article[role="main"]',
                    'main[role="main"]',
                    'div[data-component="text-block"]',
                    'div.story-body',
                    'div[property="articleBody"]'
                ],
                extended: [
                    'div.story-body__inner',
                    'div.article__body',
                    'div.responsive-story-body',
                    'div.story-article',
                    'div.story'
                ],
                fallback: [
                    'article',
                    'main',
                    'div.body'
                ]
            },
            author: {
                core: [
                    'div[data-component="byline-block"] span',
                    'div.author-unit__content span',
                    'span.byline__name',
                    'meta[name="author"]'
                ],
                extended: [
                    'div.story-byline span',
                    'div.byline span',
                    'div.author-unit span',
                    'p.byline'
                ],
                fallback: [
                    'div[data-component="byline"]',
                    'div.byline'
                ]
            },
            date: {
                core: [
                    'time[datetime]',
                    'div[data-testid="timestamp"] time',
                    'div.date'
                ],
                extended: [
                    'div.publication-date time',
                    'div.published-date span',
                    'div.article-date'
                ],
                fallback: [
                    'meta[property="article:published_time"]',
                    'meta[name="publish-date"]',
                    'div[data-testid="timestamp"]'
                ]
            },
            image: {
                core: [
                    'meta[property="og:image"]',
                    'div[data-component="image-block"] img',
                    'div.story-image img',
                    'img.article-hero-image'
                ],
                extended: [
                    'figure.media-with-caption img',
                    'div.vxp-media__player img',
                    'div.article-figure img',
                    'div.image-and-copyright-container img'
                ],
                fallback: [
                    'article img',
                    'main img',
                    'figure img'
                ]
            }
        };

        this.patterns = {
            title: [
                /<meta\s+property=['"]og:title['"][^>]*content=['"]([^'"]+)['"]/i,
                /<title>(.*?)(?:\s*[-|]\s*BBC(?:\s*News)?)?<\/title>/i,
                /<h1[^>]*>(.*?)<\/h1>/i
            ],
            author: [
                /byline[^>]*>(?:[^<]*by\s+)?([^<]+)/i,
                /author[^>]*>([^<]+)/i,
                /author['"][^>]*content=['"]([^'"]+)['"]/i
            ],
            date: [
                /datetime=['"]([^'"]+)['"]/i,
                /datePublished['"][^>]*content=['"]([^'"]+)['"]/i,
                /published_time['"][^>]*content=['"]([^'"]+)['"]/i
            ],
            paragraph: /<p[^>]*>((?:(?!<\/p>).)*)<\/p>/gi,
            removals: [
                /BBC News App[^\n]*/g,
                /Related Topics[^\n]*/g,
                /More on this story[^\n]*/g,
                /Top Stories[^\n]*/g,
                /Around the BBC[^\n]*/g,
                /More Videos from the BBC[^\n]*/g
            ]
        };

        this.URL_PATTERNS = {
            ARTICLE: [
                /bbc\.com\/news\/[a-z-]+-\d+/i,
                /bbc\.co\.uk\/news\/[a-z-]+-\d+/i,
                /bbc\.com\/[a-z]+\/[a-z-]+-\d+/i,
                /bbc\.co\.uk\/[a-z]+\/[a-z-]+-\d+/i
            ],
            IGNORE: [
                /bbc\.com\/news\/av\//i,
                /bbc\.co\.uk\/news\/av\//i,
                /bbc\.com\/news\/live\//i,
                /bbc\.co\.uk\/news\/live\//i,
                /bbc\.com\/news\/topics\//i
            ]
        };
    }

    // 새로 추가: DB에서 처리된 URL 가져오기
    async fetchProcessedUrls() {
        try {
            console.log('🔍 [BBC] DB에서 처리된 URL 목록 가져오기 시작');

            // 로컬 개발용 빈 배열 반환 (실제 환경에서는 DB 쿼리로 대체)
            if (config.ENVIRONMENT === 'development' || !config.API || !config.API.BASE_URL) {
                console.log('🔍 [BBC] 개발 환경: 빈 URL 목록 반환');
                return [];
            }

            // API 엔드포인트 구성
            const apiUrl = `${config.API.BASE_URL}/api/news/processed-urls`;

            // API 요청 설정
            const response = await axios.get(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${config.API.KEY}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    source: 'BBC',
                    limit: 1000 // 최대 1000개 URL 요청
                }
            });

            // 응답 확인
            if (response.status !== 200) {
                console.warn(`⚠️ [BBC] API 응답 오류: ${response.status}`);
                return [];
            }

            const urls = response.data.urls || [];
            console.log(`✅ [BBC] DB에서 ${urls.length}개 URL 조회 완료`);
            return urls;

        } catch (error) {
            console.error(`❌ [BBC] DB URL 조회 오류:`, error.message);
            // 에러 발생 시 빈 배열 반환 (크롤링은 계속 진행)
            return [];
        }
    }

    // 새로 추가: API로 기사 전송
    async sendArticleToApi(payload) {
        try {
            // 로컬 개발용 성공 반환 (실제 환경에서는 API 요청으로 대체)
            if (config.ENVIRONMENT === 'development' || !config.API || !config.API.BASE_URL) {
                console.log('🔍 [BBC] 개발 환경: API 전송 시뮬레이션 (성공)');
                return true;
            }

            // API 엔드포인트 구성
            const apiUrl = `${config.API.BASE_URL}/api/news/articles`;

            // API 요청 설정
            const response = await axios.post(apiUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${config.API.KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            // 응답 확인
            if (response.status !== 201 && response.status !== 200) {
                console.error(`❌ [BBC] API 응답 오류: ${response.status}`);
                return false;
            }

            console.log(`✅ [BBC] API 전송 성공: ${payload.title}`);
            return true;

        } catch (error) {
            console.error(`❌ [BBC] API 전송 오류:`, error.message);
            return false;
        }
    }

    // URL 정규화 함수
    normalizeUrl(url) {
        if (!url) return '';

        // 이미 정규화된 URL이면 그대로 반환
        if (url.startsWith('https://www.bbc.com/') || url.startsWith('https://www.bbc.co.uk/')) {
            return url;
        }

        try {
            // URL 파싱
            const parsedUrl = new URL(url);

            // 중복 도메인 수정 (bbc.bbc.com -> bbc.com)
            let hostname = parsedUrl.hostname;
            if (hostname.includes('bbc.bbc.')) {
                hostname = hostname.replace('bbc.bbc.', 'bbc.');
            }

            // 표준 형식으로 변환
            if (hostname.includes('bbc.com') || hostname.includes('bbc.co.uk')) {
                // 프로토콜을 https로 강제, www 추가
                const standardHost = hostname.startsWith('www.') ? hostname : `www.${hostname}`;
                const path = parsedUrl.pathname;

                // 해시 및 쿼리 파라미터 제거, trailing slash 제거
                return `https://${standardHost}${path}`.replace(/\/$/, '');
            }

            return url;
        } catch (e) {
            console.warn(`⚠️ [BBC] URL 정규화 실패: ${url}`);
            return url;
        }
    }

    // URL이 기사인지 확인
    isArticleUrl(url) {
        if (!url) return false;

        try {
            // 먼저 무시할 패턴 확인
            for (const pattern of this.URL_PATTERNS.IGNORE) {
                if (pattern.test(url)) {
                    return false;
                }
            }

            // 다음으로 기사 패턴 확인
            for (const pattern of this.URL_PATTERNS.ARTICLE) {
                if (pattern.test(url)) {
                    return true;
                }
            }

            // 추가 검증: /news/ 또는 특정 섹션과 숫자 ID 포함
            if ((url.includes('/news/') ||
                    url.includes('/business/') ||
                    url.includes('/technology/') ||
                    url.includes('/world/')) &&
                /\d{6,}/.test(url)) {
                return true;
            }

            return false;
        } catch (e) {
            console.warn(`⚠️ [BBC] 기사 URL 확인 실패: ${url}`);
            return false;
        }
    }

    // 링크 추출 함수
    async extractLinks(page) {
        let allLinks = [];

        // 1단계: 핵심 선택자로 링크 추출 시도
        for (const selector of this.selectors.links.core) {
            try {
                const links = await page.$$eval(selector, links =>
                    links.map(link => ({
                        url: link.href,
                        title: link.innerText.trim() || link.title || link.getAttribute('aria-label') || ''
                    }))
                );

                const validLinks = links.filter(link =>
                    link.url && (link.url.includes('bbc.com') || link.url.includes('bbc.co.uk'))
                );

                if (validLinks.length > 0) {
                    console.log(`   ✅ [BBC] 핵심 선택자로 ${validLinks.length}개 링크 추출: ${selector}`);
                    allLinks.push(...validLinks);

                    // 충분한 링크를 찾으면 중단
                    if (allLinks.length >= 15) break;
                }
            } catch (e) {
                continue;
            }
        }

        // 2단계: 충분한 링크를 못 찾은 경우 확장 선택자 시도
        if (allLinks.length < 5) {
            for (const selector of this.selectors.links.extended) {
                try {
                    const links = await page.$$eval(selector, links =>
                        links.map(link => ({
                            url: link.href,
                            title: link.innerText.trim() || link.title || link.getAttribute('aria-label') || ''
                        }))
                    );

                    const validLinks = links.filter(link =>
                        link.url && (link.url.includes('bbc.com') || link.url.includes('bbc.co.uk'))
                    );

                    if (validLinks.length > 0) {
                        console.log(`   ✅ [BBC] 확장 선택자로 ${validLinks.length}개 링크 추출: ${selector}`);
                        allLinks.push(...validLinks);

                        // 충분한 링크를 찾으면 중단
                        if (allLinks.length >= 15) break;
                    }
                } catch (e) {
                    continue;
                }
            }
        }

        // 3단계: 여전히 충분한 링크가 없으면 폴백 선택자 시도
        if (allLinks.length === 0) {
            for (const selector of this.selectors.links.fallback) {
                try {
                    const links = await page.$$eval(selector, links =>
                        links.map(link => ({
                            url: link.href,
                            title: link.innerText.trim() || link.title || link.getAttribute('aria-label') || ''
                        }))
                    );

                    const validLinks = links.filter(link =>
                        link.url && (link.url.includes('bbc.com') || link.url.includes('bbc.co.uk'))
                    );

                    if (validLinks.length > 0) {
                        console.log(`   ✅ [BBC] 폴백 선택자로 ${validLinks.length}개 링크 추출: ${selector}`);
                        allLinks.push(...validLinks);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
        }

        // 중복 제거 및 형식화
        const uniqueLinks = Array.from(
            new Map(allLinks.map(link => [link.url, link])).values()
        ).map(link => ({
            url: link.url,
            title: link.title,
            publishedAt: new Date().toISOString()
        }));

        console.log(`   👉 [BBC] 총 ${uniqueLinks.length}개 링크 발견`);
        return uniqueLinks;
    }

    // 제목 추출 함수
    async extractTitle(page, existingTitle = '') {
        if (existingTitle && existingTitle.length > 5) {
            return existingTitle;
        }

        try {
            // 1. 핵심 선택자 시도
            for (const selector of this.selectors.title.core) {
                try {
                    let extractedTitle;

                    if (selector.includes('meta')) {
                        // 메타 태그에서 추출
                        const metaEl = await page.$(selector);
                        if (metaEl) {
                            extractedTitle = await metaEl.evaluate(el => el.getAttribute('content'));
                        }
                    } else {
                        // 일반 요소에서 추출
                        extractedTitle = await page.$eval(selector, el => el.innerText.trim());
                    }

                    if (extractedTitle && extractedTitle.length > 5) {
                        console.log(`   📰 [BBC] 제목 추출 성공 (핵심): ${selector}`);
                        return extractedTitle;
                    }
                } catch (e) {
                    continue;
                }
            }

            // 2. 확장 선택자 시도
            for (const selector of this.selectors.title.extended) {
                try {
                    let extractedTitle;

                    if (selector.includes('meta')) {
                        const metaEl = await page.$(selector);
                        if (metaEl) {
                            extractedTitle = await metaEl.evaluate(el => el.getAttribute('content'));
                        }
                    } else {
                        extractedTitle = await page.$eval(selector, el => el.innerText.trim());
                    }

                    if (extractedTitle && extractedTitle.length > 5) {
                        console.log(`   📰 [BBC] 제목 추출 성공 (확장): ${selector}`);
                        return extractedTitle;
                    }
                } catch (e) {
                    continue;
                }
            }

            // 3. 폴백 선택자 시도
            for (const selector of this.selectors.title.fallback) {
                try {
                    let extractedTitle;

                    if (selector.includes('meta')) {
                        const metaEl = await page.$(selector);
                        if (metaEl) {
                            extractedTitle = await metaEl.evaluate(el => el.getAttribute('content'));
                        }
                    } else {
                        extractedTitle = await page.$eval(selector, el => el.innerText.trim());
                    }

                    if (extractedTitle && extractedTitle.length > 5) {
                        console.log(`   📰 [BBC] 제목 추출 성공 (폴백): ${selector}`);

                        // 페이지 제목인 경우 BBC 부분 제거
                        if (selector === 'title') {
                            extractedTitle = extractedTitle.replace(/\s*-\s*BBC.*$/i, '').trim();
                        }

                        return extractedTitle;
                    }
                } catch (e) {
                    continue;
                }
            }

            // 4. HTML 패턴 시도
            const html = await page.content();
            for (const pattern of this.patterns.title) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    const cleanTitle = match[1].trim().replace(/\s*-\s*BBC.*$/i, '').trim();
                    if (cleanTitle.length > 5) {
                        console.log(`   📰 [BBC] HTML 패턴으로 제목 추출: ${cleanTitle}`);
                        return cleanTitle;
                    }
                }
            }

            return existingTitle || 'Untitled BBC Article';
        } catch (err) {
            console.warn(`⚠️ [BBC] 제목 추출 실패: ${err.message}`);
            return existingTitle || 'Untitled BBC Article';
        }
    }

    // 본문 내용 추출 함수
    async extractContent(page) {
        try {
            // 1. 핵심 선택자로 시도
            for (const selector of this.selectors.content.core) {
                try {
                    const contentEl = await page.$(selector);
                    if (contentEl) {
                        const paragraphs = await contentEl.$$eval('p', ps =>
                            ps.map(p => p.innerText.trim()).filter(text => text.length > 0)
                        );

                        if (paragraphs.length > 0) {
                            const content = paragraphs.join('\n\n');
                            console.log(`   📄 [BBC] 본문 추출 성공 (핵심): ${selector} (${paragraphs.length}개 단락)`);
                            return content;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            // 2. 확장 선택자로 시도
            for (const selector of this.selectors.content.extended) {
                try {
                    const contentEl = await page.$(selector);
                    if (contentEl) {
                        const paragraphs = await contentEl.$$eval('p', ps =>
                            ps.map(p => p.innerText.trim()).filter(text => text.length > 0)
                        );

                        if (paragraphs.length > 0) {
                            const content = paragraphs.join('\n\n');
                            console.log(`   📄 [BBC] 본문 추출 성공 (확장): ${selector} (${paragraphs.length}개 단락)`);
                            return content;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            // 3. 폴백 선택자로 시도
            for (const selector of this.selectors.content.fallback) {
                try {
                    const contentEl = await page.$(selector);
                    if (contentEl) {
                        const paragraphs = await contentEl.$$eval('p', ps =>
                            ps.map(p => p.innerText.trim()).filter(text => text.length > 0)
                        );

                        if (paragraphs.length > 0) {
                            const content = paragraphs.join('\n\n');
                            console.log(`   📄 [BBC] 본문 추출 성공 (폴백): ${selector} (${paragraphs.length}개 단락)`);
                            return content;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            // 4. HTML 패턴으로 시도
            try {
                const html = await page.content();
                const paragraphs = html.match(this.patterns.paragraph);
                if (paragraphs && paragraphs.length > 0) {
                    const content = paragraphs
                        .map(p => p.replace(/<\/?p[^>]*>/g, ''))
                        .filter(text => text.trim().length > 0)
                        .join('\n\n');

                    if (content.length > config.CRAWLER.MIN_CONTENT_LENGTH) {
                        console.log(`   📄 [BBC] HTML 패턴으로 본문 추출 성공 (${paragraphs.length}개 단락)`);
                        return content;
                    }
                }
            } catch (err) {
                console.warn(`⚠️ [BBC] HTML 직접 본문 추출 실패: ${err.message}`);
            }

            return '';
        } catch (err) {
            console.warn(`⚠️ [BBC] 본문 추출 처리 실패: ${err.message}`);
            return '';
        }
    }

    // 작성자 추출 함수
    async extractAuthor(page, jsonLd = null) {
        // 1. JSON-LD에서 추출 시도
        if (jsonLd && jsonLd.author) {
            if (typeof jsonLd.author === 'string' && jsonLd.author !== 'BBC News' && jsonLd.author !== 'BBC') {
                return jsonLd.author;
            } else if (jsonLd.author.name && jsonLd.author.name !== 'BBC News' && jsonLd.author.name !== 'BBC') {
                return jsonLd.author.name;
            } else if (Array.isArray(jsonLd.author)) {
                const authors = jsonLd.author
                    .map(a => a.name || a)
                    .filter(name => name && name !== 'BBC News' && name !== 'BBC');

                if (authors.length > 0) {
                    return authors.join(', ');
                }
            }
        }

        try {
            // 2. 핵심 작성자 선택자 시도
            for (const selector of this.selectors.author.core) {
                try {
                    let authorText;

                    if (selector.includes('meta')) {
                        const metaEl = await page.$(selector);
                        if (metaEl) {
                            authorText = await metaEl.evaluate(el => el.getAttribute('content'));
                        }
                    } else {
                        authorText = await page.$eval(selector, el => el.innerText.trim());
                    }

                    if (authorText) {
                        // 'By '로 시작하면 제거
                        const cleanAuthor = authorText.replace(/^By\s+/i, '').trim();
                        if (cleanAuthor !== 'BBC News' && cleanAuthor !== 'BBC') {
                            console.log(`   👤 [BBC] 작성자 추출 성공 (핵심): ${selector} -> ${cleanAuthor}`);
                            return cleanAuthor;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            // 3. 확장 작성자 선택자 시도
            for (const selector of this.selectors.author.extended) {
                try {
                    let authorText;

                    if (selector.includes('meta')) {
                        const metaEl = await page.$(selector);
                        if (metaEl) {
                            authorText = await metaEl.evaluate(el => el.getAttribute('content'));
                        }
                    } else {
                        authorText = await page.$eval(selector, el => el.innerText.trim());
                    }

                    if (authorText) {
                        // 'By '로 시작하면 제거
                        const cleanAuthor = authorText.replace(/^By\s+/i, '').trim();
                        if (cleanAuthor !== 'BBC News' && cleanAuthor !== 'BBC') {
                            console.log(`   👤 [BBC] 작성자 추출 성공 (확장): ${selector} -> ${cleanAuthor}`);
                            return cleanAuthor;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            // 4. HTML 패턴 매칭으로 작성자 추출
            try {
                const html = await page.content();

                for (const pattern of this.patterns.author) {
                    const match = html.match(pattern);
                    if (match && match[1]) {
                        const cleanAuthor = match[1].replace(/^By\s+/i, '').trim();
                        if (cleanAuthor !== 'BBC News' && cleanAuthor !== 'BBC') {
                            console.log(`   👤 [BBC] HTML 패턴에서 작성자 추출: ${cleanAuthor}`);
                            return cleanAuthor;
                        }
                    }
                }
            } catch (e) {
                console.warn(`⚠️ [BBC] HTML 작성자 추출 실패: ${e.message}`);
            }

            // 5. 폴백 작성자 선택자 시도
            for (const selector of this.selectors.author.fallback) {
                try {
                    let authorText;

                    if (selector.includes('meta')) {
                        const metaEl = await page.$(selector);
                        if (metaEl) {
                            authorText = await metaEl.evaluate(el => el.getAttribute('content'));
                        }
                    } else {
                        authorText = await page.$eval(selector, el => el.innerText.trim());
                    }

                    if (authorText) {
                        // 'By '로 시작하면 제거
                        const cleanAuthor = authorText.replace(/^By\s+/i, '').trim();
                        if (cleanAuthor !== 'BBC News' && cleanAuthor !== 'BBC') {
                            console.log(`   👤 [BBC] 작성자 추출 성공 (폴백): ${selector} -> ${cleanAuthor}`);
                            return cleanAuthor;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            return 'BBC News';
        } catch (err) {
            console.warn(`⚠️ [BBC] 작성자 추출 처리 실패: ${err.message}`);
            return 'BBC News';
        }
    }

    // 이미지 URL 추출 함수
    async extractImageUrl(page, jsonLd = null) {
        // 1. JSON-LD에서 추출
        if (jsonLd) {
            if (jsonLd.image) {
                if (typeof jsonLd.image === 'string') {
                    return jsonLd.image;
                } else if (jsonLd.image.url) {
                    return jsonLd.image.url;
                }
            }
        }

        try {
            // 2. OG 이미지 태그 확인
            try {
                const ogImage = await page.$eval('meta[property="og:image"]', meta => meta.getAttribute('content'));
                if (ogImage && ogImage.length > 10) {
                    console.log(`   🖼️ [BBC] OG 이미지 발견: ${ogImage}`);
                    return ogImage;
                }
            } catch (e) {
                // 다음 방법 시도
            }

            // 3. 핵심 이미지 선택자 시도
            for (const selector of this.selectors.image.core) {
                try {
                    const imgSrc = await page.$eval(selector, img =>
                        img.src || img.getAttribute('src') || img.getAttribute('content')
                    );

                    if (imgSrc && imgSrc.length > 10 && !imgSrc.includes('data:image')) {
                        console.log(`   🖼️ [BBC] 이미지 선택자로 발견 (핵심): ${selector}`);
                        return imgSrc;
                    }
                } catch (e) {
                    continue;
                }
            }

            // 4. 확장 이미지 선택자 시도
            for (const selector of this.selectors.image.extended) {
                try {
                    const imgSrc = await page.$eval(selector, img =>
                        img.src || img.getAttribute('src') || img.getAttribute('content')
                    );

                    if (imgSrc && imgSrc.length > 10 && !imgSrc.includes('data:image')) {
                        console.log(`   🖼️ [BBC] 이미지 선택자로 발견 (확장): ${selector}`);
                        return imgSrc;
                    }
                } catch (e) {
                    continue;
                }
            }

            // 5. 폴백 이미지 선택자 시도
            for (const selector of this.selectors.image.fallback) {
                try {
                    const imgSrc = await page.$eval(selector, img =>
                        img.src || img.getAttribute('src') || img.getAttribute('content')
                    );

                    if (imgSrc && imgSrc.length > 10 && !imgSrc.includes('data:image')) {
                        console.log(`   🖼️ [BBC] 이미지 선택자로 발견 (폴백): ${selector}`);
                        return imgSrc;
                    }
                } catch (e) {
                    continue;
                }
            }

            return '';
        } catch (err) {
            console.warn(`⚠️ [BBC] 이미지 URL 추출 실패: ${err.message}`);
            return '';
        }
    }

    // 발행일 추출 함수
    async extractPublishedDate(page, jsonLd = null, existingDate = null) {
        // 로그 함수는 그대로 유지
        const logDateInfo = (source, dateStr, parsedDate) => {
            console.log(`   📅 [BBC] 날짜 정보 (${source}):`);
            console.log(`      - 원본 문자열: "${dateStr}"`);
            console.log(`      - 파싱된 시간: ${parsedDate}`);
            console.log(`      - ISO 문자열(UTC): ${parsedDate.toISOString()}`);
            console.log(`      - 로컬 시간: ${parsedDate.toString()}`);
        };

        // 1. 이미 존재하는 날짜가 있으면 normalizeDate 사용
        if (existingDate) {
            return normalizeDate(existingDate, {
                sourceTimezone: getSourceTimezone('BBC'),
                source: 'BBC',
                addLogging: true
            });
        }

        // 2. JSON-LD에서 추출
        if (jsonLd && jsonLd.datePublished) {
            return normalizeDate(jsonLd.datePublished, {
                sourceTimezone: getSourceTimezone('BBC'),
                source: 'BBC',
                addLogging: true
            });
        }

        // 3. 메타 태그 확인
        const metaSelectors = [
            'meta[property="article:published_time"]',
            'meta[name="datePublished"]',
            'meta[name="date"]',
            'meta[property="og:article:published_time"]'
        ];

        for (const selector of metaSelectors) {
            try {
                const dateStr = await page.$eval(selector, meta => meta.getAttribute('content'));
                if (dateStr) {
                    return normalizeDate(dateStr, {
                        sourceTimezone: getSourceTimezone('BBC'),
                        source: 'BBC',
                        addLogging: true
                    });
                }
            } catch (e) {
                continue;
            }
        }

        // 4. 핵심 날짜 선택자 시도
        for (const selector of this.selectors.date.core) {
            try {
                const element = await page.$(selector);
                if (element) {
                    // datetime 속성 확인
                    const datetime = await element.evaluate(el => el.getAttribute('datetime'));
                    if (datetime) {
                        return normalizeDate(datetime, {
                            sourceTimezone: getSourceTimezone('BBC'),
                            source: 'BBC',
                            addLogging: true
                        });
                    }

                    // 텍스트 콘텐츠 확인
                    const textContent = await element.evaluate(el => el.textContent.trim());
                    if (textContent) {
                        return normalizeDate(textContent, {
                            sourceTimezone: getSourceTimezone('BBC'),
                            source: 'BBC',
                            addLogging: true
                        });
                    }
                }
            } catch (e) {
                continue;
            }
        }

        // 5. 확장 날짜 선택자 시도 (기존 로직 유지, normalizeDate 적용)
        for (const selector of this.selectors.date.extended) {
            try {
                const element = await page.$(selector);
                if (element) {
                    // datetime 속성 확인
                    const datetime = await element.evaluate(el => el.getAttribute('datetime') || el.getAttribute('content'));
                    if (datetime) {
                        return normalizeDate(datetime, {
                            sourceTimezone: getSourceTimezone('BBC'),
                            source: 'BBC'
                        });
                    }

                    // 텍스트 콘텐츠 확인
                    const textContent = await element.evaluate(el => el.textContent.trim());
                    if (textContent) {
                        return normalizeDate(textContent, {
                            sourceTimezone: getSourceTimezone('BBC'),
                            source: 'BBC'
                        });
                    }
                }
            } catch (e) {
                continue;
            }
        }

        // 6. HTML 패턴 매칭 시도 (기존 로직 유지, normalizeDate 적용)
        try {
            const html = await page.content();

            for (const pattern of this.patterns.date) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    const dateStr = match[1].trim();
                    return normalizeDate(dateStr, {
                        sourceTimezone: getSourceTimezone('BBC'),
                        source: 'BBC'
                    });
                }
            }
        } catch (e) {
            console.warn(`⚠️ [BBC] HTML 날짜 추출 실패: ${e.message}`);
        }

        // 7. 폴백 날짜 선택자 시도 (기존 로직 유지, normalizeDate 적용)
        for (const selector of this.selectors.date.fallback) {
            try {
                const element = await page.$(selector);
                if (element) {
                    // datetime 속성 확인
                    const datetime = await element.evaluate(el => el.getAttribute('datetime') || el.getAttribute('content'));
                    if (datetime) {
                        return normalizeDate(datetime, {
                            sourceTimezone: getSourceTimezone('BBC'),
                            source: 'BBC'
                        });
                    }

                    // 텍스트 콘텐츠 확인
                    const textContent = await element.evaluate(el => el.textContent.trim());
                    if (textContent) {
                        return normalizeDate(textContent, {
                            sourceTimezone: getSourceTimezone('BBC'),
                            source: 'BBC'
                        });
                    }
                }
            } catch (e) {
                continue;
            }
        }

        // 기본값: 현재 시간
        console.log(`   📅 [BBC] 날짜 추출 실패, 현재 시간으로 기본값 설정`);
        return normalizeDate(new Date(), {
            sourceTimezone: getSourceTimezone('BBC'),
            source: 'BBC'
        });
    }

    // 카테고리 추출 함수 - 간소화된 버전
    async extractCategory(page, url) {
        if (!url) return 'news';

        try {
            // 1. 기본 카테고리 선택자
            const categorySelectors = [
                'div.article__topics a',
                'div.tags-container a',
                'ul.tags li a',
                'footer section[data-component="topics-list"] li a',
                'section[data-component="topics-list"] li a'
            ];

            for (const selector of categorySelectors) {
                try {
                    const categories = await page.$$eval(selector, tags =>
                        tags.map(tag => tag.innerText.trim())
                            .filter(text =>
                                text.length > 0 &&
                                !['home', 'news', 'sport', 'business', 'bbc news', 'bbc'].includes(text.toLowerCase())
                            )
                    );

                    if (categories && categories.length > 0) {
                        const categoryString = categories.slice(0, 3).join(', ');
                        console.log(`   🏷️ [BBC] 카테고리 추출 성공: ${categoryString}`);
                        return categoryString;
                    }
                } catch (e) {
                    continue;
                }
            }

            // 2. 메타 키워드 확인
            try {
                const keywordsContent = await page.$eval('meta[name="keywords"]', meta => meta.getAttribute('content'));
                if (keywordsContent) {
                    const keywords = keywordsContent.split(',')
                        .map(k => k.trim())
                        .filter(k => k.length > 0);

                    if (keywords.length > 0) {
                        const categoryString = keywords.slice(0, 3).join(', ');
                        console.log(`   🏷️ [BBC] 메타 키워드에서 카테고리 추출: ${categoryString}`);
                        return categoryString;
                    }
                }
            } catch (e) {
                // 계속 진행
            }

            // 3. URL 경로 분석
            try {
                const parsedUrl = new URL(url);
                const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

                if (pathParts.length > 0) {
                    console.log(`   🏷️ [BBC] URL에서 기본 카테고리 추출: ${pathParts[0]}`);
                    return pathParts[0];
                }
            } catch (e) {
                console.warn(`⚠️ [BBC] URL 카테고리 추출 실패: ${e.message}`);
            }

            // 기본 카테고리
            return 'news';
        } catch (e) {
            console.warn(`⚠️ [BBC] 카테고리 추출 실패: ${e.message}`);
            return 'news';
        }
    }

    // JSON-LD 메타데이터 추출 함수
    async extractJsonLd(page) {
        try {
            const scripts = await page.$$eval(
                'script[type="application/ld+json"]',
                els => els.map(e => e.textContent)
            );

            for (const txt of scripts) {
                try {
                    const data = JSON.parse(txt);
                    if (data['@type'] === 'NewsArticle' || data['@type'] === 'Article') {
                        return data;
                    } else if (Array.isArray(data) && data[0] &&
                        (data[0]['@type'] === 'NewsArticle' || data[0]['@type'] === 'Article')) {
                        return data[0];
                    }
                } catch (e) {
                    continue;
                }
            }

            return null;
        } catch (err) {
            console.warn(`⚠️ [BBC] JSON-LD 파싱 실패: ${err.message}`);
            return null;
        }
    }

    // 안전한 랜덤 지연 함수
    async randomDelay() {
        const delay = 1000 + Math.random() * 2000;
        console.log(`⏱️ [BBC] ${Math.round(delay/1000)}초 대기 중...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // 메인 크롤링 함수
    async crawl() {
        console.log('▶ [BBC] 뉴스 수집 루프 실행');

        // 1. DB에서 이미 처리된 URL 가져오기
        const processedUrlsFromDb = await this.fetchProcessedUrls();

        // 정규화된 URL로 변환 (비교를 위해)
        const normalizedDbUrls = processedUrlsFromDb.map(url => this.normalizeUrl(url));

        // Set으로 변환하여 O(1) 조회 가능하게 함 - 더 효율적인 중복 확인
        const dbUrlSet = new Set(normalizedDbUrls);

        console.log(`✅ [BBC] DB에서 ${processedUrlsFromDb.length}개 URL 조회`);
        console.log(`✅ [BBC] 정규화 후 ${normalizedDbUrls.length}개 URL`);

        // BBC 도메인이 포함된 URL만 필터링하여 로그 (디버깅용)
        const bbcUrlsFromDb = normalizedDbUrls.filter(url =>
            url.includes('bbc.com') || url.includes('bbc.co.uk')
        );
        console.log(`✅ [BBC] DB에서 BBC 도메인 URL ${bbcUrlsFromDb.length}개`);

        // 샘플 URL 출력 (최대 5개) - 디버깅 용이성 향상
        if (bbcUrlsFromDb.length > 0) {
            const sampleUrls = bbcUrlsFromDb.slice(0, 5);
            console.log(`📊 [BBC] DB의 BBC URL 샘플: ${sampleUrls.join(', ')}`);
        }

        const browser = await chromium.launch({
            headless: config.CRAWLER.HEADLESS,
            slowMo: config.CRAWLER.SLOW_MO
        });

        const context = await browser.newContext({
            userAgent: config.CRAWLER.USER_AGENT
        });

        try {
            // 이번 세션에서 처리한 URL 추적용 Set (중복 방지)
            const sessionProcessedUrls = new Set();

            // 각 섹션 페이지 처리
            for (const sectionUrl of this.startUrls) {
                console.log(`🌍 [BBC] 섹션 접속 중: ${sectionUrl}`);
                const page = await context.newPage();

                // 페이지 로드 및 에러 처리
                try {
                    await page.goto(sectionUrl, {
                        waitUntil: 'domcontentloaded',
                        timeout: config.CRAWLER.TIMEOUT
                    });
                } catch (err) {
                    console.error(`❌ [BBC] 페이지 로드 실패: ${sectionUrl}`, err.message);
                    await page.close();
                    continue;
                }

                // 쿠키 동의 배너 처리
                try {
                    const cookieButton = await page.$('[data-testid="banner-button-agree"]');
                    if (cookieButton) {
                        await cookieButton.click();
                        await page.waitForTimeout(1000);
                    }
                } catch (e) {
                    // 쿠키 배너 없어도 계속 진행
                }

                // 뉴스 링크 수집 - 계층형 선택자 활용 (견고성 유지)
                const rawList = await this.extractLinks(page);
                await page.close();

                // 유효한 BBC 기사 URL만 필터링
                const validUrls = rawList
                    .filter(item => this.isArticleUrl(item.url))
                    .map(item => ({
                        ...item,
                        normalizedUrl: this.normalizeUrl(item.url)
                    }));

                console.log(`⚙ [BBC] ${sectionUrl} → ${validUrls.length}개 유효한 기사 링크 확인`);

                // 2. 신규 URL 필터링 (DB에 없는 URL)
                const newUrls = [];

                for (const art of validUrls) {
                    // DB에 있거나 이번 세션에서 이미 처리했으면 건너뛰기
                    if (dbUrlSet.has(art.normalizedUrl) || sessionProcessedUrls.has(art.normalizedUrl)) {
                        console.log(`   ⚠️ [BBC] 중복 URL 제외: ${art.url}`);
                    } else {
                        newUrls.push(art);
                        // 세션 처리 목록에 추가 (단일 세션 내 중복 방지)
                        sessionProcessedUrls.add(art.normalizedUrl);
                        console.log(`   ✅ [BBC] 신규 URL 발견: ${art.url}`);
                    }
                }

                console.log(`⚙ [BBC] ${sectionUrl} → ${newUrls.length}개 신규 기사`);

                // 신규 URL이 없으면 다음 섹션으로
                if (newUrls.length === 0) {
                    console.log(`   ℹ️ [BBC] ${sectionUrl} → 신규 기사 없음, 다음 섹션으로 진행`);
                    continue;
                }

                // 3. 신규 URL만 크롤링 처리
                for (const art of newUrls) {
                    const p = await context.newPage();
                    try {
                        console.log(`   🔍 [BBC] 기사 크롤링: ${art.url}`);

                        // 페이지 로드 및 재시도
                        try {
                            await p.goto(art.url, {
                                timeout: config.CRAWLER.TIMEOUT,
                                waitUntil: 'domcontentloaded'
                            });
                        } catch (err) {
                            console.log(`   ⚠️ [BBC] 첫 번째 로드 실패, 재시도: ${err.message}`);
                            await p.goto(art.url, {
                                timeout: config.CRAWLER.TIMEOUT * 2,
                                waitUntil: 'load'
                            });
                        }

                        // 메타데이터 및 콘텐츠 추출 (견고한 추출 방식 유지)
                        const jsonLd = await this.extractJsonLd(p);
                        const title = await this.extractTitle(p, art.title);
                        const content = await this.extractContent(p);
                        const author = await this.extractAuthor(p, jsonLd);
                        const publishedAt = await this.extractPublishedDate(p, jsonLd, art.publishedAt);
                        const imageUrl = await this.extractImageUrl(p, jsonLd);
                        const category = await this.extractCategory(p, art.url);

                        // 내용이 너무 짧으면 스킵
                        if (!content || content.length < config.CRAWLER.MIN_CONTENT_LENGTH) {
                            console.log(`⚠️ [BBC] 본문 짧음 (${content?.length || 0}자), 스킵: ${art.url}`);
                            await p.close();
                            continue;
                        }

                        // 중복 도메인 수정 (bbc.bbc.com -> bbc.com)
                        let cleanUrl = art.url;
                        if (art.url && art.url.includes('bbc.bbc.')) {
                            cleanUrl = art.url.replace('bbc.bbc.', 'bbc.');
                        }

                        // 페이로드 생성
                        const payload = {
                            title: title,
                            content: content,
                            category: category,
                            sourceUrl: art.normalizedUrl,
                            sourceLanguage: 'EN',
                            author: author,
                            publishedAt: publishedAt,
                            imageUrl: imageUrl,
                            source: 'BBC',
                            metadata: JSON.stringify({
                                jsonLd: jsonLd,
                                rawUrl: art.url,
                                crawledAt: new Date().toISOString()
                            })
                        };

                        // 내용 정리 (불필요한 텍스트 제거)
                        if (payload.content) {
                            for (const pattern of this.patterns.removals) {
                                payload.content = payload.content.replace(pattern, '');
                            }
                            payload.content = payload.content.trim();
                        }

                        // 유효성 검사
                        if (!payload.title || payload.title.length < 3) {
                            throw new Error('제목이 너무 짧거나 없음');
                        }

                        // API로 전송
                        const success = await this.sendArticleToApi(payload);
                        if (success) {
                            console.log(`   ✅ [BBC] 기사 전송 성공: ${art.url}`);
                        } else {
                            console.error(`   ❌ [BBC] API 전송 실패: ${art.url}`);
                        }

                    } catch (err) {
                        console.error(`❌ [BBC] 처리 실패: ${art.url}`, err.message);
                    } finally {
                        await p.close();
                        await this.randomDelay();
                    }
                }

                // 섹션 간 지연
                await this.randomDelay();
            }

            // 세션 요약 출력
            console.log(`📈 [BBC] 세션 완료 - 처리된 신규 URL: ${sessionProcessedUrls.size}개`);

        } catch (err) {
            console.error('❌ [BBC] 크롤링 루프 중 오류 발생:', err.message);
        } finally {
            await browser.close();
            console.log('🛑 [BBC] 브라우저 닫힘');
        }
    }
}

module.exports = BBCCrawler;