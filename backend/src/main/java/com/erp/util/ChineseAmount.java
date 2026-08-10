package com.erp.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class ChineseAmount {
    private static final String[] CN_NUM = {"零","壹","贰","叁","肆","伍","陆","柒","捌","玖"};
    private static final String[] CN_UNIT = {"","拾","佰","仟"};
    private static final String[] CN_SECTION = {"","万","亿"};

    private ChineseAmount() {}

    public static String toChinese(BigDecimal amount) {
        if (amount == null) return "零元整";
        boolean neg = amount.signum() < 0;
        amount = amount.abs().setScale(2, RoundingMode.HALF_UP);
        if (amount.compareTo(BigDecimal.ZERO) == 0) return "零元整";
        long yuan = amount.longValue();
        int jiao = amount.remainder(BigDecimal.ONE).movePointRight(2).intValue() / 10;
        int fen = amount.remainder(BigDecimal.ONE).movePointRight(2).intValue() % 10;
        StringBuilder sb = new StringBuilder();
        if (neg) sb.append("负");
        if (yuan == 0) {
            sb.append("零元");
        } else {
            sb.append(sectionToChinese(yuan)).append("元");
        }
        if (jiao == 0 && fen == 0) {
            sb.append("整");
        } else {
            if (jiao > 0) sb.append(CN_NUM[jiao]).append("角");
            else if (fen > 0) sb.append("零");
            if (fen > 0) sb.append(CN_NUM[fen]).append("分");
        }
        return sb.toString();
    }

    public static String toChinese(Object v) {
        if (v == null) return "零元整";
        try { return toChinese(new BigDecimal(v.toString())); }
        catch (Exception e) { return "零元整"; }
    }

    private static String sectionToChinese(long n) {
        if (n == 0) return CN_NUM[0];
        StringBuilder sb = new StringBuilder();
        int sectionIdx = 0;
        boolean needZero = false;
        while (n > 0) {
            int section = (int)(n % 10000);
            if (section != 0) {
                String part = fourDigits(section);
                if (needZero) sb.insert(0, CN_NUM[0]);
                sb.insert(0, part + CN_SECTION[sectionIdx]);
                needZero = section < 1000 && n >= 10000;
            } else {
                needZero = sb.length() > 0;
            }
            n /= 10000;
            sectionIdx++;
        }
        return sb.toString();
    }

    private static String fourDigits(int n) {
        StringBuilder sb = new StringBuilder();
        boolean zero = false;
        for (int i = 0; i < 4; i++) {
            int d = n / (int)Math.pow(10, 3 - i) % 10;
            if (d == 0) {
                zero = true;
            } else {
                if (zero) { sb.append(CN_NUM[0]); zero = false; }
                sb.append(CN_NUM[d]).append(CN_UNIT[3 - i]);
            }
        }
        return sb.toString();
    }
}
