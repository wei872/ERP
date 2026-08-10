package com.erp.config;

import com.erp.security.JwtFilter;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Bean
    public FilterRegistrationBean<JwtFilter> jwtFilterReg(JwtFilter f) {
        FilterRegistrationBean<JwtFilter> b = new FilterRegistrationBean<>(f);
        b.addUrlPatterns("/*");
        b.setOrder(1);
        return b;
    }
}
