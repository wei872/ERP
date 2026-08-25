package com.erp.config;

/**
 * 公司（账套）请求上下文：JwtFilter 从 X-Company-Code 请求头写入，
 * 凭证生成 / 科目余额 / 报表聚合等按当前公司隔离，请求结束后清理防止线程复用串账。
 */
public class CompanyContext {
    private static final ThreadLocal<String> CTX = new ThreadLocal<>();

    public static void set(String companyCode) {
        CTX.set(companyCode == null || companyCode.trim().isEmpty() ? "HQ" : companyCode.trim());
    }

    public static String get() {
        String c = CTX.get();
        return c == null || c.isEmpty() ? "HQ" : c;
    }

    public static void clear() {
        CTX.remove();
    }
}
