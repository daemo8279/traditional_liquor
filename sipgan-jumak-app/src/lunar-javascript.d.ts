declare module 'lunar-javascript' {
  export class Lunar {
    getDayGan(): string;
    getDayGanIndex(): number;
  }
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    getLunar(): Lunar;
  }
}
