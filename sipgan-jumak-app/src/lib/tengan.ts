// 01. 생년월일 & 일간 계산
// 기획서 리스크 07 — 자체 공식을 하드코딩하지 않고 검증된 만세력 라이브러리(lunar-javascript)로 계산합니다.
import { Solar } from 'lunar-javascript';

// 한자 천간 -> 앱에서 쓰는 한글 명칭(오행 접미사 포함) 매핑
const GAN_MAP: Record<string, string> = {
  '甲': '갑목', '乙': '을목',
  '丙': '병화', '丁': '정화',
  '戊': '무토', '己': '기토',
  '庚': '경금', '辛': '신금',
  '壬': '임수', '癸': '계수',
};

/**
 * 양력 생년월일(YYYY-MM-DD)로부터 일간(日干)을 계산합니다.
 * 시(時)는 입력받지 않으므로 사주팔자 전체가 아니라 일간 한 글자만 산출합니다.
 */
export function calcDayGan(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) throw new Error('날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)');
  const solar = Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();
  const hanja = lunar.getDayGan(); // 甲..癸
  const gan = GAN_MAP[hanja];
  if (!gan) throw new Error(`일간 계산 결과를 매핑할 수 없습니다: ${hanja}`);
  return gan;
}

export const ALL_GAN = Object.values(GAN_MAP);
