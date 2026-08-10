package com.erp.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import javax.crypto.SecretKey;

@Component
public class JwtUtil {
    @Value("${jwt.secret}")
    private String secret;
    private final long expiration = 86400000L;
    private SecretKey getKey() { return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)); }

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
