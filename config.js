// config.js - 크롤러 공통 설정

const path = require('path');

module.exports = {
    // API 엔드포인트
    // API_BASE_URL: 'http://localhost:17201',
    API_BASE_URL: process.env.API_BASE_URL || 'https://wisecutnews.com',
    API_ENDPOINTS: {
        GET_RECENT_URLS: '/api/wisecutnews-api/cral/recent-urls',
        POST_ARTICLE: '/api/wisecutnews-api/cral'
    },

    // 크롤러 공통 설정
    CRAWLER: {
        HEADLESS: false,
        SLOW_MO: 300,
        TIMEOUT: 60000,
        MIN_CONTENT_LENGTH: 100,
        USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        DELAY_MIN: 1000,
        DELAY_MAX: 5000,
        // 오늘 날짜만 남길 로컬 캐시 디렉토리
        CACHE_DIR: path.join(__dirname, 'cache')
    },

    // 캐시 파일명 매핑
    CACHE_FILES: {
        BBC: 'bbc.txt',
        BLOOMBERG: 'bloomberg.txt',
        GUARDIAN: 'guardian.txt'
    },

    // 크롤링 시작 URL
    START_URLS: {
        BBC: [
            'https://www.bbc.com/news',
            'https://www.bbc.com/business',
            'https://www.bbc.com/innovation'
        ],
        GUARDIAN: [
            'https://www.theguardian.com/uk/technology',
            'https://www.theguardian.com/uk/business',
            'https://www.theguardian.com/world',
            'https://www.theguardian.com/world/europe-news',
            'https://www.theguardian.com/us-news',
            'https://www.theguardian.com/world/americas',
            'https://www.theguardian.com/world/asia',
            'https://www.theguardian.com/australia-news',
            'https://www.theguardian.com/world/middleeast'
        ],
        BLOOMBERG: [
            'https://www.bloomberg.com/economics',
            'https://www.bloomberg.com/industries',
            'https://www.bloomberg.com/technology',
            'https://www.bloomberg.com/politics'
        ]
    }
};