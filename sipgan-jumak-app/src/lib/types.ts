export type RawAxis =
  | '단맛' | '산미' | '향강도' | '바디' | '알코올감'
  | '청량감' | '곡물감' | '과실감' | '전통성' | '모험도';

export type DerivedAxis = '확장성' | '강렬성' | '안정성' | '정제감' | '유연성';

export type Axis = RawAxis | DerivedAxis;

export interface Liquor {
  id: string;
  name: string;
  maker: string;
  category: string;
  subtype: string;
  abv: number;
  region: string;
  mainIngredient: string;
  axes: Record<Axis, number>;
  aromaTag: string;
  tasteNote: string;
  banjuTag: string;
  situTag: string;
  situCategory: string[];
  banjuCategory: string[];
  accessibility: 'A' | 'B' | 'C' | string;
  reliability: string;
  verification: string;
  buyUrl: string;
  refUrl: string;
}

export interface TenganProfile {
  gan: string; // 갑목, 을목, ...
  hanja: string;
  element: string;
  yinyang: string;
  axes5: Record<DerivedAxis, number>;
  coreImage: string;
  traitPhrase: string;
  character: string;
}

export interface ZhiProfile {
  zhi: string; // 자, 축, ...
  hanja: string;
  animal: string;
  element: string;
  yinyang: string;
  axesOffset: Partial<Record<DerivedAxis, number>>;
  traitPhrase: string;
  desc: string;
}

export interface GanZhiProfile {
  label: string; // 병오, 병신 ...
  hanjaLabel: string; // 丙午 ...
  gan: TenganProfile;
  zhi: ZhiProfile;
  axes5: Record<DerivedAxis, number>; // 표시(레이더차트)용 — 1~5로 clamp
  weightAxes5: Record<DerivedAxis, number>; // 추천 알고리즘 가중치 계산용 — clamp 없이 그대로 사용(60갑자 간 충돌 방지)
  traitPhrase: string;
  character: string;
  coreImage: string;
}

export type SituLabel = '혼술' | '식사' | '데이트' | '모임·파티' | '특별한 날·선물';
export type BanjuLabel =
  | '전·튀김' | '육류·구이' | '해산물·회' | '치즈·디저트·과일' | '나물·두부·매콤한 안주' | '없음';

export interface TasteAnswers {
  T1: number; // 단맛 1~5
  T2: number; // 질감(바디) 1~5
  T3: number; // 향 스타일(곡물~과일) 1~5
  T4: number; // 알코올감 1~5
}

export interface SituAnswers {
  S1: SituLabel;
  S2: BanjuLabel[];
  S3: '가볍게' | '보통' | '진하게';
  S4: number; // 1~5
}
