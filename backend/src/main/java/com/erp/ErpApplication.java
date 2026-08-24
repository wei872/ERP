package com.erp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ErpApplication {
    public static void main(String[] args) {
        SpringApplication.run(ErpApplication.class, args);
        System.out.println("============================================");
        System.out.println("  ERP管理系统 v5.1 启动成功!");
        System.out.println("  API:      http://localhost:8080");
        System.out.println("  健康检查: GET /health");
        System.out.println("============================================");
    }
}
