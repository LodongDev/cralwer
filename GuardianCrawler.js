// GuardianCrawler.js - 전체 코드
const { chromium } = require('playwright');
const BaseCrawler  = require('./BaseCrawler');
const config       = require('./config');
const { normalizeDate, getSourceTimezone } = require('./dateUtils');

class GuardianCrawler extends BaseCrawler {
    constructor() {
        super('GUARDIAN');
        this.startUrls = config.START_URLS.GUARDIAN;
    }

    async crawl() {
        console.log('▶ [GUARDIAN] 뉴스 수집 루프 실행');

        // 처리된 URL 초기화 (DB + 캐시)
        await this.initializeProcessedUrls();

        const browser = await chromium.launch({
            headless: config.CRAWLER.HEADLESS,
            slowMo:   config.CRAWLER.SLOW_MO
        });
        const context = await browser.newContext({
            userAgent: config.CRAWLER.USER_AGENT
        });

        try {
            for (const sectionPage of this.startUrls) {
                console.log(`🌍 [Guardian] Loading section: ${sectionPage}`);
                const page = await context.newPage();
                await page.goto(sectionPage, {
                    waitUntil: 'networkidle',
                    timeout:   config.CRAWLER.TIMEOUT
                });

                // 변경된 리스트 링크 셀렉터로 대기
                const LIST_LINK = 'a[data-link-name*="card-"]';
                await page.waitForSelector(LIST_LINK, { timeout: 10000 }).catch(error => {
                    console.warn(`⚠️ [Guardian] 선택자 대기 실패: ${error.message}`);
                    console.log(`⚠️ [Guardian] 대체 선택자 시도 중...`);
                    // 대체 선택자 목록
                    const alternativeSelectors = [
                        'a.fc-item__link',
                        'div.fc-item a',
                        'div.js-headline-text',
                        'h3.fc-item__title a'
                    ];

                    // 병렬로 모든 대체 선택자 시도
                    return Promise.any(
                        alternativeSelectors.map(selector =>
                            page.waitForSelector(selector, { timeout: 5000 })
                        )
                    ).then(el => {
                        // 성공한 선택자로 LIST_LINK 업데이트
                        const foundSelector = alternativeSelectors.find(s =>
                            el.evaluate(node => node.matches(s))
                        );
                        console.log(`✅ [Guardian] 대체 선택자 발견: ${foundSelector}`);
                        return foundSelector;
                    });
                }).then(selector => selector || LIST_LINK); // 성공한 선택자 또는 기본값

                // ① 전체 링크 수집
                const rawList = await page.$$eval(
                    LIST_LINK,
                    links => links.map(a => ({
                        url:        a.href,
                        title:      a.innerText.trim(),
                        publishedAt: new Date().toISOString()
                    }))
                );
                console.log(`   👉 found ${rawList.length} links on list page`);
                await page.close();

                // ② URL 필터링 (BaseCrawler의 공통 메서드 사용)
                const batch = this.filterNewUrls(rawList);
                console.log(`⚙ [Guardian] ${sectionPage} → ${batch.length} 신규 기사`);

                // 배치 처리 시작 전에 URL이 이미 처리되었는지 다시 확인
                const confirmedBatch = batch.filter(art => !this.processedUrls.has(art.norm));
                if (confirmedBatch.length < batch.length) {
                    console.log(`   👉 ${batch.length - confirmedBatch.length}개 URL 이미 처리됨, 스킵`);
                }

                for (const art of confirmedBatch) {
                    const p = await context.newPage();
                    try {
                        console.log(`   🔍 [Guardian] 기사 크롤링: ${art.url}`);
                        await p.goto(art.url, {
                            waitUntil: 'domcontentloaded',
                            timeout:   config.CRAWLER.TIMEOUT
                        });

                        // JSON-LD 파싱
                        let jsonLd = {};
                        try {
                            const scripts = await p.$$eval(
                                'script[type="application/ld+json"]',
                                els => els.map(e => e.textContent)
                            );
                            for (const txt of scripts) {
                                const data = JSON.parse(txt);
                                if (data['@type'] === 'NewsArticle') {
                                    jsonLd = data;
                                    break;
                                }
                            }
                        } catch (err) {
                            console.warn(`⚠️ [Guardian] JSON-LD 파싱 실패: ${err.message}`);
                        }

                        // 1) author - 다양한 선택자와 패턴으로 작성자 정보 추출 시도
                        let author = 'unknown';

                        // 1-1) JSON-LD에서 작성자 정보 추출 시도
                        if (jsonLd.author?.name) {
                            author = jsonLd.author.name;
                        } else {
                            // 1-2) 여러 선택자 패턴 시도
                            const authorSelectors = [
                                'address[aria-label="Contributor info"] a[rel="author"]',
                                'a[rel="author"]',
                                'a.byline__name',
                                '.byline a',
                                '[data-component="meta-byline"] a',
                                '.dcr-1cfpnlw a',
                                '.contributor-list a',
                                '.author-link',
                                '.content__author-name',
                                'p.byline',
                                '[itemprop="author"]'
                            ];

                            for (const selector of authorSelectors) {
                                try {
                                    const authorEl = await p.$(selector);
                                    if (authorEl) {
                                        author = await authorEl.evaluate(el => el.innerText.replace(/^By\s*/, '').trim());
                                        if (author) break;
                                    }
                                } catch (err) {
                                    console.log(`   🔍 선택자 실패: ${selector}`);
                                    continue;
                                }
                            }

                            // 1-3) innerHTML 분석 시도 (마지막 수단)
                            if (author === 'unknown') {
                                try {
                                    // 전체 HTML을 가져와서 작성자 정보 패턴 찾기
                                    const html = await p.content();
                                    const authorMatches = [
                                        /<a [^>]*rel="author"[^>]*>([^<]+)<\/a>/i,
                                        /<address[^>]*>.*?<a[^>]*>([^<]+)<\/a>/i,
                                        /data-link-name="byline"[^>]*>([^<]+)</i,
                                        /class="byline"[^>]*>([^<]+)</i
                                    ];

                                    for (const regex of authorMatches) {
                                        const match = html.match(regex);
                                        if (match && match[1]) {
                                            author = match[1].replace(/^By\s*/, '').trim();
                                            if (author) break;
                                        }
                                    }
                                } catch (err) {
                                    console.warn(`⚠️ [Guardian] HTML 패턴 작성자 추출 실패: ${err.message}`);
                                }
                            }
                        }

                        console.log(`   👤 [Guardian] 작성자: ${author}`);

                        // 2) publishedAt - 날짜 처리 로직
                        let publishedAt;
                        if (jsonLd.datePublished) {
                            publishedAt = normalizeDate(jsonLd.datePublished, {
                                sourceTimezone: getSourceTimezone('GUARDIAN'),
                                source: 'GUARDIAN'
                            });
                        } else if (art.publishedAt) {
                            publishedAt = normalizeDate(art.publishedAt, {
                                sourceTimezone: getSourceTimezone('GUARDIAN'),
                                source: 'GUARDIAN'
                            });
                        } else {
                            publishedAt = normalizeDate(new Date(), {
                                sourceTimezone: getSourceTimezone('GUARDIAN'),
                                source: 'GUARDIAN'
                            });
                        }

                        // 3) section 및 카테고리 정보 추출
                        let sectionRaw = jsonLd.articleSection || '';
                        if (!sectionRaw) {
                            // 3-1) 여러 선택자로 섹션 정보 추출 시도
                            const sectionSelectors = [
                                'a[data-component="section"] span',
                                'a[data-link-name="article section"] span',
                                'meta[property="article:section"]',
                                '.content__section-label a',
                                '.pillars a',
                                '.primary-tag',
                                '.dcr-1v9e6r1 span',  // 2025년 가디언 구조
                                '[data-link-name="article section"]'
                            ];

                            for (const selector of sectionSelectors) {
                                try {
                                    if (selector.includes('meta')) {
                                        // 메타 태그에서 추출
                                        const metaEl = await p.$(selector);
                                        if (metaEl) {
                                            sectionRaw = await metaEl.evaluate(el => el.getAttribute('content'));
                                        }
                                    } else {
                                        // 일반 요소에서 추출
                                        sectionRaw = await p.$eval(
                                            selector,
                                            e => e.innerText.trim()
                                        );
                                    }

                                    if (sectionRaw) {
                                        console.log(`   🏷️ [Guardian] 섹션 추출 성공: ${selector} -> ${sectionRaw}`);
                                        break;
                                    }
                                } catch (e) {
                                    continue;
                                }
                            }

                            // 3-2) 섹션 추출 실패 시 HTML에서 패턴 찾기
                            if (!sectionRaw) {
                                try {
                                    const html = await p.content();
                                    // 메타 태그에서 섹션 찾기
                                    const metaMatch = html.match(/<meta\s+property="article:section"\s+content="([^"]+)"/i);
                                    if (metaMatch && metaMatch[1]) {
                                        sectionRaw = metaMatch[1];
                                        console.log(`   🏷️ [Guardian] 메타태그 섹션 추출: ${sectionRaw}`);
                                    } else {
                                        // 다른 패턴 찾기
                                        const sectionPatterns = [
                                            /data-link-name="article section"[^>]*><span>([^<]+)<\/span>/i,
                                            /data-component="section"[^>]*><span>([^<]+)<\/span>/i,
                                            /class="content__section-label"[^>]*>([^<]+)<\/a>/i
                                        ];

                                        for (const pattern of sectionPatterns) {
                                            const match = html.match(pattern);
                                            if (match && match[1]) {
                                                sectionRaw = match[1].trim();
                                                console.log(`   🏷️ [Guardian] HTML 패턴 섹션 추출: ${sectionRaw}`);
                                                break;
                                            }
                                        }
                                    }
                                } catch (err) {
                                    console.warn(`⚠️ [Guardian] HTML 섹션 추출 실패: ${err.message}`);
                                }
                            }
                        }

                        // 시리즈 정보도 섹션으로 활용
                        if (!sectionRaw) {
                            try {
                                const seriesElement = await p.$('a[data-component="series"] span');
                                if (seriesElement) {
                                    sectionRaw = await seriesElement.evaluate(el => el.innerText.trim());
                                    console.log(`   🏷️ [Guardian] 시리즈 정보 섹션으로 사용: ${sectionRaw}`);
                                }
                            } catch (e) {
                                // 시리즈 정보 못 찾음, 무시
                            }
                        }

                        console.log(`   🗂️ [Guardian] 최종 섹션: ${sectionRaw || 'None'}`);

                        // 4) 레이아웃 정보 추출
                        let layoutRaw = '';
                        try {
                            layoutRaw = await p.$eval(
                                'main[data-layout]',
                                m => m.getAttribute('data-layout')
                            );
                        } catch {
                            console.log(`   🔧 [Guardian] 레이아웃 정보 없음`);
                        }

                        // 5) 제목 추출
                        let title = art.title;
                        if (!title || title.length < 5) {
                            try {
                                // 여러 선택자로 제목 추출 시도
                                const titleSelectors = [
                                    'h1',
                                    'h1.content__headline',
                                    'h1.dcr-u0152o', // 2025년 가디언 구조
                                    'h1.headline',
                                    '.headline__text',
                                    'title'
                                ];

                                for (const selector of titleSelectors) {
                                    try {
                                        const extractedTitle = await p.$eval(selector, el => el.innerText.trim());
                                        if (extractedTitle && extractedTitle.length > 5) {
                                            title = extractedTitle;
                                            console.log(`   📰 [Guardian] 제목 추출 성공: ${selector}`);
                                            break;
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }

                                // 제목 추출 실패 시 <title> 태그에서 시도
                                if (!title || title.length < 5) {
                                    title = await p.title();
                                    // 가디언 제목 형식 정리 (| The Guardian 부분 제거)
                                    title = title.replace(/\s*\|\s*The\s+Guardian.*$/i, '').trim();
                                    console.log(`   📰 [Guardian] 페이지 제목에서 추출: ${title}`);
                                }
                            } catch (err) {
                                console.warn(`⚠️ [Guardian] 제목 추출 실패: ${err.message}`);
                            }
                        }

                        // 6) content - 여러 선택자 시도
                        let content = '';
                        const contentSelectors = [
                            'div.article-body-commercial-selector p',
                            'div.content__article-body p',
                            'div.article__body p',
                            '.js-article__body p',
                            '.dcr-11jq3zt p',
                            '.article-body p',
                            '.dcr-16w5gq9',  // 2025년 가디언 구조
                            '.content__article-body div p',
                            '[data-component="body"] p',
                            '.article-body-viewer-selector p'
                        ];

                        for (const selector of contentSelectors) {
                            try {
                                content = await p.$eval(
                                    selector,
                                    ps => ps.map(p => p.innerText).join('\n')
                                );
                                if (content.length > 0) {
                                    console.log(`   📄 [Guardian] 본문 추출 성공: ${selector}`);
                                    break;
                                }
                            } catch {
                                continue;
                            }
                        }

                        // 본문이 너무 짧으면 HTML에서 직접 추출 시도
                        if (content.length < config.CRAWLER.MIN_CONTENT_LENGTH) {
                            try {
                                const html = await p.content();
                                const paragraphs = html.match(/<p[^>]*>([^<]+)<\/p>/g);
                                if (paragraphs && paragraphs.length > 0) {
                                    content = paragraphs
                                        .map(p => p.replace(/<\/?p[^>]*>/g, ''))
                                        .join('\n');
                                    console.log(`   📄 [Guardian] 본문 HTML 직접 추출 시도`);
                                }
                            } catch (err) {
                                console.warn(`⚠️ [Guardian] HTML 직접 본문 추출 실패: ${err.message}`);
                            }
                        }

                        if (content.length < config.CRAWLER.MIN_CONTENT_LENGTH) {
                            console.log(`⚠️ [Guardian] 본문 짧음, 스킵: ${art.url}`);
                            // 짧은 내용도 캐시에 추가하여 재시도 방지
                            this.addToCache(art.url);
                            await p.close();
                            continue;
                        }

                        // 7) payload - 원본 카테고리를 그대로 사용
                        // sectionRaw를 category 필드로 전달
                        const payload = {
                            title:          title || art.title,
                            content,
                            category:       sectionRaw, // 원본 카테고리를 그대로 전달
                            sourceUrl:      art.norm,
                            sourceLanguage: 'EN',
                            author,
                            publishedAt,    // normalizeDate로 처리된 ISO 8601 문자열
                            imageUrl:       jsonLd.image?.url || '',
                            source:         'GUARDIAN',
                            metadata:       JSON.stringify({
                                section: sectionRaw,      // 원본 카테고리 저장
                                layout:  layoutRaw,
                                jsonLd,
                                crawledAt: new Date().toISOString() // 크롤링 시간은 ISO 문자열로
                            })
                        };

                        // 데이터 유효성 검사
                        if (!payload.title || payload.title.length < 3) {
                            throw new Error('제목이 너무 짧거나 없음');
                        }
                        if (!payload.content || payload.content.length < config.CRAWLER.MIN_CONTENT_LENGTH) {
                            throw new Error('본문이 너무 짧거나 없음');
                        }

                        // API에 전송하고 성공하면 addToCache는 sendArticleToApi 내부에서 처리됨
                        await this.sendArticleToApi(payload);

                    } catch (err) {
                        console.error(`❌ [Guardian] 처리 실패: ${art.url}`, err.message);
                        // 오류가 발생해도 캐시에 추가하여 재시도 방지
                        this.addToCache(art.url);
                    } finally {
                        await p.close();
                        await this.randomDelay();
                    }
                }
            }
        } catch (err) {
            console.error('❌ [GUARDIAN] 크롤링 루프 중 오류 발생:', err.message);
        } finally {
            await browser.close();
            console.log('🛑 [Guardian] Browser closed');
        }
    }
}

module.exports = GuardianCrawler;