# 单容器：server 托管 web 静态产物。构建上下文为仓库根目录。
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN yarn install --immutable
COPY packages ./packages
COPY apps ./apps
COPY tsconfig.base.json ./
RUN yarn workspace @riichi/web build && yarn workspace @riichi/server build

# 运行时：server 产物已把依赖打包进去，只有 wasm 引擎作为外部模块
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data WEB_DIST=/app/web
COPY --from=build /app/node_modules/riichi-rs-node ./node_modules/riichi-rs-node
COPY --from=build /app/apps/server/dist ./server
COPY --from=build /app/apps/web/dist ./web
COPY apps/server/docker-entrypoint.sh /usr/local/bin/riichi-entrypoint
# 入口以 root 把数据卷（可能是旧版镜像以 root 建的）交给 node 用户，再用 su-exec 降权运行
RUN apk add --no-cache su-exec && chmod +x /usr/local/bin/riichi-entrypoint
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- -Y off http://127.0.0.1:8787/health || exit 1
ENTRYPOINT ["riichi-entrypoint"]
CMD ["node", "server/index.js"]
