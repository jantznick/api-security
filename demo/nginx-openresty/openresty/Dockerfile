# OpenResty image with API Glimpse Lua sampler + lua-resty-http
FROM openresty/openresty:1.25.3.2-0-alpine

RUN opm get ledgetech/lua-resty-http

COPY connectors/nginx/apiglimpse.lua /etc/nginx/lua/apiglimpse.lua
COPY connectors/nginx/redaction.lua /etc/nginx/lua/redaction.lua
COPY demo/nginx-openresty/openresty/nginx.conf /usr/local/openresty/nginx/conf/nginx.conf

EXPOSE 80
