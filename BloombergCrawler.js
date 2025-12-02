// BloombergCrawler.js
const { chromium } = require('playwright');
const BaseCrawler = require('./BaseCrawler');
const config = require('./config');
const { normalizeDate, getSourceTimezone } = require('./dateUtils');
class BloombergCrawler extends BaseCrawler {
    constructor() {
        super('BLOOMBERG');
        this.startUrls = config.START_URLS.BLOOMBERG;
    }

    async crawl() {
        console.log('▶ [BLOOMBERG] 뉴스 수집 루프 실행');

        // 처리된 URL 초기화 (DB + 캐시)
        await this.initializeProcessedUrls();

        const browser = await chromium.launch({
            headless: config.CRAWLER.HEADLESS,
            slowMo: config.CRAWLER.SLOW_MO
        });
        const context = await browser.newContext({
            userAgent: config.CRAWLER.USER_AGENT
        });

        try {
            // 각 섹션 페이지 처리
            for (const sectionPage of this.startUrls) {
                console.log(`🌍 [Bloomberg] Loading section: ${sectionPage}`);
                const page = await context.newPage();

                // 페이지 로드 및 에러 처리
                try {
                    await page.goto(sectionPage, {
                        waitUntil: 'domcontentloaded',
                        timeout: config.CRAWLER.TIMEOUT
                    });
                } catch (err) {
                    console.error(`❌ [Bloomberg] 페이지 로드 실패: ${sectionPage}`, err.message);
                    await page.close();
                    continue;
                }

                // 뉴스 링크 선택자 목록 (여러 패턴 시도)
                const linkSelectors = [
                    'article a[href^="/news/articles/"]',
                    'article h3 a[href^="/"]',
                    'a[href^="/news/articles/"]',
                    'a.story-list-story__info__headline-link',
                    'a.headline-link',
                    '.story-package-module__story__headline a',
                    '.story-list-story__headline a',
                    '.story-package-module__story h3 a'
                ];

                let rawList = [];

                // 선택자 순서대로 시도하여 링크 추출
                for (const selector of linkSelectors) {
                    try {
                        rawList = await page.$$eval(
                            selector,
                            links => links.map(a => ({
                                url: a.href.startsWith('/') ? 'https://www.bloomberg.com' + a.href : a.href,
                                title: a.innerText.trim(),
                                publishedAt: new Date().toISOString()
                            }))
                        );

                        if (rawList.length > 0) {
                            console.log(`   ✅ [Bloomberg] 선택자로 ${rawList.length}개 링크 추출 성공: ${selector}`);
                            break;
                        }
                    } catch (err) {
                        console.log(`   ⚠️ [Bloomberg] 선택자 실패: ${selector}`);
                        continue;
                    }
                }

                // 링크가 없으면 다음 섹션으로
                if (rawList.length === 0) {
                    console.warn(`⚠️ [Bloomberg] 링크를 찾을 수 없습니다: ${sectionPage}`);

                    // 페이지 HTML 저장하여 디버깅 (선택 사항)
                    const html = await page.content();
                    console.log(`   🔍 [Bloomberg] 페이지 구조 변경 가능성, 일부 HTML: ${html.substring(0, 500)}...`);

                    await page.close();
                    continue;
                }

                console.log(`   👉 [Bloomberg] 총 ${rawList.length}개 링크 발견`);
                await page.close();

                // URL 필터링 (BaseCrawler의 공통 메서드 사용)
                const batch = this.filterNewUrls(rawList);
                console.log(`⚙ [Bloomberg] ${sectionPage} → ${batch.length}개 신규 기사`);

                // 배치 처리 시작 전에 URL이 이미 처리되었는지 다시 확인
                const confirmedBatch = batch.filter(art => !this.processedUrls.has(art.norm));
                if (confirmedBatch.length < batch.length) {
                    console.log(`   👉 ${batch.length - confirmedBatch.length}개 URL 이미 처리됨, 스킵`);
                }

                // 각 기사 처리
                for (const art of confirmedBatch) {
                    const p = await context.newPage();
                    try {
                        console.log(`   🔍 [Bloomberg] 기사 크롤링: ${art.url}`);
                        await p.goto(art.url, {
                            waitUntil: 'domcontentloaded',
                            timeout: config.CRAWLER.TIMEOUT
                        });

                        // 페이로드 초기화
                        const payload = {
                            title: art.title,
                            content: '',
                            category: '',
                            sourceUrl: art.norm,
                            sourceLanguage: 'EN',
                            author: 'unknown',
                            // publishedAt 필드를 이후에 설정하도록 제거
                            imageUrl: '',
                            source: 'BLOOMBERG',
                            metadata: '{}'
                        };

                        // 1) JSON-LD 파싱 (있는 경우)
                        let jsonLd = {};
                        try {
                            const scripts = await p.$$eval(
                                'script[type="application/ld+json"]',
                                els => els.map(e => e.textContent)
                            );
                            for (const txt of scripts) {
                                const data = JSON.parse(txt);
                                if (data['@type'] === 'NewsArticle' || data['@type'] === 'Article') {
                                    jsonLd = data;
                                    break;
                                }
                            }

                            // JSON-LD에서 publishedAt 추출 시 normalizeDate 사용
                            if (jsonLd.datePublished) {
                                payload.publishedAt = normalizeDate(jsonLd.datePublished, {
                                    sourceTimezone: getSourceTimezone('BLOOMBERG'),
                                    source: 'BLOOMBERG'
                                });
                            } else if (art.publishedAt) {
                                // art 객체에서 가져온 날짜 정보가 있으면 사용
                                payload.publishedAt = normalizeDate(art.publishedAt, {
                                    sourceTimezone: getSourceTimezone('BLOOMBERG'),
                                    source: 'BLOOMBERG'
                                });
                            } else {
                                // 날짜 정보가 없으면 현재 시간 사용
                                payload.publishedAt = normalizeDate(new Date(), {
                                    sourceTimezone: getSourceTimezone('BLOOMBERG'),
                                    source: 'BLOOMBERG'
                                });
                            }

                            // 이미지 URL 추출 (기존 코드 유지)
                            if (jsonLd.image?.url) {
                                payload.imageUrl = jsonLd.image.url;
                            }

                            // 작성자 추출 (기존 코드 유지)
                            if (jsonLd.author?.name) {
                                if (typeof jsonLd.author.name === 'string') {
                                    payload.author = jsonLd.author.name;
                                } else if (Array.isArray(jsonLd.author)) {
                                    // 여러 저자가 배열로 있는 경우
                                    const authors = jsonLd.author.map(a => a.name).filter(Boolean);
                                    if (authors.length > 0) {
                                        payload.author = authors.join(', ');
                                    }
                                }
                            }
                        } catch (err) {
                            console.warn(`⚠️ [Bloomberg] JSON-LD 파싱 실패: ${err.message}`);

                            // JSON-LD 파싱 실패하더라도 날짜 정보 설정
                            if (art.publishedAt) {
                                payload.publishedAt = normalizeDate(art.publishedAt, {
                                    sourceTimezone: getSourceTimezone('BLOOMBERG'),
                                    source: 'BLOOMBERG'
                                });
                            } else {
                                payload.publishedAt = normalizeDate(new Date(), {
                                    sourceTimezone: getSourceTimezone('BLOOMBERG'),
                                    source: 'BLOOMBERG'
                                });
                            }
                        }
                        // 2) 제목 추출 (이미 있으면 생략)
                        if (!payload.title || payload.title.length < 5) {
                            try {
                                // 제목 선택자 목록
                                const titleSelectors = [
                                    'h1.lede-headline',
                                    'h1.headline',
                                    'h1.lede-text-only__headline',
                                    'h1[data-component="headline"]',
                                    'h1',
                                    'meta[property="og:title"]'
                                ];

                                for (const selector of titleSelectors) {
                                    try {
                                        let extractedTitle;

                                        if (selector.includes('meta')) {
                                            // 메타 태그에서 추출
                                            const metaEl = await p.$(selector);
                                            if (metaEl) {
                                                extractedTitle = await metaEl.evaluate(el => el.getAttribute('content'));
                                            }
                                        } else {
                                            // 일반 요소에서 추출
                                            extractedTitle = await p.$eval(selector, el => el.innerText.trim());
                                        }

                                        if (extractedTitle && extractedTitle.length > 5) {
                                            payload.title = extractedTitle;
                                            console.log(`   📰 [Bloomberg] 제목 추출 성공: ${selector}`);
                                            break;
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }

                                // 제목 추출 실패 시 페이지 제목 사용
                                if (!payload.title || payload.title.length < 5) {
                                    payload.title = await p.title();
                                    // Bloomberg 제목 형식 정리
                                    payload.title = payload.title.replace(/\s*-\s*Bloomberg.*$/i, '').trim();
                                    console.log(`   📰 [Bloomberg] 페이지 제목에서 추출: ${payload.title}`);
                                }
                            } catch (err) {
                                console.warn(`⚠️ [Bloomberg] 제목 추출 실패: ${err.message}`);
                            }
                        }

                        // 3) 카테고리/섹션 추출
                        try {
                            // 카테고리 선택자 목록
                            const categorySelectors = [
                                'div.eyebrow a',
                                'div.lede-package-breadcrumb a',
                                'div.Eyebrow_sectionTitle a',
                                'meta[property="article:section"]',
                                '.metadata-info li a',
                                '.lede-text-only__eyebrow a'
                            ];

                            for (const selector of categorySelectors) {
                                try {
                                    let categoryText;

                                    if (selector.includes('meta')) {
                                        // 메타 태그에서 추출
                                        const metaEl = await p.$(selector);
                                        if (metaEl) {
                                            categoryText = await metaEl.evaluate(el => el.getAttribute('content'));
                                        }
                                    } else {
                                        // 일반 요소에서 추출
                                        categoryText = await p.$eval(selector, el => el.innerText.trim());
                                    }

                                    if (categoryText) {
                                        payload.category = categoryText;
                                        console.log(`   🏷️ [Bloomberg] 카테고리 추출 성공: ${selector} -> ${categoryText}`);
                                        break;
                                    }
                                } catch (e) {
                                    continue;
                                }
                            }

                            // URL에서 카테고리 추출 시도 (fallback)
                            if (!payload.category && art.url) {
                                const urlParts = art.url.split('/');
                                if (urlParts.length > 3) {
                                    // 일반적으로 /news/articles/YYYY-MM-DD/title 형식
                                    const pathParts = urlParts.slice(3);
                                    for (const part of pathParts) {
                                        // 날짜 형식이나 ID가 아닌 부분을 카테고리로 추정
                                        if (part && !part.match(/^\d{4}-\d{2}-\d{2}$/) && !part.match(/^[A-Z0-9]{6,}$/)) {
                                            payload.category = part.replace(/-/g, ' ');
                                            console.log(`   🏷️ [Bloomberg] URL에서 카테고리 추출: ${payload.category}`);
                                            break;
                                        }
                                    }
                                }
                            }
                        } catch (err) {
                            console.warn(`⚠️ [Bloomberg] 카테고리 추출 실패: ${err.message}`);
                        }

                        // 4) 작성자 추출 (이미 있으면 생략)
                        if (payload.author === 'unknown') {
                            try {
                                // 1. 일반적인 작성자 선택자들
                                const authorSelectors = [
                                    'div.Byline_bylineAuthors',
                                    'div.byline',
                                    '.byline-and-date',
                                    '.author',
                                    'meta[name="author"]',
                                    '.lede-text-only__byline',
                                    'div.lede-text-only__authors',
                                    '.selected-byline-container'
                                ];

                                for (const selector of authorSelectors) {
                                    try {
                                        let authorText;

                                        if (selector.includes('meta')) {
                                            // 메타 태그에서 추출
                                            const metaEl = await p.$(selector);
                                            if (metaEl) {
                                                authorText = await metaEl.evaluate(el => el.getAttribute('content'));
                                            }
                                        } else {
                                            // 일반 요소에서 추출
                                            authorText = await p.$eval(selector, el => el.innerText.trim());
                                        }

                                        if (authorText) {
                                            // 'By '로 시작하면 제거
                                            payload.author = authorText.replace(/^By\s+/i, '').trim();
                                            console.log(`   👤 [Bloomberg] 작성자 추출 성공: ${selector} -> ${payload.author}`);
                                            break;
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }

                                // 2. 작성자 링크 선택자들
                                if (payload.author === 'unknown') {
                                    const authorLinkSelectors = [
                                        '.author-link',
                                        '.author-list a',
                                        '.byline a',
                                        '.byline-and-date a',
                                        '.lede-text-only__byline a'
                                    ];

                                    for (const selector of authorLinkSelectors) {
                                        try {
                                            // 모든 작성자 링크 수집
                                            const authorLinks = await p.$$eval(selector, links =>
                                                links.map(link => link.innerText.trim()).filter(text => text.length > 0)
                                            );

                                            if (authorLinks && authorLinks.length > 0) {
                                                payload.author = authorLinks.join(', ');
                                                console.log(`   👤 [Bloomberg] 작성자 링크에서 추출 성공: ${selector} -> ${payload.author}`);
                                                break;
                                            }
                                        } catch (e) {
                                            continue;
                                        }
                                    }
                                }

                                // 3. 데이터 속성이나 스크립트에서 작성자 검색
                                if (payload.author === 'unknown') {
                                    try {
                                        // 작성자 데이터 속성
                                        const authorData = await p.$eval(
                                            '[data-author], [data-byline], [data-authors], [data-component="byline"]',
                                            el => el.innerText.trim()
                                        );

                                        if (authorData) {
                                            payload.author = authorData.replace(/^By\s+/i, '').trim();
                                            console.log(`   👤 [Bloomberg] 데이터 속성에서 작성자 추출: ${payload.author}`);
                                        }
                                    } catch (e) {
                                        // 다음 방법 시도
                                    }
                                }

                                // 4. HTML에서 패턴 매칭으로 작성자 추출
                                if (payload.author === 'unknown') {
                                    try {
                                        const html = await p.content();

                                        // 작성자 패턴 매칭
                                        const authorPatterns = [
                                            /<div[^>]*class="[^"]*byline[^"]*"[^>]*>([^<]+)<\/div>/i,
                                            /<span[^>]*class="[^"]*byline[^"]*"[^>]*>([^<]+)<\/span>/i,
                                            /<div[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/div>/i,
                                            /<span[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/span>/i
                                        ];

                                        for (const pattern of authorPatterns) {
                                            const match = html.match(pattern);
                                            if (match && match[1]) {
                                                payload.author = match[1].replace(/^By\s+/i, '').trim();
                                                console.log(`   👤 [Bloomberg] HTML 패턴에서 작성자 추출: ${payload.author}`);
                                                break;
                                            }
                                        }
                                    } catch (e) {
                                        console.warn(`⚠️ [Bloomberg] HTML 작성자 추출 실패: ${e.message}`);
                                    }
                                }

                                // 5. React 구성 요소에서 추출 시도
                                if (payload.author === 'unknown') {
                                    try {
                                        // 일부 Bloomberg 페이지는 데이터를 윈도우 전역 변수에 저장함
                                        const authorData = await p.evaluate(() => {
                                            try {
                                                if (window.__PRELOADED_STATE__ && window.__PRELOADED_STATE__.article) {
                                                    const article = window.__PRELOADED_STATE__.article;
                                                    if (article.authors && article.authors.length > 0) {
                                                        return article.authors.map(a => a.name).join(', ');
                                                    }
                                                    if (article.byline) {
                                                        return article.byline;
                                                    }
                                                }
                                                return null;
                                            } catch (e) {
                                                return null;
                                            }
                                        });

                                        if (authorData) {
                                            payload.author = authorData.replace(/^By\s+/i, '').trim();
                                            console.log(`   👤 [Bloomberg] React 데이터에서 작성자 추출: ${payload.author}`);
                                        }
                                    } catch (e) {
                                        console.warn(`⚠️ [Bloomberg] React 데이터 작성자 추출 실패: ${e.message}`);
                                    }
                                }
                            } catch (err) {
                                console.warn(`⚠️ [Bloomberg] 작성자 추출 처리 실패: ${err.message}`);
                            }
                        }

                        // 5) 본문 내용 추출
                        try {
                            const contentSelectors = [
                                'div.body-content',
                                'div.body-copy',
                                'div.body-copy-v2',
                                'div[data-component="body"]',
                                'article',
                                'div.paywall',
                                'div.story-body-text',
                                'div.body-content-container',
                                'div.body-wrapper'
                            ];

                            for (const selector of contentSelectors) {
                                try {
                                    const contentEl = await p.$(selector);
                                    if (contentEl) {
                                        // 단락 텍스트 수집
                                        const paragraphs = await contentEl.$$eval('p', ps => ps.map(p => p.innerText.trim()).filter(text => text.length > 0));

                                        if (paragraphs.length > 0) {
                                            payload.content = paragraphs.join('\n\n');
                                            console.log(`   📄 [Bloomberg] 본문 추출 성공: ${selector} (${paragraphs.length}개 단락)`);
                                            break;
                                        }
                                    }
                                } catch (e) {
                                    continue;
                                }
                            }

                            // 본문이 없으면 article의 전체 텍스트 시도
                            if (!payload.content || payload.content.length < config.CRAWLER.MIN_CONTENT_LENGTH) {
                                try {
                                    payload.content = await p.$eval('article', el => el.innerText.trim());
                                    console.log(`   📄 [Bloomberg] article 전체 텍스트 추출`);
                                } catch (e) {
                                    console.warn(`⚠️ [Bloomberg] article 추출 실패: ${e.message}`);
                                }
                            }

                            // 그래도 실패하면 HTML 패턴으로 시도
                            if (!payload.content || payload.content.length < config.CRAWLER.MIN_CONTENT_LENGTH) {
                                try {
                                    const html = await p.content();
                                    const paragraphs = html.match(/<p[^>]*>([^<]+)<\/p>/g);
                                    if (paragraphs && paragraphs.length > 0) {
                                        payload.content = paragraphs
                                            .map(p => p.replace(/<\/?p[^>]*>/g, ''))
                                            .filter(text => text.trim().length > 0)
                                            .join('\n\n');
                                        console.log(`   📄 [Bloomberg] HTML 패턴으로 본문 추출 시도`);
                                    }
                                } catch (err) {
                                    console.warn(`⚠️ [Bloomberg] HTML 직접 본문 추출 실패: ${err.message}`);
                                }
                            }
                        } catch (err) {
                            console.warn(`⚠️ [Bloomberg] 본문 추출 처리 실패: ${err.message}`);
                        }

                        // 6) 추출한 메타데이터 저장
                        const metadata = {
                            jsonLd,
                            rawCategory: payload.category, // 원본 카테고리 저장
                            sourceUrl: art.url,
                            crawledAt: new Date().toISOString() // 크롤링 시간은 ISO 문자열로
                        };
                        payload.metadata = JSON.stringify(metadata);

                        // 데이터 유효성 검증
                        if (!payload.title || payload.title.length < 3) {
                            throw new Error('제목이 너무 짧거나 없음');
                        }


                        // API에 전송하고 성공하면 addToCache는 sendArticleToApi 내부에서 처리됨
                        await this.sendArticleToApi(payload);

                    } catch (err) {
                        console.error(`❌ [Bloomberg] 처리 실패: ${art.url}`, err.message);
                        // 오류가 발생해도 캐시에 추가하여 재시도 방지
                        this.addToCache(art.url);
                    } finally {
                        await p.close();
                        await this.randomDelay();
                    }
                }
            }
        } catch (err) {
            console.error('❌ [BLOOMBERG] 크롤링 루프 중 오류 발생:', err.message);
        } finally {
            await browser.close();
            console.log('🛑 [Bloomberg] Browser closed');
        }
    }
}

module.exports = BloombergCrawler;