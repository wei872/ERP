# ── 多阶段构建：镜像内完成 Maven 打包（无需先在宿主机 mvn package） ──
FROM maven:3.8.6-openjdk-8 AS build
WORKDIR /build
COPY pom.xml ./
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q clean package -Dmaven.test.skip=true

# ── 运行镜像：仅 JRE，体积更小 ──
FROM eclipse-temurin:8-jre-alpine
RUN addgroup -S erp && adduser -S erp -G erp && mkdir -p /app/logs && chown -R erp:erp /app
WORKDIR /app
COPY --from=build /build/target/erp-system-*.jar app.jar
USER erp
EXPOSE 8080
# 容器内探活（busybox wget 可用）
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health | grep -q '"status"' || exit 1
ENTRYPOINT ["java","-XX:MaxRAMPercentage=75.0","-jar","app.jar"]
