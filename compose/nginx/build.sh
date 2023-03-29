#!/usr/bin/env sh

echo "start building nginx config"

if [ -z "$FRONTEND_URL" ]; then
    echo "Need to set FRONTEND_URL"
    exit 1
fi

echo "replacing __FRONTEND_URL__"
sed -i -e "s/__FRONTEND_URL__/$FRONTEND_URL/g" /etc/nginx/conf.d/default.conf

if [ -z "$FXP1_URL" ]; then
    echo "Need to set FXP1_URL"
    exit 1
fi

echo "replacing __FXP1_URL__"
sed -i -e "s/__FXP1_URL__/$FXP1_URL/g" /etc/nginx/conf.d/default.conf

if [ -z "$FXP2_URL" ]; then
    echo "Need to set FXP2_URL"
    exit 1
fi

echo "replacing __FXP2_URL__"
sed -i -e "s/__FXP2_URL__/$FXP2_URL/g" /etc/nginx/conf.d/default.conf

if [ -z "$PSP_URL" ]; then
    echo "Need to set PSP_URL"
    exit 1
fi

echo "replacing __PSP_URL__"
sed -i -e "s/__PSP_URL__/$PSP_URL/g" /etc/nginx/conf.d/default.conf

if [ -z "$HUB_URL" ]; then
    echo "Need to set HUB_URL"
    exit 1
fi

echo "replacing __HUB_URL__"
sed -i -e "s/__HUB_URL__/$HUB_URL/g" /etc/nginx/conf.d/default.conf

if [ -z "$JSON_RPC_PROVIDER_URL" ]; then
    echo "Need to set JSON_RPC_PROVIDER_URL"
    exit 1
fi

echo "replacing __JSON_RPC_PROVIDER_URL__"
sed -i -e "s/__JSON_RPC_PROVIDER_URL__/$JSON_RPC_PROVIDER_URL/g" /etc/nginx/conf.d/default.conf

if [ -z "$BLOCKSCOUT_URL" ]; then
    echo "Need to set __BLOCKSCOUT_URL__"
    exit 1
fi

echo "replacing __BLOCKSCOUT_URL__"
sed -i -e "s/__BLOCKSCOUT_URL__/$BLOCKSCOUT_URL/g" /etc/nginx/conf.d/default.conf

RPC_HEADER=$(head -n 1 /run/secrets/rpc_header)

if [ -z "$RPC_HEADER" ]; then
    echo "Need to set RPC_HEADER"
    exit 1
fi

echo "replacing __RPC_HEADER__"
sed -i -e "s/__RPC_HEADER__/$RPC_HEADER/g" /etc/nginx/conf.d/default.conf

echo "finished building nginx config"

nginx -g 'daemon off;'