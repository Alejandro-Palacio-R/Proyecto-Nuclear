FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace

COPY pom.xml .
RUN mvn -B dependency:go-offline

COPY src ./src
RUN mvn -B package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /app

COPY --from=build /workspace/target/*.jar app.jar

EXPOSE 8080
RUN useradd --system --create-home --shell /usr/sbin/nologin appuser
USER appuser

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
