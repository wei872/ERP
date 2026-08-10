package com.erp.security;

import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import javax.servlet.*;
import javax.servlet.http.*;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;

@Component
public class JwtFilter extends OncePerRequestFilter {
    private final JwtUtil jwtUtil;
    private static final List<String> PUBLIC = Arrays.asList("/auth/login","/auth/register","/auth/all-modules");
    public JwtFilter(JwtUtil u) { this.jwtUtil = u; }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String path = req.getServletPath();
        if (PUBLIC.stream().anyMatch(path::startsWith)) { chain.doFilter(req,res); return; }
        String h = req.getHeader("Authorization");
        if (h != null && h.startsWith("Bearer ")) {
            String t = h.substring(7);
            if (jwtUtil.valid(t)) {
                req.setAttribute("uid", jwtUtil.getUserId(t));
                req.setAttribute("user", jwtUtil.getUsername(t));
                req.setAttribute("role", jwtUtil.getRole(t));
                chain.doFilter(req, res);
                return;
            }
        }
        res.setStatus(401);
        res.setContentType("application/json;charset=UTF-8");
        res.getWriter().write("{\"success\":false,\"message\":\"未登录或Token已过期\"}");
    }
}
