/** 人民币金额转中文大写（财务单据套打用） */
export function toChineseAmount(input: number): string {
  if (!Number.isFinite(input)) return '';
  const digits = '零壹贰叁肆伍陆柒捌玖';
  const units = ['', '拾', '佰', '仟'];
  const bigUnits = ['', '万', '亿', '万亿'];
  const neg = input < 0;
  const n = Math.abs(input);
  const intPart = Math.floor(n);
  const dec = Math.round((n - intPart) * 100);
  const jiao = Math.floor(dec / 10);
  const fen = dec % 10;

  let intStr = '';
  if (intPart === 0) {
    intStr = '零';
  } else {
    const s = String(intPart);
    const groups: string[] = [];
    for (let i = s.length; i > 0; i -= 4) groups.unshift(s.slice(Math.max(0, i - 4), i));
    intStr = groups.map((g, gi) => {
      let seg = '';
      let zeroFlag = false;
      let allZero = true;
      for (let i = 0; i < g.length; i++) {
        const d = Number(g[i]);
        const unit = units[g.length - 1 - i];
        if (d === 0) {
          zeroFlag = true;
        } else {
          if (zeroFlag) seg += '零';
          seg += digits[d] + unit;
          zeroFlag = false;
          allZero = false;
        }
      }
      return allZero ? '' : seg + bigUnits[groups.length - 1 - gi];
    }).join('');
    if (!intStr) intStr = '零';
  }

  let result = intStr + '元';
  if (jiao === 0 && fen === 0) {
    result += '整';
  } else {
    if (jiao > 0) result += digits[jiao] + '角';
    else if (fen > 0 && intPart > 0) result += '零';
    if (fen > 0) result += digits[fen] + '分';
  }
  return (neg ? '负' : '') + result;
}
