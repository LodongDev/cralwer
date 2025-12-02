// bbcSelectors.js
/**
 * BBC 웹사이트 선택자 통합 파일
 * 계층형 구조로 선택자 제공
 * @version 2.0.0
 * @lastUpdated 2025-05-09
 */

// 핵심 선택자 (우선 시도)
const CORE_SELECTORS = {
    // 링크 추출용 선택자 (헤드라인 및 주요 기사 링크)
    links: [
        'a[data-testid="internal-link"]',
        'a.gs-c-promo-heading',
        'a[data-entityid*="headline"]',
        'a[href*="/news/articles/"]',
        'a[href*="/news/world-"]',
        'a[href*="/news/uk-"]',
        'a[href*="/news/business-"]',
        'a.ssrcss-1mrs5ns-PromoLink',
        'a.nw-o-link-split__anchor',
        'a.ssrcss-1yjs8hb-PromoLink',
        'a.ssrcss-rl2iw9-PromoLink'
    ],

    // 제목 추출용 선택자
    title: [
        'h1[id="main-heading"]',
        'h1.ssrcss-1pl2zfy-StyledHeading',
        'h1.ssrcss-gcq6xq-StyledHeading',
        'h1.story-body__h1',
        'meta[property="og:title"]',
        'title'
    ],

    // 본문 추출용 선택자
    content: [
        'article[data-component="text-block"]',
        'div[data-component="text-block"]',
        'div.ssrcss-11r1m41-RichTextComponentWrapper',
        'div.ssrcss-uf6wea-RichTextComponentWrapper',
        'div.story-body__inner',
        'main article p',
        'article[role="main"] p'
    ],

    // 날짜 추출용 선택자
    date: [
        'time[data-testid="timestamp"]',
        'div.ssrcss-1hizueh-MetadataStrip time',
        'div.ssrcss-1n8af2-MetadataStrip time',
        'div[data-testid="metadata-strip"] time',
        'meta[property="article:published_time"]'
    ],

    // 작성자 추출용 선택자
    author: [
        'div[data-component="byline-block"] span',
        'div.ssrcss-68pt20-Text-TextContributorName',
        'span[data-testid="byline-name"]',
        'span.byline__name',
        'div[data-testid="byline"]',
        'meta[name="author"]',
        'footer [data-testid="authors"]'
    ],

    // 카테고리 추출용 선택자
    category: [
        'a[href^="/news/"][data-testid="section-label"] span',
        'span[data-testid="section-label"]',
        'span.ssrcss-1yno9a1-ConversationSectionLabel',
        'div.ssrcss-17eznxx-SectionLabel span',
        'a[data-entityid="section-label"]',
        'meta[property="article:section"]',
        'div.section-theme span',
    ],


    // 이미지 추출용 선택자
    image: [
        'meta[property="og:image"]',
        'figure img',
        'div[data-component="image-block"] img',
        'div.ssrcss-11kpz0x-Figure img',
        'img.ssrcss-evoj7m-Image'
    ]
};

// 확장 선택자 (핵심 선택자 실패 시 시도)
const EXTENDED_SELECTORS = {
    // 추가 링크 선택자
    links: [
        // 2024년 구조 선택자
        'article h3 a[href^="/"]',
        'a.story-list-story__info__headline-link',
        'a.headline-link',
        '.story-package-module__story__headline a',
        '.story-list-story__headline a',

        // 컨테이너 선택자
        '.nw-c-top-stories a',
        '.gs-c-promo a',
        'div.ssrcss-1f3bvyz-PromoContentSummary a',
        'div.ssrcss-1skpq5o-PromoContent a',
        'div.gs-c-promo-body a',
        '.nw-c-most-read__items a',
        '.most-popular__list a',

        // 더 일반적인 링크 선택자
        'a[href*="/world/"]',
        'a[href*="/uk/"]',
        'a[href*="/business/"]'
    ],

    // 확장 제목 선택자
    title: [
        'h1[data-component="headline"]',
        'h1.article-headline',
        'h1[class*="heading"]',
        'h1[class*="title"]',
        'h1[data-testid*="title"]',
        'meta[name="twitter:title"]'
    ],

    // 확장 본문 선택자
    content: [
        'div.ssrcss-2kny6m-RichTextContainer',
        'div.ssrcss-7ohn0c-ArticleWrapper',
        'div.story-body',
        'div.article__body',
        'div[class*="ArticleWrapper"]',
        'div[class*="article-body"]',
        'div[class*="RichText"]',
        'article p'
    ],

    // 확장 날짜 선택자
    date: [
        'span.ssrcss-1ftkyw1-MetadataText',
        'div.date',
        'span.date',
        '[data-testid*="date"]',
        '[data-testid*="time"]',
        'meta[name="datePublished"]',
        'meta[name="date"]',
        'meta[property="og:article:published_time"]'
    ],

    // 확장 작성자 선택자
    author: [
        'div.ssrcss-df0jm2-MetadataText',
        'a[rel="author"]',
        'div.byline',
        'div.article__byline',
        'div.ssrcss-l2utv2-ContributorWrapper',
        '[class*="byline"]',
        '[class*="author"]',
        '[class*="contributor"]',
        'meta[property="article:author"]'
    ],

    // 확장 카테고리 선택자
    category: [
        // Use nth-child(2) to skip "Home" in breadcrumbs
        'a[data-testid="breadcrumb"]:nth-child(2)',
        'nav.ssrcss-1kczfdm-StyledNav a:nth-child(2)',
        'div.nw-c-breadcrumbs a:nth-child(2)',
        'div.ssrcss-1qjs98k-MetadataLinkWrapper a:nth-child(2)',
        // Use more specific class-based selectors
        'div[class*="Metadata"] span:first-child',
        'div[class*="section"] span',
        'div[class*="Section"] span',
        '[class*="section-label"]',
    ],


    // 확장 이미지 선택자
    image: [
        'div.ssrcss-hrw3iz-Figure img',
        'picture img',
        'article img:first-of-type',
        'div.article__body img:first-of-type',
        '[class*="figure"] img',
        '[class*="image"] img',
        'img[class*="main-image"]',
        'meta[name="twitter:image"]'
    ]
};

// 폴백 선택자 (최후의 수단)
const FALLBACK_SELECTORS = {
    links: ['a[href*="/news/"]', 'a[href*="/articles/"]', 'a'], // 모든 링크
    title: ['h1', 'title'], // 기본 제목 선택자
    content: ['article', 'main', 'div.body-content'], // 기본 콘텐츠 선택자
    date: ['time', 'meta[itemprop="datePublished"]'], // 기본 날짜 선택자
    author: ['meta[name="author"]', 'a[rel="author"]', '[class*="author"]'], // 기본 작성자 선택자
    category: [
        // Remove 'nav a:first-child' which gets "Home"
        'meta[property="og:article:section"]',
        'meta[name="article:section"]',
        'meta[name="section"]',
        'meta[name="category"]',
        // Use second breadcrumb item which is typically the category
        'nav a:nth-child(2)',
    ],
    image: ['meta[property="og:image"]', 'article img:first-child', 'img'] // 기본 이미지 선택자
};

// HTML 패턴 매칭을 위한 정규식
const PATTERNS = {
    // 제목 패턴
    title: [
        /<h1[^>]*>(.*?)<\/h1>/i,
        /<meta\s+property="og:title"\s+content="([^"]+)"/i,
        /<title>(.*?)<\/title>/i
    ],

    // 작성자 패턴
    author: [
        /<div[^>]*class="[^"]*byline[^"]*"[^>]*>([^<]+)<\/div>/i,
        /<span[^>]*class="[^"]*byline[^"]*"[^>]*>([^<]+)<\/span>/i,
        /<div[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/div>/i,
        /<span[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/span>/i,
        /<meta\s+name="author"\s+content="([^"]+)"/i
    ],

    // 날짜 패턴
    date: [
        /<time[^>]*datetime="([^"]+)"[^>]*>/i,
        /<meta\s+property="article:published_time"\s+content="([^"]+)"/i,
        /<div[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)<\/div>/i
    ],

    // 본문 단락 패턴
    paragraph: /<p[^>]*>([^<]+)<\/p>/g,

    // 불필요한 콘텐츠 패턴 (제거 대상)
    removals: [
        /Subscribe to.+?newsletter.+?\./gi,
        /Related Topics.+$/s,
        /More on this story.+$/s,
        /Share this article.+$/s,
        /Follow BBC News.+$/s,
        /Read more about.+$/s,
        /Top Stories.+$/s
    ]
};

// URL 패턴 (기사 URL 판별용)
const URL_PATTERNS = {
    // 기사 URL 패턴
    articles: [
        /\/articles\/[a-z0-9-]+/i,         // /news/articles/c123456789
        /\/article\/[a-z0-9-]+/i,          // /news/article/some-title-123
        /\/[a-z]+-[0-9]{8,}/i,             // /news/world-asia-12345678
        /\/[a-z]+-[0-9]{8,}-[a-z0-9-]+/i,  // /news/uk-12345678-title
        /\/news\/[a-z-]+-\d+/i,            // /news/title-12345
        /\/news\/[a-z-]+-[a-z0-9-]+\d+/i   // /news/title-something-12345
    ],

    // 제외할 URL 패턴
    exclude: [
        /\/news\/topics\//i,           // 토픽 페이지
        /\/news\/war-in-ukraine$/i,    // 전쟁 특집 페이지
        /\/news\/us-canada$/i,         // 국가 섹션 페이지
        /\/news\/uk$/i,                // 국가 섹션 페이지
        /\/news\/world\/[a-z_-]+$/i,   // 월드 섹션 페이지
        /\/news\/in_pictures$/i,       // 사진 섹션 페이지
        /\/news\/bbcindepth$/i,        // BBC 심층 섹션
        /\/news\/bbcverify$/i,         // BBC 검증 섹션
        /\/news\/coronavirus$/i,       // 코로나 특집 페이지
        /\/news\/live\//i,             // 라이브 페이지
        /\/news\/have-your-say\//i     // 여론 페이지
    ],

    // 추가 탐색할 URL 패턴 (인덱스 페이지)
    index: [
        /\/news$/i,                    // 뉴스 홈
        /\/news\/world$/i,             // 월드 뉴스 홈
        /\/news\/business$/i,          // 비즈니스 뉴스 홈
        /\/news\/technology$/i         // 기술 뉴스 홈
    ]
};

/**
 * URL이 유효한 BBC 기사인지 확인
 * @param {string} url - 확인할 URL
 * @returns {boolean} - 기사 여부
 */
function isArticleUrl(url) {
    if (!url) return false;

    // 직접 기사인지 확인하는 패턴 (하나라도 매치되면 기사로 간주)
    if (URL_PATTERNS.articles.some(pattern => pattern.test(url))) {
        return true;
    }

    // 제외할 URL 패턴 (하나라도 매치되면 기사가 아님)
    if (URL_PATTERNS.exclude.some(pattern => pattern.test(url))) {
        return false;
    }

    try {
        // URL 세그먼트 분석
        const urlObj = new URL(url);
        const pathSegments = urlObj.pathname.split('/').filter(Boolean);

        // 단순 섹션 URL 필터링 (너무 짧은 경로)
        if (pathSegments.length <= 1) {
            return false;
        }

        // articles 또는 article이 세그먼트에 있으면 기사
        if (pathSegments.includes('articles') || pathSegments.includes('article')) {
            return true;
        }

        // 마지막 세그먼트가 숫자나 ID 패턴이면 기사일 가능성 높음
        const lastSegment = pathSegments[pathSegments.length - 1];
        if (/\d/.test(lastSegment) || /^[a-z0-9]{6,}$/i.test(lastSegment)) {
            return true;
        }
    } catch (e) {
        // URL 파싱 오류 시 기본값 false 반환
        return false;
    }

    // 기본 false 반환
    return false;
}

/**
 * URL 정규화 함수 - 중복 도메인 문제 해결
 * @param {string} raw - 원본 URL
 * @returns {string} - 정규화된 URL
 */
function normalizeUrl(raw) {
    try {
        if (!raw) return '';

        // URL 정규화
        const url = new URL(raw.trim());

        // 호스트 정규화 - 중복 도메인 문제 해결 (www.bbc.bbc.com -> www.bbc.com)
        let host = url.hostname.toLowerCase();

        // 중복 도메인 수정
        if (host.includes('bbc.bbc.')) {
            host = host.replace('bbc.bbc.', 'bbc.');
        }

        // 경로 정규화 (후행 슬래시 제거)
        let path = url.pathname;
        if (path.endsWith('/') && path.length > 1) {
            path = path.slice(0, -1);
        }

        // 정규화된 URL 반환
        return `${url.protocol}//${host}${path}`;
    } catch (error) {
        console.error(`❌ [BBC] URL 정규화 중 오류 (${raw}):`, error);
        return raw; // 오류 시 원본 반환
    }
}

// 계층형 선택자 구조 생성 - 이 부분이 중요합니다!
const HIERARCHICAL_SELECTORS = {
    links: {
        core: CORE_SELECTORS.links,
        extended: EXTENDED_SELECTORS.links,
        fallback: FALLBACK_SELECTORS.links,
        all: [...CORE_SELECTORS.links, ...EXTENDED_SELECTORS.links, ...FALLBACK_SELECTORS.links]
    },
    title: {
        core: CORE_SELECTORS.title,
        extended: EXTENDED_SELECTORS.title,
        fallback: FALLBACK_SELECTORS.title,
        all: [...CORE_SELECTORS.title, ...EXTENDED_SELECTORS.title, ...FALLBACK_SELECTORS.title]
    },
    content: {
        core: CORE_SELECTORS.content,
        extended: EXTENDED_SELECTORS.content,
        fallback: FALLBACK_SELECTORS.content,
        all: [...CORE_SELECTORS.content, ...EXTENDED_SELECTORS.content, ...FALLBACK_SELECTORS.content]
    },
    date: {
        core: CORE_SELECTORS.date,
        extended: EXTENDED_SELECTORS.date,
        fallback: FALLBACK_SELECTORS.date,
        all: [...CORE_SELECTORS.date, ...EXTENDED_SELECTORS.date, ...FALLBACK_SELECTORS.date]
    },
    author: {
        core: CORE_SELECTORS.author,
        extended: EXTENDED_SELECTORS.author,
        fallback: FALLBACK_SELECTORS.author,
        all: [...CORE_SELECTORS.author, ...EXTENDED_SELECTORS.author, ...FALLBACK_SELECTORS.author]
    },
    category: {
        core: CORE_SELECTORS.category,
        extended: EXTENDED_SELECTORS.category,
        fallback: FALLBACK_SELECTORS.category,
        all: [...CORE_SELECTORS.category, ...EXTENDED_SELECTORS.category, ...FALLBACK_SELECTORS.category]
    },
    image: {
        core: CORE_SELECTORS.image,
        extended: EXTENDED_SELECTORS.image,
        fallback: FALLBACK_SELECTORS.image,
        all: [...CORE_SELECTORS.image, ...EXTENDED_SELECTORS.image, ...FALLBACK_SELECTORS.image]
    }
};

// 모듈 내보내기
module.exports = {
    // 선택자 구조
    CORE: CORE_SELECTORS,
    EXTENDED: EXTENDED_SELECTORS,
    FALLBACK: FALLBACK_SELECTORS,

    // 계층화된 선택자 (BBCCrawler 연동용) - 이 부분이 중요합니다!
    SELECTORS: HIERARCHICAL_SELECTORS,

    // 현재 BBCCrawler와의 호환성을 위한 평면 구조
    FLAT_SELECTORS: {
        links: CORE_SELECTORS.links,
        title: CORE_SELECTORS.title,
        content: CORE_SELECTORS.content,
        author: CORE_SELECTORS.author,
        date: CORE_SELECTORS.date,
        image: CORE_SELECTORS.image,
        category: CORE_SELECTORS.category
    },

    // 패턴
    PATTERNS,

    // URL 패턴
    URL_PATTERNS,

    // 유틸리티 함수
    isArticleUrl,
    normalizeUrl
};