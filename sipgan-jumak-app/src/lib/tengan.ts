// 01. 생년월일 & 일주(日柱) 계산
// 기획서 리스크 07 — 자체 공식을 하드코딩하지 않고 검증된 만세력 라이브러리(lunar-javascript)로 계산합니다.
// v0.8 — 일간(천간) 10종만으로는 추천 폭이 좁아, 일지(지지)까지 계산해 60갑자 일주 단위로 확장합니다.
import { Solar } from 'lunar-javascript';

// 한자 천간 -> 앱에서 쓰는 한글 명칭(오행 접미사 포함) 매핑
const GAN_MAP: Record<string, string> = {
  '甲': '갑목', '乙': '을목',
  '丙': '병화', '丁': '정화',
  '戊': '무토', '己': '기토',
  '庚': '경금', '辛': '신금',
  '壬': '임수', '癸': '계수',
};

// 한자 지지 -> 앱에서 쓰는 한글 명칭 매핑
const ZHI_MAP: Record<string, string> = {
  '子': '자', '丑': '축', '寅': '인', '卯': '묘',
  '辰': '진', '巳': '사', '午': '오', '未': '미',
  '申': '신', '酉': '유', '戌': '술', '亥': '해',
};

export interface DayPillar {
  gan: string; // 갑목, 을목, ...
  zhi: string; // 자, 축, ...
}

/**
 * 양력 생년월일(YYYY-MM-DD)로부터 일주(日柱, 일간+일지)를 계산합니다.
 * 시(時)는 입력받지 않으므로 사주팔자 전체가 아니라 일주까지만 산출합니다.
 */
export function calcDayPillar(dateStr: string): DayPillar {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) throw new Error('날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)');
  const solar = Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();
  const ganHanja = lunar.getDayGan(); // 甲..癸
  const zhiHanja = lunar.getDayZhi(); // 子..亥
  const gan = GAN_MAP[ganHanja];
  const zhi = ZHI_MAP[zhiHanja];
  if (!gan) throw new Error(`일간 계산 결과를 매핑할 수 없습니다: ${ganHanja}`);
  if (!zhi) throw new Error(`일지 계산 결과를 매핑할 수 없습니다: ${zhiHanja}`);
  return { gan, zhi };
}

/** 하위 호환용 — 일간만 필요한 경우 */
export function calcDayGan(dateStr: string): string {
  return calcDayPillar(dateStr).gan;
}

export const ALL_GAN = Object.values(GAN_MAP);
export const ALL_ZHI = Object.values(ZHI_MAP);
