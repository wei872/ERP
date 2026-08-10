package com.erp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ErpApplication {
    public static void main(String[] args) {
        SpringApplication.run(ErpApplication.class, args);
        System.out.println("============================================");
        System.out.println("  ERP管理系统 v5.0 启动成功!");
        System.out.println("  http://192.168.123.91:8080");
        System.out.println("  Auth: 数据库 sys_user 表");
        System.out.println("  Data: 自动建表 + 出库减库存 + 应收生成");
        System.out.println("============================================");
    }
}
