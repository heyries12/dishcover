FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Dishcover.Api.csproj ./
RUN dotnet restore Dishcover.Api.csproj

COPY . ./
RUN dotnet publish Dishcover.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish ./

ENV ASPNETCORE_URLS=http://0.0.0.0:10000
EXPOSE 10000

USER $APP_UID
ENTRYPOINT ["dotnet", "Dishcover.Api.dll"]
