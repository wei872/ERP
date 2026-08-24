package com.erp.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import javax.annotation.PostConstruct;
import javax.crypto.SecretKey;

@Component
public class JwtUtil {
    /** 内置默认密钥：仅供本地开发。生产环境必须通过 JWT_SECRET 环境变量覆盖。 */
    public static final String DEFAULT_SECRET = "ERP-System-2024-Prod-Change-Me-In-Real-Env-!!!";

    @Value("${jwt.secret}")
    private String secret;
    @Value("${jwt.expiration:86400000}")
    private long expiration;
    @Value("${app.env:dev}")
    private String env;

    private SecretKey getKey() { return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)); }

    /** 启动即校验：生产环境下默认密钥 / 过短密钥直接拒绝启动，避免带着弱密钥上线。 */
    @PostConstruct
    public void validateSecret() {
        int len = secret == null ? 0 : secret.getBytes(StandardCharsets.UTF_8).length;
        if (len < 32) {
            throw new IllegalStateException("[安全] JWT_SECRET 长度不足 32 字节（HS256 最低要求），请通过环境变量设置强密钥");
        }
        if ("prod".equalsIgnoreCase(env) && DEFAULT_SECRET.equals(secret)) {
            throw new IllegalStateException("[安全] APP_ENV=prod 时禁止使用内置默认 JWT 密钥，请设置环境变量 JWT_SECRET 后重启");
        }
    }

    public String generate(Long userId, String username, String role) {
        return Jwts.builder().setSubject(username).claim("uid",userId).claim("rol",role)
            .setIssuedAt(new Date()).setExpiration(new Date(System.currentTimeMillis()+expiration))
            .signWith(getKey()).compact();
    }
    public boolean valid(String token) {
        try { Jwts.parserBuilder().setSigningKey(getKey()).build().parseClaimsJws(token); return true; }
        catch(Exception e) { return false; }
    }
    public String getUsername(String token) { return get(token).getSubject(); }
    public String getRole(String token) { return get(token).get("rol",String.class); }
    public Long getUserId(String token) { return get(token).get("uid",Long.class); }
    private Claims get(String t) { return Jwts.parserBuilder().setSigningKey(getKey()).build().parseClaimsJws(t).getBody(); }
}
