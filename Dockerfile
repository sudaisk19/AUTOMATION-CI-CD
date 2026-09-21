FROM mcr.microsoft.com/playwright:v1.62.1-noble

ENV TZ=Asia/Karachi \
    CI=true

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN rm -f auth.json

CMD ["npx", "playwright", "test", \
     "--project=chromium", "--project=login-tests", "--project=time-serial"]

