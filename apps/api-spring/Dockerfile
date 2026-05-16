FROM maven:3.9.9-eclipse-temurin-21 AS build

WORKDIR /workspace
COPY pom.xml .
RUN mvn -B -DskipTests dependency:go-offline
COPY src src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /workspace/target/resident-record-api-0.1.0.jar /app/resident-record-api.jar

ENV SERVER_PORT=8788
ENV CERT_FONT_SERIF_JP=/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc
ENV CERT_PDF_A=true

EXPOSE 8788
ENTRYPOINT ["java", "-jar", "/app/resident-record-api.jar"]
