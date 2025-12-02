// dateUtils.js - 날짜 처리를 위한 유틸리티 모듈

/**
 * 다양한 형식의 날짜 문자열을 Instant(ISO 8601 UTC) 형식으로 정규화하는 모듈
 * 백엔드에서 Instant 형식 요구사항에 맞춘 변환을 제공
 */

/**
 * 날짜 문자열을 Instant와 호환되는 ISO 8601 형식의 UTC 시간으로 변환
 * @param {string|Date} dateInput - 변환할 날짜 문자열 또는 Date 객체
 * @param {Object} options - 변환 옵션
 * @param {string} options.sourceTimezone - 원본 시간대 식별자 (예: 'Europe/London')
 * @param {boolean} options.addLogging - 로깅 추가 여부
 * @param {string} options.source - 크롤러 소스 식별자 (예: 'BBC')
 * @return {string} - ISO 8601 형식의 날짜 문자열 (Instant와 호환)
 */
function normalizeDate(dateInput, options = {}) {
    const {
        sourceTimezone = 'UTC',
        addLogging = true,
        source = 'GENERIC'
    } = options;

    try {
        // 원본 입력값 저장
        const originalInput = dateInput;

        // Date 객체인 경우 그대로 사용
        if (dateInput instanceof Date) {
            if (!isNaN(dateInput.getTime())) {
                const isoString = dateInput.toISOString();
                if (addLogging) {
                    console.log(`   📅 [${source}] Date 객체를 ISO 8601로 변환: ${isoString}`);
                }
                return isoString;
            } else {
                if (addLogging) {
                    console.warn(`⚠️ [${source}] 유효하지 않은 Date 객체`);
                }
                return new Date().toISOString();
            }
        }

        // 입력값이 없는 경우 현재 시간
        if (!dateInput) {
            const now = new Date().toISOString();
            if (addLogging) {
                console.log(`   📅 [${source}] 날짜 입력값 없음, 현재 시간 사용: ${now}`);
            }
            return now;
        }

        // 상대 시간 표현 처리 (예: "3 hours ago", "5 minutes ago")
        const lowerText = String(dateInput).toLowerCase();
        let relativeDate = null;
        const now = new Date();

        if (lowerText.includes('minute') || lowerText.includes('min')) {
            const minutes = parseInt(lowerText.match(/\d+/)?.[0] || '0', 10);
            relativeDate = new Date(now.getTime() - minutes * 60000);
            if (addLogging) {
                console.log(`   📅 [${source}] 상대 시간(분) 변환: "${dateInput}" → ${minutes}분 전`);
            }
        } else if (lowerText.includes('hour')) {
            const hours = parseInt(lowerText.match(/\d+/)?.[0] || '0', 10);
            relativeDate = new Date(now.getTime() - hours * 3600000);
            if (addLogging) {
                console.log(`   📅 [${source}] 상대 시간(시간) 변환: "${dateInput}" → ${hours}시간 전`);
            }
        } else if (lowerText.includes('day')) {
            const days = parseInt(lowerText.match(/\d+/)?.[0] || '0', 10);
            relativeDate = new Date(now.getTime() - days * 86400000);
            if (addLogging) {
                console.log(`   📅 [${source}] 상대 시간(일) 변환: "${dateInput}" → ${days}일 전`);
            }
        }

        // 상대 시간이 있으면 사용, 없으면 원본 파싱 시도
        const date = relativeDate || new Date(dateInput);

        // 유효한 날짜인지 확인
        if (isNaN(date.getTime())) {
            if (addLogging) {
                console.warn(`⚠️ [${source}] 유효하지 않은 날짜: ${dateInput}`);
            }
            return new Date().toISOString();
        }

        // ISO 8601 형식(UTC)으로 변환 - Instant와 호환됨
        const isoString = date.toISOString();

        if (addLogging) {
            console.log(`   📅 [${source}] 날짜 정보:`);
            console.log(`      - 원본: "${originalInput}"`);
            console.log(`      - 변환된 ISO: ${isoString}`);
            console.log(`      - 소스 시간대: ${sourceTimezone}`);
        }

        return isoString;
    } catch (e) {
        if (addLogging) {
            console.warn(`⚠️ [${source}] 날짜 변환 실패: ${dateInput}, ${e.message}`);
        }
        return new Date().toISOString();
    }
}

/**
 * 신문사별 적절한 시간대 정보를 반환
 * @param {string} source - 신문사 식별자
 * @return {string} - 시간대 식별자
 */
function getSourceTimezone(source) {
    const timezones = {
        'BBC': 'Europe/London',
        'GUARDIAN': 'Europe/London',
        'BLOOMBERG': 'America/New_York',
        'NYT': 'America/New_York',
        'CNN': 'America/New_York',
        'ALJAZEERA': 'Asia/Qatar',
        'REUTERS': 'Europe/London',
        'AP': 'America/New_York'
    };

    return timezones[source] || 'UTC';
}

module.exports = {
    normalizeDate,
    getSourceTimezone
};