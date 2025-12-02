// normalizeUrl.js
/**
 * 강력한 URL 정규화 함수
 * - 프로토콜 표준화 (http/https)
 * - 대소문자 통일
 * - 'www.' 처리
 * - 쿼리 파라미터 제거
 * - 프래그먼트(해시) 제거
 * - 후행 슬래시 제거
 * - URL 인코딩 이슈 처리
 * - 잘못된 URL 처리
 */
function normalizeUrl(rawUrl) {
    if (!rawUrl) return '';

    try {
        // 1. 기본 전처리
        let url = rawUrl.trim().toLowerCase();

        // 2. 프로토콜 표준화
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url.replace(/^\/\//, '');
        }

        // 3. URL 객체 생성
        const urlObj = new URL(url);

        // 4. 도메인 표준화 ('www.' 제거 또는 필요에 따라 추가)
        // Guardian의 경우 www가 없는 형태로 표준화
        urlObj.hostname = urlObj.hostname.replace(/^www\./, '');

        // 5. 쿼리 파라미터 및 해시 제거
        urlObj.search = '';
        urlObj.hash = '';

        // 6. 결과 생성 및 후행 슬래시 제거
        let result = urlObj.toString();
        result = result.replace(/\/$/, '');

        // 7. URL 디코딩하여 퍼센트 인코딩 일관성 제공
        try {
            // 일부 문자는 디코딩하되, 유효한 URL 문자만 유지
            result = decodeURIComponent(result);
        } catch (e) {
            // 디코딩 실패 시 원래 URL 유지
        }

        return result;
    } catch (e) {
        console.warn(`⚠️ URL 정규화 실패 (${e.message}): ${rawUrl}`);
        // 실패 시 기본 정규화 시도
        return rawUrl.trim()
            .toLowerCase()
            .replace(/\s+/g, '')  // 공백 제거
            .replace(/\/$/, '');  // 후행 슬래시 제거
    }
}

module.exports = normalizeUrl;